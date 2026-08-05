import { getMasterModels } from '@/lib/masterDb';
import { getTenantModels } from '@/lib/tenantDb';

// Modul enforcement ini SENGAJA di-isolasi di sini (bukan ditulis inline di tiap
// route) biar titik-titik yang butuh limit check (create invoice, create staff,
// kirim WA) semua manggil fungsi yang SAMA - konsisten sama semangat blueprint
// section 4 (enforcement logic terpusat di Next.js, PHP panel cuma setting & lihat
// laporan, bukan tempat enforce).
//
// PENTING: fungsi-fungsi di sini pakai getMasterModels() (mongoose, Node runtime).
// JANGAN dipanggil dari auth.config.ts authorized() callback - itu jalan di Edge
// runtime (lihat proxy.ts: `NextAuth(authConfig)` tanpa provider/DB access).
// Subscription status buat login-check ada di token JWT (di-refresh di auth.ts
// jwt() callback, Node runtime), BUKAN query langsung di sini.

export type EnforcementLimitType = 'staff' | 'transaction' | 'wa';

export interface UsageCheckResult {
    allowed: boolean;
    reason?: 'no_active_subscription' | 'limit_exceeded';
    currentUsage?: number;
    limit?: number;
}

// Kill-switch global buat SELURUH enforcement SaaS. Default OFF (mati) — cuma
// nyala kalau SAAS_ENABLED=true di env. Selama flag ini bukan 'true', semua
// pengecekan limit (transaksi/WA/staff) di-bypass total, jadi tenant production
// next-salon yang belum pakai SaaS gak akan pernah keblok. Login-gate di
// auth.config.ts pakai pengecekan env yang sama (Edge runtime, gak import ini).
export function isSaasEnabled(): boolean {
    return process.env.SAAS_ENABLED === 'true';
}

const ROLLING_WINDOW_DAYS = 30;

// Limit "per bulan" di plan berlaku sebagai rolling 30-hari dari startDate
// subscription, BUKAN kalender bulan dan BUKAN sekali per periode billing penuh.
// Jadi tenant yang bayar tahunan tetap kena reset kuota tiap 30 hari (12x
// setahun), bukan cuma dapet kuota "per tahun" dibagi rata.
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

function sumActiveAddOns(activeAddOns: any[], limitType: EnforcementLimitType, now: Date): number {
    return activeAddOns
        .filter((a) => a.limitType === limitType && new Date(a.expiresAt) > now)
        .reduce((sum, a) => sum + a.extraAmount, 0);
}

export async function getStoreIdBySlug(slug: string): Promise<string | null> {
    const master = await getMasterModels();
    const store = await master.Store.findOne({ slug }).select('_id');
    return store ? store._id.toString() : null;
}

/**
 * Dipanggil dari auth.ts jwt() callback (Node runtime) buat di-embed ke token.
 * Cuma baca 2 field cache di Store, bukan join ke TenantSubscription - biar
 * murah dipanggil tiap refresh cycle (5 menit, sama kayak permission refresh).
 */
export async function getSubscriptionCacheForSlug(
    slug: string
): Promise<{ status: string | null; expiresAt: Date | null } | null> {
    const master = await getMasterModels();
    const store = await master.Store.findOne({ slug }).select('subscriptionStatus subscriptionExpiresAt');
    if (!store) return null;
    return { status: store.subscriptionStatus ?? null, expiresAt: store.subscriptionExpiresAt ?? null };
}

/**
 * Transaksi & WA - dikonsumsi dari TenantUsageCounter, atomic increment biar
 * gak race condition kalau 2 request masuk bersamaan pas usage udah mepet limit.
 */
export async function tryConsumeUsage(
    storeId: string,
    limitType: 'transaction' | 'wa',
    amount: number = 1
): Promise<UsageCheckResult> {
    // Kill-switch: SaaS mati -> jangan konsumsi kuota / jangan blok apa pun.
    if (!isSaasEnabled()) return { allowed: true };

    const master = await getMasterModels();

    const subscription = await master.TenantSubscription.findOne({
        storeId,
        status: 'active',
        expiresAt: { $gt: new Date() },
    }).sort({ createdAt: -1 });

    if (!subscription) {
        // HOTFIX (18/7): jangan diblokir. "Gak ada subscription record" itu kondisi
        // SEMUA tenant lama sekarang (sistem plan ini baru, belum ada proses migrasi/
        // backfill buat toko existing) — bukan berarti mereka "over limit". Enforcement
        // HARUS cuma jalan buat tenant yang UDAH eksplisit diassign plan (lihat
        // lib/provisioning.ts approveRegistration), bukan default nge-block semua.
        return { allowed: true };
    }

    const now = new Date();
    const baseLimit =
        limitType === 'transaction'
            ? subscription.planSnapshot.limits.maxTransactionsPerMonth
            : subscription.planSnapshot.limits.maxWaMessagesPerMonth;
    const effectiveLimit = baseLimit + sumActiveAddOns(subscription.activeAddOns, limitType, now);

    const { periodStart, periodEnd } = getUsagePeriodWindow(subscription.startDate, now);
    const counterField = limitType === 'transaction' ? 'transactionsCount' : 'waMessagesCount';

    // Step 1: pastikan dokumen counter periode ini ada (upsert TANPA increment).
    await master.TenantUsageCounter.findOneAndUpdate(
        { storeId, periodStart },
        {
            $setOnInsert: {
                storeId,
                subscriptionId: subscription._id,
                periodStart,
                periodEnd,
                transactionsCount: 0,
                waMessagesCount: 0,
                staffCountSnapshot: 0,
            },
        },
        { upsert: true }
    );

    // Step 2: conditional atomic increment - cuma nempel kalau usage+amount masih <= limit.
    const updated = await master.TenantUsageCounter.findOneAndUpdate(
        { storeId, periodStart, [counterField]: { $lte: effectiveLimit - amount } },
        { $inc: { [counterField]: amount } },
        { new: true }
    );

    if (!updated) {
        const current = await master.TenantUsageCounter.findOne({ storeId, periodStart });
        return {
            allowed: false,
            reason: 'limit_exceeded',
            currentUsage: current ? (current as any)[counterField] : effectiveLimit,
            limit: effectiveLimit,
        };
    }

    return { allowed: true, currentUsage: (updated as any)[counterField], limit: effectiveLimit };
}

/**
 * Staff BUKAN usage yang di-"consume" & reset per periode - itu live headcount.
 * Makanya cek langsung ke tenant DB (Staff.countDocuments), bukan TenantUsageCounter.
 */
export async function checkStaffLimit(
    storeSlug: string,
    storeId: string
): Promise<UsageCheckResult> {
    // Kill-switch: SaaS mati -> jangan blok tambah staff.
    if (!isSaasEnabled()) return { allowed: true };

    const master = await getMasterModels();

    const subscription = await master.TenantSubscription.findOne({
        storeId,
        status: 'active',
        expiresAt: { $gt: new Date() },
    }).sort({ createdAt: -1 });

    if (!subscription) {
        // HOTFIX (18/7): sama kayak tryConsumeUsage - tenant lama tanpa subscription
        // record BUKAN berarti over-limit, jangan diblokir bikin staff baru.
        return { allowed: true };
    }

    const now = new Date();
    const effectiveLimit =
        subscription.planSnapshot.limits.maxStaff + sumActiveAddOns(subscription.activeAddOns, 'staff', now);

    const { Staff } = await getTenantModels(storeSlug);
    const currentCount = await Staff.countDocuments();

    if (currentCount >= effectiveLimit) {
        return { allowed: false, reason: 'limit_exceeded', currentUsage: currentCount, limit: effectiveLimit };
    }

    return { allowed: true, currentUsage: currentCount, limit: effectiveLimit };
}
