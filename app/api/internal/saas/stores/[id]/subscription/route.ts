import { NextRequest, NextResponse } from 'next/server';
import { requireInternalApiKey } from '@/lib/internalAuth';
import { getMasterModels } from '@/lib/masterDb';
import type { SaasBillingPeriod } from '@/models/SaasPlan';

// Ganti/renew/upgrade subscription toko. Body: { planId, billingPeriod }.
// Logic mirror approveRegistration di lib/provisioning.ts — subscription lama
// (kalau ada) di-expire, bikin subscription baru, update cache Store. Cache
// Store.subscriptionStatus/subscriptionExpiresAt HARUS ikut di-update karena
// dipakai auth.config.ts buat enforcement login (Edge runtime, gak query DB).

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const auth = requireInternalApiKey(request);
    if (!auth.authorized) return auth.response!;

    try {
        const master = await getMasterModels();
        const { id } = await params;
        const body = await request.json();

        const { planId, billingPeriod } = body;

        if (!planId || !billingPeriod) {
            return NextResponse.json(
                { success: false, error: 'planId dan billingPeriod wajib diisi.' },
                { status: 400 }
            );
        }

        const store = await master.Store.findById(id);
        if (!store) {
            return NextResponse.json({ success: false, error: 'Store tidak ditemukan' }, { status: 404 });
        }

        // Validasi plan
        const plan = await master.SaasPlan.findById(planId);
        if (!plan || !plan.isActive) {
            return NextResponse.json(
                { success: false, error: 'SaasPlan tidak ditemukan atau tidak aktif.' },
                { status: 400 }
            );
        }

        // Validasi billing period + cari pricing option
        const pricingOption = plan.pricingOptions.find(
            (p: any) => p.billingPeriod === billingPeriod
        );
        if (!pricingOption) {
            return NextResponse.json(
                {
                    success: false,
                    error: `Plan "${plan.name}" tidak punya opsi harga untuk periode "${billingPeriod}".`,
                },
                { status: 400 }
            );
        }

        const now = new Date();
        const expiresAt = new Date(now.getTime() + pricingOption.billingPeriodDays * 24 * 60 * 60 * 1000);

        // Expire subscription lama (kalau ada yang masih active)
        await master.TenantSubscription.updateMany(
            { storeId: store._id, status: 'active' },
            { $set: { status: 'expired' } }
        );

        // Bikin subscription baru
        const subscription = await master.TenantSubscription.create({
            storeId: store._id,
            planId: plan._id,
            planSnapshot: {
                name: plan.name,
                code: plan.code,
                limits: plan.limits,
            },
            billingPeriod,
            pricePaid: pricingOption.price,
            status: 'active',
            startDate: now,
            expiresAt,
            activeAddOns: [],
            autoRenew: body.autoRenew ?? true, // default true kalau nggak dikasih
        });

        // Update cache Store (WAJIB — dipakai auth.config.ts authorized() callback)
        store.subscriptionStatus = 'active';
        store.subscriptionExpiresAt = expiresAt;
        await store.save();

        return NextResponse.json({
            success: true,
            data: {
                subscriptionId: subscription._id,
                planName: plan.name,
                billingPeriod: subscription.billingPeriod,
                pricePaid: subscription.pricePaid,
                startDate: subscription.startDate,
                expiresAt: subscription.expiresAt,
                storeCache: {
                    subscriptionStatus: store.subscriptionStatus,
                    subscriptionExpiresAt: store.subscriptionExpiresAt,
                },
            },
        });
    } catch (error: any) {
        console.error('[internal/saas/stores/id/subscription][POST] error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
