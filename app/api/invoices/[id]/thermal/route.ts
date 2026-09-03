import { getTenantModels } from "@/lib/tenantDb";
import { NextRequest, NextResponse } from "next/server";
import { checkPermissionWithSession } from "@/lib/rbac";
import { buildReceiptBuffer, ThermalReceiptData } from "@/lib/escpos";

export async function GET(request: NextRequest, props: any) {
    const tenantSlug = request.headers.get('x-store-slug') || 'pusat';
    const { Invoice, Settings, Deposit, Customer } = await getTenantModels(tenantSlug);

    try {
        const { error: permissionError } = await checkPermissionWithSession(request, 'pos', 'view');
        if (permissionError) return permissionError;

        const { id } = await props.params;
        const { searchParams } = new URL(request.url);
        const paperWidth = searchParams.get('width') === '80' ? 80 : 58;

        const invoice: any = await Invoice.findById(id)
            .populate('customer', 'name phone publicToken')
            .populate('staff', 'name')
            .populate('staffAssignments.staff', 'name')
            .lean();

        if (!invoice) {
            return NextResponse.json({ success: false, error: 'Invoice not found' }, { status: 404 });
        }

        const settings: any = await Settings.findOne({}).lean();

        // Auto-generate publicToken for customer if missing (needed for QR code)
        if (invoice.customer && !invoice.customer.publicToken) {
            const { randomUUID } = require('crypto');
            const token = randomUUID();
            await Customer.updateOne({ _id: invoice.customer._id }, { publicToken: token });
            invoice.customer.publicToken = token;
        }

        // Fetch deposits for payment history
        let deposits: any[] = [];
        try {
            deposits = await Deposit.find({ invoice: id }).sort({ date: 1 }).lean();
        } catch (_) {
            // Deposit model may not exist, ignore
        }

        // Get staff name
        const staffName = invoice.staffAssignments?.[0]?.staff?.name
            || invoice.staff?.name
            || '-';

        // Build staff assignments array
        const staffAssignmentsData = (invoice.staffAssignments || [])
            .filter((a: any) => a.staff?.name)
            .map((a: any) => ({
                name: a.staff.name,
                tip: a.tip || 0,
            }));

        const receiptData: ThermalReceiptData = {
            storeName: settings?.storeName || 'Salon',
            address: settings?.address || '',
            phone: settings?.phone || '',
            invoiceNumber: invoice.invoiceNumber,
            date: invoice.date,
            staffName,
            customerName: invoice.customer?.name,
            items: (invoice.items || []).map((item: any) => ({
                name: item.name,
                description: item.description || undefined,
                quantity: item.quantity || 1,
                price: item.discountNote && (item.total || 0) === 0 ? 0 : (item.price || 0),
                discount: item.discount || 0,
                total: item.total || 0,
                discountNote: item.discountNote || undefined,
            })),
            subtotal: invoice.subtotal || 0,
            discount: invoice.discount || 0,
            tax: invoice.tax || 0,
            totalAmount: invoice.totalAmount || 0,
            amountPaid: invoice.amountPaid || 0,
            paymentMethod: invoice.paymentMethod || 'Cash',
            paymentMethods: invoice.paymentMethods || [],
            deposits: deposits.map((dep: any) => ({
                date: dep.date,
                paymentMethod: dep.paymentMethod || 'Cash',
                amount: dep.amount || 0,
            })),
            staffAssignments: staffAssignmentsData,
            tips: invoice.tips || 0,
            loyaltyPointsUsed: invoice.loyaltyPointsUsed || 0,
            loyaltyPointsEarned: invoice.loyaltyPointsEarned || 0,
            receiptFooter: settings?.receiptFooter || '',
            paperWidth,
            isAppointment: !!invoice.appointment,
            qrUrl: settings?.receiptQrType === 'hidden' 
                ? undefined 
                : settings?.receiptQrType === 'custom' && settings?.customReceiptQrLink
                    ? settings.customReceiptQrLink
                    : invoice.customer?.publicToken
                        ? `${process.env.NEXT_PUBLIC_APP_URL || 'https://fukomo.com'}/${tenantSlug}/portal/${invoice.customer.publicToken}/invoice/${id}`
                        : undefined,
            showStaffOnReceipt: settings?.showStaffOnReceipt !== false,
            showTaxOnReceipt: settings?.showTaxAndTaxableAmountOnReceipt !== false,
        };

        const receiptBuffer = buildReceiptBuffer(receiptData);

        // Return as binary data
        const bytes = Buffer.from(receiptBuffer, 'binary');
        return new Response(bytes, {
            headers: {
                'Content-Type': 'application/octet-stream',
                'Content-Disposition': `attachment; filename="receipt-${invoice.invoiceNumber}.bin"`,
                'Content-Length': String(bytes.length),
            },
        });
    } catch (error: any) {
        console.error('[Thermal Print] Error:', error);
        return NextResponse.json({ success: false, error: 'Failed to generate thermal receipt' }, { status: 500 });
    }
}
