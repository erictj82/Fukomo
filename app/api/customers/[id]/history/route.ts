import { getTenantModels } from "@/lib/tenantDb";
import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { checkPermission } from '@/lib/rbac';


interface CustomerInfo {
  _id: string;
  name: string;
  phone?: string;
  email?: string;
}

interface InvoiceHistoryItem {
  _id: string;
  invoiceNumber: string;
  date?: Date;
  totalAmount: number;
  amountPaid: number;
  status: string;
  paymentMethod: string;
  sourceType: string;
  createdAt: Date;
}

interface PackageOrderHistoryItem {
  _id: string;
  amount?: number;
  totalAmount: number;
  orderNumber?: string;
  status: string;
  paymentMethod?: string;
  paidAt?: Date;
  createdAt: Date;
  packageSnapshot?: {
    name?: string;
    code?: string;
  };
  invoice?: any;
  invoiceNumber?: string;
  packageName?: string;
}

interface PackageUsageHistoryItem {
  _id: string;
  serviceName: string;
  quantity: number;
  usedAt: Date;
  sourceType: string;
  note?: string;
  createdAt: Date;
  invoice?: {
    _id?: string;
    invoiceNumber?: string;
    date?: Date;
  };
  invoiceNumber?: string;
}

export async function GET(request: NextRequest, props: any) {
    const tenantSlug = request.headers.get('x-store-slug') || 'pusat';
    const { Invoice, PackageOrder, PackageUsageLedger, Customer } = await getTenantModels(tenantSlug);

  try {
    
    

    const permissionError = await checkPermission(request, 'customers', 'view');
    if (permissionError) return permissionError;

    const { id } = await props.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: 'Invalid customer id' }, { status: 400 });
    }

    const customer = await Customer.findById(id).select('name phone email').lean<CustomerInfo>();
    if (!customer) {
      return NextResponse.json({ success: false, error: 'Customer not found' }, { status: 404 });
    }

    const [invoices, packageOrders, packageUsage] = await Promise.all([
      Invoice.find({ customer: id })
        .select('invoiceNumber date totalAmount amountPaid status paymentMethod sourceType createdAt items notes')
        .sort({ createdAt: -1 })
        .limit(30)
        .lean<InvoiceHistoryItem[]>(),
      PackageOrder.find({ customer: id })
        .select('amount orderNumber status paymentMethod paidAt createdAt packageSnapshot')
        .sort({ createdAt: -1 })
        .limit(30)
        .lean<any[]>(),
      PackageUsageLedger.find({ customer: id })
        .select('serviceName quantity usedAt sourceType note invoice createdAt')
        .sort({ usedAt: -1 })
        .limit(50)
        .lean<any[]>(),
    ]);

    // ── Enrich Package Orders with invoice numbers ──
    // Strategy: Bulk-fetch all package_purchase invoices for this customer,
    // then match each PackageOrder by its orderNumber appearing in invoice.notes
    const packagePurchaseInvoices = await Invoice.find({
      customer: id,
      sourceType: 'package_purchase',
      status: { $nin: ['cancelled', 'voided'] },
    }).select('invoiceNumber notes').lean<any[]>();

    const enrichedPackageOrders = packageOrders.map((po: any) => {
      let invNum: string | null = null;

      // Match by orderNumber in invoice notes
      if (po.orderNumber) {
        const matchingInv = packagePurchaseInvoices.find(
          (inv: any) => inv.notes && inv.notes.includes(po.orderNumber)
        );
        if (matchingInv) invNum = matchingInv.invoiceNumber;
      }

      // Calculate the actual purchase amount (use packageSnapshot.price as primary, fallback to amount)
      const purchaseAmount = Number(po.packageSnapshot?.price || po.amount || 0);

      return {
        ...po,
        totalAmount: purchaseAmount,
        packageName: po.packageSnapshot?.name || 'Paket',
        invoiceNumber: invNum || '-'
      };
    });

    // ── Enrich Package Usage with invoice numbers ──
    // Collect all invoice ObjectIds from usage ledger entries and bulk-fetch
    const usageInvoiceIds = packageUsage
      .filter((u: any) => u.invoice && mongoose.Types.ObjectId.isValid(String(u.invoice)))
      .map((u: any) => u.invoice);

    let invoiceMap: Record<string, string> = {};
    if (usageInvoiceIds.length > 0) {
      const usageInvoices = await Invoice.find({ _id: { $in: usageInvoiceIds } })
        .select('invoiceNumber')
        .lean<any[]>();
      for (const inv of usageInvoices) {
        invoiceMap[String(inv._id)] = inv.invoiceNumber;
      }
    }

    const enrichedPackageUsage = packageUsage.map((u: any) => ({
      ...u,
      invoiceNumber: (u.invoice && invoiceMap[String(u.invoice)]) || '-'
    }));

    return NextResponse.json({
      success: true,
      data: {
        customer,
        invoices,
        packageOrders: enrichedPackageOrders,
        packageUsage: enrichedPackageUsage,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch customer history';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
