import { getTenantModels } from "@/lib/tenantDb";
import { NextRequest, NextResponse } from "next/server";
import { checkPermissionWithSession } from "@/lib/rbac";
import { sendWhatsApp } from "@/lib/fonnte";
import { decryptFonnteToken } from "@/lib/encryption";
import { normalizeIndonesianPhone } from "@/lib/phone";
import { logActivity } from "@/lib/logger";
import { getStoreIdBySlug } from "@/lib/subscriptionEnforcement";
import { getWaProviderConfigFromSettings, getWaProviderConfigForPurpose } from "@/lib/waProvider";

function formatCurrency(amount: number): string {
    return `Rp${(amount || 0).toLocaleString('id-ID')}`;
}

export async function POST(request: NextRequest, props: any) {
    const tenantSlug = request.headers.get('x-store-slug') || 'pusat';
    const { Invoice, Settings, Customer } = await getTenantModels(tenantSlug);

    try {
        const { error: permissionError } = await checkPermissionWithSession(request, 'pos', 'view');
        if (permissionError) return permissionError;

        const { id } = await props.params;
        const body = await request.json();
        const { target } = body; // 'customer' | 'admin'

        if (!target || !['customer', 'admin'].includes(target)) {
            return NextResponse.json({ success: false, error: "Target harus 'customer' atau 'admin'" }, { status: 400 });
        }

        const invoice: any = await Invoice.findById(id)
            .populate('customer', 'name phone publicToken')
            .populate('staff', 'name')
            .populate('staffAssignments.staff', 'name')
            .lean();

        if (!invoice) {
            return NextResponse.json({ success: false, error: 'Invoice tidak ditemukan' }, { status: 404 });
        }

        const settings: any = await Settings.findOne({}).lean();

        const waSendConfig = getWaProviderConfigForPurpose(settings, 'notification');

        // Build items text
        const itemsText = (invoice.items || [])
            .map((item: any) => {
                const desc = String(item.description || '').trim();
                const line = `• ${item.name} x${item.quantity} = ${formatCurrency(item.total)}`;
                return desc ? `${line}\n  ${desc}` : line;
            })
            .join('\n');

        const change = Math.max(0, (invoice.amountPaid || 0) - (invoice.totalAmount || 0));
        const invoiceDate = new Date(invoice.date);
        const dateStr = invoiceDate.toLocaleDateString('id-ID', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
        });

        // Get staff name from staffAssignments or staff field
        const staffName = invoice.staffAssignments?.[0]?.staff?.name 
            || invoice.staff?.name 
            || '-';

        // Build message from template
        const DEFAULT_NOTA_TEMPLATE = '🧾 *NOTA TRANSAKSI*\n*{{storeName}}*\n{{storeAddress}}\n\nNo: {{invoiceNumber}}\nTanggal: {{date}}\nKasir: {{staffName}}\n\n{{items}}\n\nSubtotal: {{subtotal}}\nDiskon: {{discount}}\n*TOTAL: {{total}}*\nBayar: {{amountPaid}}\nKembalian: {{change}}\n\nTerima kasih, {{customerName}}! 🙏\n{{receiptFooter}}';

        let message = settings?.waNotaTemplate || DEFAULT_NOTA_TEMPLATE;
        message = message
            .replace(/\{\{storeName\}\}/g, settings?.storeName || '')
            .replace(/\{\{storeAddress\}\}/g, settings?.address || '')
            .replace(/\{\{invoiceNumber\}\}/g, invoice.invoiceNumber || '')
            .replace(/\{\{date\}\}/g, dateStr)
            .replace(/\{\{staffName\}\}/g, staffName)
            .replace(/\{\{items\}\}/g, itemsText)
            .replace(/\{\{subtotal\}\}/g, formatCurrency(invoice.subtotal))
            .replace(/\{\{discount\}\}/g, formatCurrency(invoice.discount || 0))
            .replace(/\{\{total\}\}/g, formatCurrency(invoice.totalAmount))
            .replace(/\{\{amountPaid\}\}/g, formatCurrency(invoice.amountPaid))
            .replace(/\{\{change\}\}/g, formatCurrency(change))
            .replace(/\{\{customerName\}\}/g, invoice.customer?.name || 'Pelanggan')
            .replace(/\{\{receiptFooter\}\}/g, settings?.receiptFooter || '');

        // Add portal link for customer
        if (target === 'customer' && invoice.customer?.publicToken) {
            const baseUrl = process.env.NEXTAUTH_URL || '';
            message += `\n\n📱 Lihat riwayat kunjungan Anda:\n${baseUrl}/${tenantSlug}/portal/${invoice.customer.publicToken}`;
        }

        // Add admin prefix
        if (target === 'admin') {
            message = (settings?.waAdminNotaPrefix || '📋 *LAPORAN TRANSAKSI BARU*\n') + message;
        }

        // Determine phone number
        let phone = '';
        if (target === 'customer') {
            phone = normalizeIndonesianPhone(invoice.customer?.phone || '');
        } else {
            phone = normalizeIndonesianPhone(settings?.waAdminNumber || '');
        }

        if (!phone) {
            return NextResponse.json({
                success: false,
                error: target === 'customer'
                    ? 'Nomor HP customer tidak tersedia'
                    : 'Nomor WA Admin belum diatur di Settings'
            }, { status: 400 });
        }

        const storeId = await getStoreIdBySlug(tenantSlug);
        const waResult = await sendWhatsApp(phone, message, waSendConfig, storeId ?? undefined);

        if (waResult.blocked) {
            return NextResponse.json(
                { success: false, error: waResult.error, code: 'WA_QUOTA_EXCEEDED', quota: waResult.quota },
                { status: 403 }
            );
        }

        if (!waResult.success) {
            return NextResponse.json(
                { success: false, error: waResult.error || 'Gagal mengirim pesan melalui provider WA' },
                { status: 400 }
            );
        }

        await logActivity({
            req: request,
            action: 'create',
            resource: 'WA Nota',
            resourceId: id,
            details: `Sent WA nota for Invoice ${invoice.invoiceNumber} to ${target}: ${phone}`
        });

        return NextResponse.json({
            success: true,
            message: `Nota berhasil dikirim ke ${target === 'customer' ? 'Customer' : 'Admin'} via WA`
        });
    } catch (error: any) {
        console.error('[WA Nota] Error:', error);
        return NextResponse.json({ success: false, error: 'Gagal mengirim nota via WA' }, { status: 500 });
    }
}
