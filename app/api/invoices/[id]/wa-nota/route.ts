import { NextResponse } from 'next/server';
import { getTenantModels } from '@/lib/tenantDb';
import { checkPermissionWithSession } from '@/lib/rbac';
import { sendWhatsApp } from '@/lib/fonnte';
import { decryptFonnteToken } from '@/lib/encryption';
import { normalizeIndonesianPhone } from '@/lib/phone';
import crypto from 'crypto';

async function compileWaNotaData(id: string, tenantSlug: string, request: Request) {
  const { Invoice, Settings, ShortLink, PackageUsageLedger, Customer } = await getTenantModels(tenantSlug);
  
  const invoice = await Invoice.findById(id).populate('customer');
  if (!invoice) {
    return { success: false, error: 'Invoice not found', status: 404 };
  }

  if (invoice.customer && !invoice.customer.publicToken) {
    const { randomUUID } = require('crypto');
    invoice.customer.publicToken = randomUUID();
    await Customer.updateOne({ _id: invoice.customer._id }, { publicToken: invoice.customer.publicToken });
  }

  const settings: any = await Settings.findOne();
  if (!settings) {
    return { success: false, error: 'Settings not found', status: 400 };
  }

  const { getWaProviderConfigFromSettings, getWaProviderConfigForPurpose } = require('@/lib/waProvider');
  const waConfig = getWaProviderConfigForPurpose(settings, 'notification');

  const formatRupiah = (num: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: settings.currency || 'IDR' }).format(num || 0);

  const customerName = invoice.customer?.name || 'Pelanggan';
  const storeName = settings.storeName || 'Salon';
  const storeAddress = settings.address || '';
  const invoiceNumber = invoice.invoiceNumber;
  const dateStr = new Date(invoice.createdAt || new Date()).toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Jakarta' }).replace(/\./g, ':');
  const showStaff = settings.showStaffOnReceipt !== false;
  const staffName = showStaff
      ? (invoice.staff?.name || invoice.staffAssignments?.[0]?.staff?.name || 'Kasir')
      : '';
  
  const subtotal = formatRupiah(invoice.subtotal);
  const discount = formatRupiah(invoice.discount);
  const totalAmount = formatRupiah(invoice.totalAmount);
  const amountPaid = formatRupiah(invoice.amountPaid);
  const changeAmount = formatRupiah(Math.max(0, (invoice.amountPaid || 0) - invoice.totalAmount));
  
  const paymentMethod = invoice.paymentMethods?.map((pm: any) => pm.method).join(', ') || invoice.paymentMethod || 'Unknown';
  const receiptFooter = settings.receiptFooter || '';

  let itemsText = '';
  if (invoice.items && Array.isArray(invoice.items)) {
    itemsText = invoice.items.map((item: any) => {
      const desc = String(item.description || '').trim();
      const line = `${item.quantity}x ${item.name}`;
      return desc
        ? `${line}\n   ${desc}\n   ${formatRupiah(item.price * item.quantity)}`
        : `${line}\n   ${formatRupiah(item.price * item.quantity)}`;
    }).join('\n');
  }

  let message = settings.waNotaTemplate || 'Halo {customer_name}, terima kasih telah berkunjung ke {store_name}. Berikut adalah nota transaksi Anda: {invoice_number} sebesar {total_amount}.';
  
  // Support both {single} and {{double}} brace placeholders
  message = message
    .replace(/\{\{?customer_name\}?\}/g, customerName)
    .replace(/\{\{?customerName\}?\}/g, customerName)
    .replace(/\{\{?store_name\}?\}/g, storeName)
    .replace(/\{\{?storeName\}?\}/g, storeName)
    .replace(/\{\{?store_address\}?\}/g, storeAddress)
    .replace(/\{\{?storeAddress\}?\}/g, storeAddress)
    .replace(/\{\{?invoice_number\}?\}/g, invoiceNumber)
    .replace(/\{\{?invoiceNumber\}?\}/g, invoiceNumber)
    .replace(/\{\{?date\}?\}/g, dateStr)
    .replace(/\{\{?staff_name\}?\}/g, staffName)
    .replace(/\{\{?staffName\}?\}/g, staffName)
    .replace(/\{\{?items\}?\}/g, itemsText)
    .replace(/\{\{?subtotal\}?\}/g, subtotal)
    .replace(/\{\{?discount\}?\}/g, discount)
    .replace(/\{\{?total_amount\}?\}/g, totalAmount)
    .replace(/\{\{?total\}?\}/g, totalAmount)
    .replace(/\{\{?amount_paid\}?\}/g, amountPaid)
    .replace(/\{\{?amountPaid\}?\}/g, amountPaid)
    .replace(/\{\{?change\}?\}/g, changeAmount)
    .replace(/\{\{?payment_method\}?\}/g, paymentMethod)
    .replace(/\{\{?receipt_footer\}?\}/g, receiptFooter)
    .replace(/\{\{?receiptFooter\}?\}/g, receiptFooter);

  // Clean up empty staff lines when showStaffOnReceipt is off
  if (!showStaff) {
    message = message.replace(/^.*(?:Kasir|Staff|staff_name|staffName).*:\s*\n?/gm, '');
  }

  // === Tambah 3 Transaksi Terakhir & Riwayat Pemakaian Paket ===
  if (invoice.customer?._id) {
    // 3 Transaksi Terakhir
    const recentInvoices = await Invoice.find({
      customer: invoice.customer._id,
      status: { $nin: ['cancelled', 'voided'] }
    })
      .select('invoiceNumber date totalAmount')
      .sort({ date: -1 })
      .limit(3)
      .lean();

    if (recentInvoices.length > 0) {
      const txLines = recentInvoices.map((inv: any, i: number) => {
        const d = new Date(inv.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
        return `${i + 1}. ${d} — ${inv.invoiceNumber} — ${formatRupiah(inv.totalAmount)}`;
      }).join('\n');
      message += `\n\n━━━━━━━━━━━━━━━━\n📋 *3 TRANSAKSI TERAKHIR:*\n${txLines}`;
    }

    // Riwayat Pemakaian Paket (semua)
    const usages = await PackageUsageLedger.find({
      customer: invoice.customer._id
    })
      .populate('customerPackage', 'packageName')
      .sort({ usedAt: -1 })
      .lean();

    if (usages.length > 0) {
      const usageLines = usages.map((u: any) => {
        const d = new Date(u.usedAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
        const pkgName = u.customerPackage?.packageName || 'Paket';
        return `• ${d} — ${pkgName} (${u.serviceName}) — ${u.quantity}x`;
      }).join('\n');
      message += `\n\n📦 *RIWAYAT PEMAKAIAN PAKET:*\n${usageLines}\n━━━━━━━━━━━━━━━━`;
    }
  }

  let customerMessage = message;
  let adminMessage = `${settings.waAdminNotaPrefix || '[NOTIFIKASI ADMIN]'}\n\n${message}`;

  const customerPhone = invoice.customer?.phone ? normalizeIndonesianPhone(invoice.customer.phone) : null;
  const adminPhone = settings.waAdminNumber ? normalizeIndonesianPhone(settings.waAdminNumber) : null;

  if (customerPhone && invoice.customer?.publicToken) {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || `https://${request.headers.get('host') || 'kikyrestu.vercel.app'}`;
    const targetUrl = `${baseUrl}/${tenantSlug}/portal/${invoice.customer.publicToken}/invoice/${invoice._id}`;
    const historyUrl = `${baseUrl}/${tenantSlug}/portal/${invoice.customer.publicToken}`;
    
    let shortCode = '';
    let historyShortCode = '';
    let attempts = 0;
    
    while (!shortCode && attempts < 5) {
      const code = crypto.randomBytes(3).toString('hex');
      const exists = await ShortLink.findOne({ code });
      if (!exists) shortCode = code;
      attempts++;
    }

    attempts = 0;
    while (!historyShortCode && attempts < 5) {
      const code = crypto.randomBytes(3).toString('hex');
      const exists = await ShortLink.findOne({ code });
      if (!exists) historyShortCode = code;
      attempts++;
    }
    
    if (shortCode) {
      await ShortLink.create({ code: shortCode, targetUrl });
      customerMessage += `\n\n🧾 *Lihat Nota Digital Anda:*\n${baseUrl}/${tenantSlug}/r/${shortCode}`;
    } else {
      customerMessage += `\n\n🧾 *Lihat Nota Digital Anda:*\n${targetUrl}`;
    }

    if (historyShortCode) {
      await ShortLink.create({ code: historyShortCode, targetUrl: historyUrl });
      customerMessage += `\n\n👤 *Lihat Riwayat Transaksi & Sisa Paket:*\n${baseUrl}/${tenantSlug}/r/${historyShortCode}`;
    } else {
      customerMessage += `\n\n👤 *Lihat Riwayat Transaksi & Sisa Paket:*\n${historyUrl}`;
    }
  }

  // === Tambah CTA Feedback & Rating Angka Cepat untuk membuka jendela 24-Jam WABA ===
  if (customerPhone) {
    customerMessage += `\n\n━━━━━━━━━━━━━━━━\n💬 *BAGAIMANA PELAYANAN KAMI HARI INI?*\n\nBalas *5* = ⭐⭐⭐⭐⭐ Sangat Puas! 😍\nBalas *4* = ⭐⭐⭐⭐ Puas 🙂\nBalas *1* = 🤔 Ada Saran / Keluhan\n\n*(Balas chat ini agar kami bisa terus mengirimkan promo VIP & pengingat jadwal treatment Kakak berikutnya)*`;
  }

  return {
    success: true,
    invoice,
    settings,
    waConfig,
    customerPhone,
    adminPhone,
    customerMessage,
    adminMessage
  };
}

export async function GET(
  request: Request,
  props: any
) {
  try {
    const { id } = await props.params;
    const tenantSlug = request.headers?.get?.('x-store-slug') || 'pusat';
    const { error: permissionError, session } = await checkPermissionWithSession(request as any, 'invoices', 'view');
    if (permissionError) return permissionError;
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const data = await compileWaNotaData(id, tenantSlug, request);
    if (!data.success) {
      return NextResponse.json({ success: false, error: data.error }, { status: data.status || 400 });
    }

    if (!data.customerPhone) {
      return NextResponse.json({ success: false, error: 'Pelanggan tidak memiliki nomor WhatsApp yang valid.' }, { status: 400 });
    }

    const waUrl = `https://wa.me/${data.customerPhone}?text=${encodeURIComponent(data.customerMessage || '')}`;

    return NextResponse.json({
      success: true,
      phone: data.customerPhone,
      message: data.customerMessage,
      waUrl
    });
  } catch (error: any) {
    console.error('Error preparing WA Nota GET:', error);
    return NextResponse.json({ success: false, error: error.message || 'Gagal menyiapkan pesan WA' }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  props: any
) {
  try {
    const { id } = await props.params;
    const tenantSlug = request.headers?.get?.('x-store-slug') || 'pusat';
    const { error: permissionError, session } = await checkPermissionWithSession(request as any, 'invoices', 'view');
    if (permissionError) return permissionError;
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const data = await compileWaNotaData(id, tenantSlug, request);
    if (!data.success) {
      return NextResponse.json({ success: false, error: data.error }, { status: data.status || 400 });
    }

    if (!data.waConfig || (data.waConfig.provider === 'fonnte' && !data.waConfig.fonnteToken)) {
      return NextResponse.json({ success: false, error: 'WA Provider not configured. Silakan isi konfigurasi WA di Settings.' }, { status: 400 });
    }

    let sentToCustomer = false;
    let sentToAdmin = false;
    let lastWaError = '';

    // Send to customer
    if (data.customerPhone) {
      const result = await sendWhatsApp(data.customerPhone, data.customerMessage!, data.waConfig);
      if (result.success) {
        sentToCustomer = true;
      } else {
        console.error('[WA Nota] Customer send failed:', result.error);
        lastWaError = result.error || 'Customer send failed';
      }
    }

    // Send to admin (only if different from customer to avoid double sending during testing)
    if (data.adminPhone) {
      if (data.adminPhone !== data.customerPhone) {
        const result = await sendWhatsApp(data.adminPhone, data.adminMessage!, data.waConfig);
        if (result.success) {
          sentToAdmin = true;
        } else {
          console.error('[WA Nota] Admin send failed:', result.error);
          if (!sentToCustomer) lastWaError = result.error || 'Admin send failed';
        }
      } else if (data.adminPhone === data.customerPhone) {
        sentToAdmin = true; // Mark as sent to avoid error response
      }
    }

    if (!sentToCustomer && !sentToAdmin) {
      return NextResponse.json({ success: false, error: lastWaError || 'Gagal mengirim WA. Pastikan nomor tujuan valid.' }, { status: 400 });
    }

    return NextResponse.json({ 
      success: true, 
      message: `Nota WA berhasil dikirim${sentToCustomer ? ' ke customer' : ''}${sentToCustomer && sentToAdmin ? ' dan' : ''}${sentToAdmin ? ' ke admin' : ''}` 
    });

  } catch (error: any) {
    console.error('Error sending WA Nota POST:', error);
    return NextResponse.json({ success: false, error: error.message || 'Gagal mengirim WA Nota' }, { status: 500 });
  }
}

