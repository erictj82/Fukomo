import { NextRequest, NextResponse } from 'next/server';
import { requireInternalApiKey } from '@/lib/internalAuth';
import { getMasterModels } from '@/lib/masterDb';

// Detail 1 toko: info store + histori subscription (semua, bukan cuma active) +
// usage counter periode berjalan. Dipakai panel PHP buat halaman detail toko
// (Modul C di plan, § 4.4).

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

        // Subscription history — semua record, urut terbaru dulu
        const subscriptions = await master.TenantSubscription.find({ storeId: store._id })
            .sort({ createdAt: -1 });

        // Usage counter periode berjalan (dari subscription aktif, kalau ada)
        const activeSub = subscriptions.find((s) => s.status === 'active' && new Date(s.expiresAt) > new Date());
        let currentUsage = null;

        if (activeSub) {
            // Hitung rolling window periode sekarang (ROLLING_WINDOW_DAYS = 30 dari subscriptionEnforcement)
            const now = new Date();
            const windowMs = 30 * 24 * 60 * 60 * 1000;
            const start = activeSub.startDate.getTime();
            const elapsed = Math.max(0, now.getTime() - start);
            const windowIndex = Math.floor(elapsed / windowMs);
            const periodStart = new Date(start + windowIndex * windowMs);

            const counter = await master.TenantUsageCounter.findOne({
                storeId: store._id,
                periodStart,
            });

            currentUsage = counter
                ? {
                      periodStart: counter.periodStart,
                      periodEnd: counter.periodEnd,
                      transactionsCount: counter.transactionsCount,
                      waMessagesCount: counter.waMessagesCount,
                      staffCountSnapshot: counter.staffCountSnapshot,
                  }
                : {
                      periodStart,
                      periodEnd: new Date(start + (windowIndex + 1) * windowMs),
                      transactionsCount: 0,
                      waMessagesCount: 0,
                      staffCountSnapshot: 0,
                  };
        }

        const data = {
            store: {
                _id: store._id,
                name: store.name,
                slug: store.slug,
                dbUri: store.dbUri, // panel butuh ini buat debug/manual ops
                isActive: store.isActive,
                subscriptionStatus: store.subscriptionStatus,
                subscriptionExpiresAt: store.subscriptionExpiresAt,
                createdAt: store.createdAt,
                updatedAt: store.updatedAt,
            },
            subscriptions: subscriptions.map((sub) => ({
                _id: sub._id,
                planSnapshot: sub.planSnapshot,
                billingPeriod: sub.billingPeriod,
                pricePaid: sub.pricePaid,
                status: sub.status,
                startDate: sub.startDate,
                expiresAt: sub.expiresAt,
                activeAddOns: sub.activeAddOns,
                autoRenew: sub.autoRenew,
                createdAt: sub.createdAt,
            })),
            currentUsage,
        };

        return NextResponse.json({ success: true, data });
    } catch (error: any) {
        console.error('[internal/saas/stores/id][GET] error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

// Suspend / aktifkan kembali toko. Body: { isActive?: boolean, subscriptionStatus?: string }.
// PENTING: field cache Store.subscriptionStatus/subscriptionExpiresAt dipakai auth.config.ts
// buat enforcement login cepat (Edge runtime, gak query DB). Setiap ubah status di sini
// HARUS ikut sinkronin ke subscription record aktif biar gak ada 2 sumber kebenaran yang drift.
const VALID_STATUSES = ['active', 'expired', 'suspended', 'pending_payment'];

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const auth = requireInternalApiKey(request);
    if (!auth.authorized) return auth.response!;

    try {
        const master = await getMasterModels();
        const { id } = await params;
        const body = await request.json();

        const store = await master.Store.findById(id);
        if (!store) {
            return NextResponse.json({ success: false, error: 'Store tidak ditemukan' }, { status: 404 });
        }

        const update: any = {};

        if (typeof body.isActive === 'boolean') {
            update.isActive = body.isActive;
        }

        if (body.subscriptionStatus !== undefined) {
            if (body.subscriptionStatus !== null && !VALID_STATUSES.includes(body.subscriptionStatus)) {
                return NextResponse.json(
                    { success: false, error: `subscriptionStatus harus salah satu dari: ${VALID_STATUSES.join(', ')}, atau null` },
                    { status: 400 }
                );
            }
            update.subscriptionStatus = body.subscriptionStatus;
        }

        if (Object.keys(update).length === 0) {
            return NextResponse.json(
                { success: false, error: 'Tidak ada field yang bisa diubah (isActive / subscriptionStatus).' },
                { status: 400 }
            );
        }

        // Update cache di Store
        Object.assign(store, update);
        await store.save();

        // Sinkronin subscription record aktif kalau subscriptionStatus diubah, biar
        // enforcement (tryConsumeUsage/checkStaffLimit) yang query TenantSubscription
        // langsung gak lihat status yang beda dari cache Store.
        if (update.subscriptionStatus && update.subscriptionStatus !== 'active') {
            await master.TenantSubscription.updateMany(
                { storeId: store._id, status: 'active' },
                { $set: { status: update.subscriptionStatus } }
            );
        }

        return NextResponse.json({
            success: true,
            data: {
                _id: store._id,
                isActive: store.isActive,
                subscriptionStatus: store.subscriptionStatus,
                subscriptionExpiresAt: store.subscriptionExpiresAt,
            },
        });
    } catch (error: any) {
        console.error('[internal/saas/stores/id][PATCH] error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
