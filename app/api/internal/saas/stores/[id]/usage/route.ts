import { NextRequest, NextResponse } from 'next/server';
import { requireInternalApiKey } from '@/lib/internalAuth';
import { getMasterModels } from '@/lib/masterDb';
import { getTenantModels } from '@/lib/tenantDb';

// Usage toko periode berjalan vs limit efektif (base plan + add-on aktif).
// Panel butuh ini buat tampilan "kuota terpakai / total kuota" di halaman detail toko.
// Logic mirror subscriptionEnforcement.ts — rolling 30-hari dari subscription startDate.

const ROLLING_WINDOW_DAYS = 30;

function getUsagePeriodWindow(subscriptionStartDate: Date, now: Date): { periodStart: Date; periodEnd: Date } {
    const windowMs = ROLLING_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    const start = subscriptionStartDate.getTime();
    const elapsed = Math.max(0, now.getTime() - start);
    const windowIndex = Math.floor(elapsed / windowMs);
    return {
        periodStart: new Date(start + windowIndex * windowMs),
        periodEnd: new Date(start + (windowIndex + 1) * windowMs),
    };
}

function sumActiveAddOns(activeAddOns: any[], limitType: string, now: Date): number {
    return activeAddOns
        .filter((a) => a.limitType === limitType && new Date(a.expiresAt) > now)
        .reduce((sum, a) => sum + a.extraAmount, 0);
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const auth = requireInternalApiKey(request);
    if (!auth.authorized) return auth.response!;

    try {
        const master = await getMasterModels();
        const { id } = await params;

        const store = await master.Store.findById(id);
        if (!store) {
            return NextResponse.json({ success: false, error: 'Store tidak ditemukan' }, { status: 404 });
        }

        // Cari subscription aktif
        const subscription = await master.TenantSubscription.findOne({
            storeId: store._id,
            status: 'active',
            expiresAt: { $gt: new Date() },
        }).sort({ createdAt: -1 });

        if (!subscription) {
            return NextResponse.json({
                success: false,
                error: 'Tidak ada subscription aktif. Usage tracking hanya jalan untuk toko dengan subscription.',
            }, { status: 400 });
        }

        const now = new Date();
        const { periodStart, periodEnd } = getUsagePeriodWindow(subscription.startDate, now);

        // Usage counter periode berjalan
        const counter = await master.TenantUsageCounter.findOne({
            storeId: store._id,
            periodStart,
        });

        const transactionsCount = counter?.transactionsCount || 0;
        const waMessagesCount = counter?.waMessagesCount || 0;

        // Effective limits (base + add-on)
        const baseLimits = subscription.planSnapshot.limits;
        const effectiveLimits = {
            maxStaff: baseLimits.maxStaff + sumActiveAddOns(subscription.activeAddOns, 'staff', now),
            maxTransactionsPerMonth: baseLimits.maxTransactionsPerMonth + sumActiveAddOns(subscription.activeAddOns, 'transaction', now),
            maxWaMessagesPerMonth: baseLimits.maxWaMessagesPerMonth + sumActiveAddOns(subscription.activeAddOns, 'wa', now),
        };

        // Staff headcount (live dari tenant DB, bukan counter)
        const { Staff } = await getTenantModels(store.slug);
        const staffCount = await Staff.countDocuments();

        const data = {
            storeId: store._id,
            storeName: store.name,
            subscriptionId: subscription._id,
            planName: subscription.planSnapshot.name,
            periodStart,
            periodEnd,
            usage: {
                transactions: {
                    used: transactionsCount,
                    limit: effectiveLimits.maxTransactionsPerMonth,
                    remaining: Math.max(0, effectiveLimits.maxTransactionsPerMonth - transactionsCount),
                    percentage: effectiveLimits.maxTransactionsPerMonth > 0
                        ? Math.round((transactionsCount / effectiveLimits.maxTransactionsPerMonth) * 100)
                        : 0,
                },
                waMessages: {
                    used: waMessagesCount,
                    limit: effectiveLimits.maxWaMessagesPerMonth,
                    remaining: Math.max(0, effectiveLimits.maxWaMessagesPerMonth - waMessagesCount),
                    percentage: effectiveLimits.maxWaMessagesPerMonth > 0
                        ? Math.round((waMessagesCount / effectiveLimits.maxWaMessagesPerMonth) * 100)
                        : 0,
                },
                staff: {
                    used: staffCount,
                    limit: effectiveLimits.maxStaff,
                    remaining: Math.max(0, effectiveLimits.maxStaff - staffCount),
                    percentage: effectiveLimits.maxStaff > 0
                        ? Math.round((staffCount / effectiveLimits.maxStaff) * 100)
                        : 0,
                },
            },
            activeAddOnsCount: subscription.activeAddOns.filter((a) => new Date(a.expiresAt) > now).length,
        };

        return NextResponse.json({ success: true, data });
    } catch (error: any) {
        console.error('[internal/saas/stores/id/usage][GET] error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
