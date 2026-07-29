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
        .select('invoiceNumber date totalAmount amountPaid status paymentMethod sourceType createdAt items')
        .sort({ createdAt: -1 })
        .limit(30)
        .lean<InvoiceHistoryItem[]>(),
      PackageOrder.find({ customer: id })
        .select('amount totalAmount orderNumber status paymentMethod paidAt createdAt packageSnapshot invoice')
        .sort({ createdAt: -1 })
        .limit(30)
        .lean<any[]>(),
      PackageUsageLedger.find({ customer: id })
        .populate('invoice', 'invoiceNumber date')
        .select('serviceName quantity usedAt sourceType note invoice createdAt')
        .sort({ usedAt: -1 })
        .limit(50)
        .lean<any[]>(),
    ]);

    const enrichedPackageOrders = await Promise.all(packageOrders.map(async (po: any) => {
      let invNum: string | null = null;
      if (po.invoice) {
        if (typeof po.invoice === 'object' && po.invoice.invoiceNumber) {
          invNum = po.invoice.invoiceNumber;
        } else {
          const inv = await Invoice.findById(po.invoice).select('invoiceNumber').lean();
          invNum = (inv as any)?.invoiceNumber;
        }
      }
      if (!invNum && po.orderNumber) {
        const inv = await Invoice.findOne({ 
          notes: { $regex: po.orderNumber, $options: 'i' }, 
          status: { $nin: ['cancelled', 'voided'] } 
        }).select('invoiceNumber').lean();
        invNum = (inv as any)?.invoiceNumber;
      }
      return {
        ...po,
        totalAmount: Number(po.amount || po.totalAmount || 0),
        packageName: po.packageSnapshot?.name || 'Paket',
        invoiceNumber: invNum || '-'
      };
    }));

    const enrichedPackageUsage = packageUsage.map((u: any) => ({
      ...u,
      invoiceNumber: u.invoice?.invoiceNumber || (typeof u.invoice === 'string' ? u.invoice : undefined) || '-'
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
