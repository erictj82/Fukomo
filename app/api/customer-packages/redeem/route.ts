import { getTenantModels } from "@/lib/tenantDb";
import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { checkPermission } from '@/lib/rbac';


interface RedeemItem {
  customerPackageId: string;
  serviceId: string;
  quantity: number;
  serviceName?: string;
}

interface ServiceQuotaEntry {
  service: mongoose.Types.ObjectId;
  serviceName: string;
  totalQuota: number;
  usedQuota: number;
  remainingQuota: number;
}

export async function POST(request: NextRequest, props: any) {
    const tenantSlug = request.headers.get('x-store-slug') || 'pusat';
    const { CustomerPackage, PackageUsageLedger, Invoice, Appointment } = await getTenantModels(tenantSlug);

  try {
    const permissionError = await checkPermission(request, 'invoices', 'create');
    if (permissionError) return permissionError;

    
    

    const body = await request.json();
    const { customerId, invoiceId, items, note } = body as {
      customerId: string;
      invoiceId?: string;
      items: RedeemItem[];
      note?: string;
    };

    if (!customerId || !mongoose.Types.ObjectId.isValid(customerId)) {
      return NextResponse.json({ success: false, error: 'Valid customerId is required' }, { status: 400 });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ success: false, error: 'Redeem items are required' }, { status: 400 });
    }

    if (invoiceId) {
      const invoice = await Invoice.findById(invoiceId);
      if (invoice?.appointment) {
        const apt = await Appointment.findById(invoice.appointment);
        if (apt && ['cancelled', 'no-show'].includes(apt.status)) {
          return NextResponse.json(
            { success: false, error: 'Paket tidak boleh dipotong untuk appointment yang dibatalkan atau no-show.' },
            { status: 400 }
          );
        }
      }
    }

    for (const item of items) {
      if (!item.customerPackageId || !mongoose.Types.ObjectId.isValid(item.customerPackageId)) {
        return NextResponse.json({ success: false, error: 'Invalid customerPackageId' }, { status: 400 });
      }
      if (!item.serviceId || !mongoose.Types.ObjectId.isValid(item.serviceId)) {
        return NextResponse.json({ success: false, error: 'Invalid serviceId' }, { status: 400 });
      }
      if (!item.quantity || Number(item.quantity) <= 0) {
        return NextResponse.json({ success: false, error: 'quantity must be greater than 0' }, { status: 400 });
      }
    }

    const createdLedger: unknown[] = [];

    for (const redeemItem of items) {
      const pkg = await CustomerPackage.findOne({
        _id: redeemItem.customerPackageId,
        customer: customerId,
        status: { $in: ['active', 'depleted'] },
      });

      if (!pkg) {
        return NextResponse.json({ success: false, error: 'Customer package not found' }, { status: 404 });
      }

      const quota = pkg.serviceQuotas.find((entry: ServiceQuotaEntry) => String(entry.service) === String(redeemItem.serviceId));
      if (!quota) {
        return NextResponse.json({ success: false, error: `Service not found in package ${pkg.packageName}` }, { status: 400 });
      }

      const qty = Number(redeemItem.quantity);
      if (quota.remainingQuota < qty) {
        return NextResponse.json({ success: false, error: `Insufficient quota for ${quota.serviceName}. Remaining: ${quota.remainingQuota}` }, { status: 400 });
      }

      quota.usedQuota += qty;
      quota.remainingQuota -= qty;

      const hasRemaining = pkg.serviceQuotas.some((entry: ServiceQuotaEntry) => Number(entry.remainingQuota) > 0);
      pkg.status = hasRemaining ? 'active' : 'depleted';
      await pkg.save();

      const ledger = await PackageUsageLedger.create({
        customer: customerId,
        customerPackage: pkg._id,
        package: pkg.package,
        service: redeemItem.serviceId,
        serviceName: redeemItem.serviceName || quota.serviceName,
        quantity: qty,
        invoice: invoiceId,
        sourceType: 'package_redeem',
        note: note || 'Redeem from POS transaction',
      });

      createdLedger.push(ledger);
    }

    return NextResponse.json({ success: true, data: createdLedger });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to redeem package quota';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
