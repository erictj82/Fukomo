import { NextRequest, NextResponse } from 'next/server';
import { requireInternalApiKey } from '@/lib/internalAuth';
import { getMasterModels } from '@/lib/masterDb';

// Dashboard metrics buat panel PHP (Modul B di plan § 4.4). Agregasi dari Store +
// Registration + TenantSubscription. Panel butuh ini buat tampilan kartu-kartu angka
// di landing page admin.

export async function GET(request: NextRequest) {
    const auth = requireInternalApiKey(request);
    if (!auth.authorized) return auth.response!;

    try {
        const master = await getMasterModels();
        const now = new Date();

        // Total stores
        const totalStores = await master.Store.countDocuments();

        // Stores by subscription status
        const storesByStatus = await master.Store.aggregate([
            {
                $group: {
                    _id: '$subscriptionStatus',
                    count: { $sum: 1 },
                },
            },
        ]);

        const statusMap = new Map(storesByStatus.map((s) => [s._id, s.count]));
        const activeStores = statusMap.get('active') || 0;
        const expiredStores = statusMap.get('expired') || 0;
        const suspendedStores = statusMap.get('suspended') || 0;
        const pendingPaymentStores = statusMap.get('pending_payment') || 0;
        const noSubscriptionStores = statusMap.get(null) || 0;

        // Pending registrations
        const pendingRegistrations = await master.Registration.countDocuments({ status: 'pending' });

        // Subscriptions expiring ≤ 7 days (buat warning card / tabel di dashboard)
        const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        const expiringSoon = await master.Store.find({
            subscriptionStatus: 'active',
            subscriptionExpiresAt: { $gt: now, $lte: sevenDaysFromNow },
        })
            .select('name slug subscriptionExpiresAt')
            .sort({ subscriptionExpiresAt: 1 })
            .limit(10);

        const data = {
            stores: {
                total: totalStores,
                active: activeStores,
                expired: expiredStores,
                suspended: suspendedStores,
                pendingPayment: pendingPaymentStores,
                noSubscription: noSubscriptionStores,
            },
            registrations: {
                pending: pendingRegistrations,
            },
            expiringSoon: expiringSoon.map((s) => ({
                _id: s._id,
                name: s.name,
                slug: s.slug,
                expiresAt: s.subscriptionExpiresAt,
                daysRemaining: Math.ceil(
                    (new Date(s.subscriptionExpiresAt!).getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
                ),
            })),
        };

        return NextResponse.json({ success: true, data });
    } catch (error: any) {
        console.error('[internal/saas/stats][GET] error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
