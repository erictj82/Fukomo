import { getTenantModels } from "@/lib/tenantDb";
import { NextRequest, NextResponse } from "next/server";

// Public endpoint — no auth required
// Fetches customer data by publicToken for the customer portal page
export async function GET(request: NextRequest, props: any) {
    const tenantSlug = request.headers.get('x-store-slug') || 'pusat';
    const { Customer, Invoice, CustomerPackage, Settings, WalletTransaction } = await getTenantModels(tenantSlug);

    try {
        const { token } = await props.params;

        if (!token) {
            return NextResponse.json({ success: false, error: 'Token tidak valid' }, { status: 400 });
        }

        const customer = await Customer.findOne({ publicToken: token })
            .select('name customerNumber loyaltyPoints walletBalance totalPurchases membershipTier membershipExpiry')
            .lean();

        if (!customer) {
            return NextResponse.json({ success: false, error: 'Link tidak valid atau sudah kadaluarsa' }, { status: 404 });
        }

        // Fetch settings for store name
        const settings: any = await Settings.findOne({})
            .select('storeName')
            .lean();

        // Fetch recent invoices (last 20, exclude voided)
        const invoices = await Invoice.find({
            customer: customer._id,
            status: { $nin: ['cancelled', 'voided'] }
        })
            .select('invoiceNumber date items.name totalAmount status')
            .sort({ date: -1 })
            .limit(20)
            .lean();

        // Fetch active packages
        const activePackages = await CustomerPackage.find({
            customer: customer._id,
            status: 'active'
        })
            .select('packageName expiresAt serviceQuotas')
            .lean();

        // Fetch wallet transactions (last 20)
        const walletTransactions = await WalletTransaction.find({
            customer: customer._id
        })
            .select('type amount balanceAfter description createdAt')
            .sort({ createdAt: -1 })
            .limit(20)
            .lean();

        return NextResponse.json({
            success: true,
            data: {
                customer,
                invoices,
                activePackages,
                walletTransactions,
                settings: {
                    storeName: settings?.storeName || 'Salon'
                }
            }
        });
    } catch (error: any) {
        console.error('[Customer Portal] Error:', error);
        return NextResponse.json({ success: false, error: 'Failed to fetch portal data' }, { status: 500 });
    }
}
