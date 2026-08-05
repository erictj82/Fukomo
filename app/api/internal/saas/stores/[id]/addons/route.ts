import { NextRequest, NextResponse } from 'next/server';
import { requireInternalApiKey } from '@/lib/internalAuth';
import { getMasterModels } from '@/lib/masterDb';

// Tambahin add-on ke subscription aktif. Body: { name, limitType, extraAmount, price, expiresAt }.
// Add-on nempel ke activeAddOns[] subscription (bukan bikin doc terpisah) — lifecycle-nya
// terikat sama subscription, otomatis ga berlaku lagi kalau subscription di-expire/ganti.

const VALID_LIMIT_TYPES = ['staff', 'transaction', 'wa'];

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const auth = requireInternalApiKey(request);
    if (!auth.authorized) return auth.response!;

    try {
        const master = await getMasterModels();
        const { id } = await params;
        const body = await request.json();

        const { name, limitType, extraAmount, price, expiresAt } = body;

        if (!name || !limitType || !extraAmount || price === undefined) {
            return NextResponse.json(
                { success: false, error: 'name, limitType, extraAmount, dan price wajib diisi.' },
                { status: 400 }
            );
        }

        if (!VALID_LIMIT_TYPES.includes(limitType)) {
            return NextResponse.json(
                { success: false, error: `limitType harus salah satu dari: ${VALID_LIMIT_TYPES.join(', ')}` },
                { status: 400 }
            );
        }

        if (typeof extraAmount !== 'number' || extraAmount < 1) {
            return NextResponse.json(
                { success: false, error: 'extraAmount harus angka >= 1' },
                { status: 400 }
            );
        }

        if (typeof price !== 'number' || price < 0) {
            return NextResponse.json(
                { success: false, error: 'price harus angka >= 0' },
                { status: 400 }
            );
        }

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
            return NextResponse.json(
                { success: false, error: 'Tidak ada subscription aktif untuk store ini.' },
                { status: 400 }
            );
        }

        // expiresAt default = subscription.expiresAt (add-on ikut habis bareng subscription)
        const addonExpiresAt = expiresAt ? new Date(expiresAt) : subscription.expiresAt;

        // Append ke activeAddOns[]
        const addon = {
            name: name.trim(),
            limitType,
            extraAmount,
            price,
            purchasedAt: new Date(),
            expiresAt: addonExpiresAt,
        };

        subscription.activeAddOns.push(addon);
        await subscription.save();

        return NextResponse.json({
            success: true,
            data: {
                subscriptionId: subscription._id,
                addedAddOn: {
                    ...addon,
                    _id: subscription.activeAddOns[subscription.activeAddOns.length - 1]._id,
                },
                totalActiveAddOns: subscription.activeAddOns.length,
            },
        });
    } catch (error: any) {
        console.error('[internal/saas/stores/id/addons][POST] error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
