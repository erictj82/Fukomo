import { NextRequest, NextResponse } from 'next/server';
import { getMasterModels } from '@/lib/masterDb';
import { isSaasEnabled } from '@/lib/subscriptionEnforcement';

// Cron job: set subscription (+ cache Store) jadi 'expired' begitu expiresAt lewat.
// Dipanggil terjadwal (mis. tiap jam) dengan header Authorization: Bearer <CRON_SECRET>.
//
// KILL-SWITCH: kalau SAAS_ENABLED != 'true', job ini no-op total — production
// next-salon yang belum pakai SaaS gak akan pernah kena expire paksa. Sama semangat
// sama enforcement lain di lib/subscriptionEnforcement.ts.
//
// Kenapa cron, bukan cek on-the-fly: enforcement login di auth.config.ts udah cek
// expiresAt < now (Edge, dari token cache). TAPI cache Store.subscriptionStatus tetap
// 'active' sampai ada yang nulis ulang — cron ini yang mindahin ke 'expired' biar
// dashboard panel & query status akurat, bukan cuma keblok pas login.

export async function GET(request: NextRequest) {
    try {
        // Auth cron (pola sama dengan cron WA existing)
        const authHeader = request.headers.get('authorization');
        const cronSecret = process.env.CRON_SECRET;
        // Fail-closed: kalau CRON_SECRET belum diset, TOLAK. Sebelumnya `if (cronSecret && ...)` —
        // kalau secret kosong auth ke-skip total, jadi endpoint tulis publik. Jangan.
        if (!cronSecret) {
            console.error('[cron/subscription-expiry] CRON_SECRET belum diset — endpoint ditolak (fail-closed).');
            return NextResponse.json({ success: false, error: 'Cron belum dikonfigurasi di server.' }, { status: 503 });
        }
        if (authHeader !== `Bearer ${cronSecret}`) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        // Kill-switch: SaaS mati -> jangan expire apa pun.
        if (!isSaasEnabled()) {
            return NextResponse.json({
                success: true,
                message: 'SaaS disabled (SAAS_ENABLED != true) — no-op.',
                expired: 0,
            });
        }

        const master = await getMasterModels();
        const now = new Date();

        // Cari subscription active yang udah lewat expiresAt
        const expiredSubs = await master.TenantSubscription.find({
            status: 'active',
            expiresAt: { $lte: now },
        });

        let expiredCount = 0;
        const affectedStores: string[] = [];

        for (const sub of expiredSubs) {
            // Set subscription -> expired
            sub.status = 'expired';
            await sub.save();

            // Sinkronin cache Store (dipakai auth.config.ts). Cuma set expired kalau
            // store masih nunjuk ke status active (jangan timpa suspended manual).
            const store = await master.Store.findById(sub.storeId);
            if (store && store.subscriptionStatus === 'active') {
                store.subscriptionStatus = 'expired';
                await store.save();
                affectedStores.push(store.slug);
            }
            expiredCount++;
        }

        return NextResponse.json({
            success: true,
            message: `Processed ${expiredCount} expired subscription(s).`,
            expired: expiredCount,
            affectedStores,
        });
    } catch (error: any) {
        console.error('[cron/subscription-expiry] error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
