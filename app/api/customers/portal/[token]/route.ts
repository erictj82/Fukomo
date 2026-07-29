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

        // Fetch settings for store name and wallet expiry
        const settings: any = await Settings.findOne({})
            .select('storeName walletExpiryDays symbol')
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

        const expiryDays = Number(settings?.walletExpiryDays || 0);
        let walletExpiryDate: string | null = null;
        if (expiryDays > 0 && (customer.walletBalance || 0) > 0) {
            const latestTx = await WalletTransaction.findOne({ customer: customer._id }).sort({ createdAt: -1 }).select('createdAt').lean();
            const baseDate = latestTx?.createdAt ? new Date(latestTx.createdAt) : new Date();
            const expDate = new Date(baseDate.getTime() + expiryDays * 24 * 60 * 60 * 1000);
            walletExpiryDate = expDate.toISOString();
        }

        return NextResponse.json({
            success: true,
            data: {
                customer: {
                    ...customer,
                    walletExpiryDate,
                },
                invoices,
                activePackages,
                walletTransactions,
                settings: {
                    storeName: settings?.storeName || 'Salon',
                    walletExpiryDays: expiryDays,
                    symbol: settings?.symbol || 'Rp'
                }
            }
        });
    } catch (error: any) {
        console.error('[Customer Portal] Error:', error);
        return NextResponse.json({ success: false, error: 'Failed to fetch portal data' }, { status: 500 });
    }
}
