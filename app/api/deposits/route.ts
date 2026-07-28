import { getTenantModels } from "@/lib/tenantDb";

import { NextRequest, NextResponse } from "next/server";
import { checkPermission } from "@/lib/rbac";




export async function GET(request: NextRequest, props: any) {
    const tenantSlug = request.headers.get('x-store-slug') || 'pusat';
    const { Deposit, Invoice } = await getTenantModels(tenantSlug);

    try {
        const { searchParams } = new URL(request.url);
        const invoiceId = searchParams.get("invoiceId");

        // Permission check: allow pos.view, deposits.view, OR invoices.view (if querying by invoiceId)
        const posPermErr = await checkPermission(request, 'pos', 'view');
        const depPermErr = await checkPermission(request, 'deposits', 'view');
        const invPermErr = invoiceId ? await checkPermission(request, 'invoices', 'view') : depPermErr;

        if (posPermErr && depPermErr && invPermErr) return depPermErr;

        let query = {};
        if (invoiceId) query = { invoice: invoiceId };

        const deposits = await Deposit.find(query).populate('customer').sort({ createdAt: -1 });
        return NextResponse.json({ success: true, data: deposits });
    } catch (error) {
        return NextResponse.json({ success: false, error: "Failed to fetch deposits" }, { status: 500 });
    }
}

export async function POST(request: NextRequest, props: any) {
    const tenantSlug = request.headers.get('x-store-slug') || 'pusat';
    const { Deposit, Invoice } = await getTenantModels(tenantSlug);

    try {
        const posPermErrPOST = await checkPermission(request, 'pos', 'create');
        const depPermErrPOST = await checkPermission(request, 'deposits', 'create');
        if (posPermErrPOST && depPermErrPOST) return depPermErrPOST;

        const body = await request.json();

        // Validation
        const amountNum = Number(body.amount);
        if (isNaN(amountNum) || amountNum <= 0) {
            return NextResponse.json({ success: false, error: "Nominal deposit harus lebih dari 0." }, { status: 400 });
        }

        const isWallet = body.paymentMethod && (body.paymentMethod.toLowerCase() === 'wallet' || body.paymentMethod.toLowerCase() === 'e-wallet') && !body.skipWalletDeduction;
        const Customer = (await getTenantModels(tenantSlug)).Customer;

        if (isWallet) {
            if (!body.customer) {
                return NextResponse.json({ success: false, error: "Pembayaran e-wallet membutuhkan data customer terdaftar." }, { status: 400 });
            }
            const customerDoc = await Customer.findById(body.customer);

            if (!customerDoc) {
                return NextResponse.json({ success: false, error: "Customer tidak ditemukan." }, { status: 400 });
            }
            if ((customerDoc.walletBalance || 0) < amountNum) {
                return NextResponse.json({ success: false, error: `Saldo e-wallet tidak mencukupi. Saldo saat ini: Rp ${(customerDoc.walletBalance || 0).toLocaleString('id-ID')}` }, { status: 400 });
            }
        }

        // 1. Create the deposit
        const deposit: any = await Deposit.create(body);

        if (isWallet) {
            // Deduct balance atomically
            const updatedCustomer = await Customer.findOneAndUpdate(
                { _id: body.customer, walletBalance: { $gte: amountNum } },
                { $inc: { walletBalance: -amountNum } },
                { new: true }
            );

            if (!updatedCustomer) {
                // Rollback deposit
                await Deposit.findByIdAndDelete(deposit._id);
                return NextResponse.json({ success: false, error: "Saldo e-wallet tidak mencukupi saat proses akhir." }, { status: 400 });
            }

            // Record transaction
            const { WalletTransaction } = await getTenantModels(tenantSlug);
            await WalletTransaction.create({
                customer: updatedCustomer._id,
                type: 'payment',
                amount: amountNum,
                balanceAfter: updatedCustomer.walletBalance,
                description: `Pembayaran Deposit Invoice`,
                invoice: body.invoice,
            });
        }

        // 2. Update the invoice paidAmount and status
        // Recalculate from all deposits to avoid double-counting
        // (POS already sets amountPaid on invoice creation, so incrementing would double it)
        const invoice = await Invoice.findById(body.invoice);
        if (invoice) {
            const allDeposits = await Deposit.find({ invoice: body.invoice });
            const newPaidAmount = allDeposits.reduce((sum: number, d: any) => sum + (d.amount || 0), 0);
            invoice.amountPaid = newPaidAmount;

            if (newPaidAmount >= invoice.totalAmount) {
                invoice.status = 'paid';
            } else if (newPaidAmount > 0) {
                invoice.status = 'partially_paid';
            }
            await invoice.save();
        }

        return NextResponse.json({ success: true, data: deposit });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}