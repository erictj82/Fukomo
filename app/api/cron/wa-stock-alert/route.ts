import { getTenantModels } from "@/lib/tenantDb";
/**
 * GET /api/cron/wa-stock-alert
 * Check products with low stock and notify admin via WA.
 */
import { NextRequest, NextResponse } from 'next/server';


import { decryptFonnteToken } from '@/lib/encryption';
import { sendWhatsApp } from '@/lib/fonnte';


export async function GET(request: NextRequest, props: any) {
    const tenantSlug = request.headers.get('x-store-slug') || 'pusat';
    const { Product, Settings } = await getTenantModels(tenantSlug);

    try {
        const authHeader = request.headers.get('authorization');
        const cronSecret = process.env.CRON_SECRET;
        if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        
        const settings = await Settings.findOne();

        // === OPERATIONAL HOURS CHECK (dynamic dari DB) ===
        const { checkOperationalHours, checkScheduleTime } = await import('@/lib/waOperationalHours');
        const opCheck = checkOperationalHours(settings || {});
        if (!opCheck.allowed) {
            return NextResponse.json({
                success: true,
                message: `Skipped: ${opCheck.reason}`,
                sent: 0,
                skipped: true,
            });
        }

        // === SCHEDULE TIME CHECK ===
        const stockTime = settings?.waStockAlertTime || '08:00';
        const schedCheck = checkScheduleTime(stockTime);
        if (!schedCheck.ready) {
            return NextResponse.json({
                success: true,
                message: `Skipped: ${schedCheck.reason}`,
                sent: 0,
                skipped: true,
            });
        }
        // === END CHECK ===

        const adminPhone = settings?.waAdminNumber;
        const { getWaProviderConfigFromSettings, getWaProviderConfigForPurpose } = require('@/lib/waProvider');
        const waConfig = getWaProviderConfigForPurpose(settings, 'notification');

        if (!adminPhone) {
            return NextResponse.json({
                success: true,
                message: 'No admin WA number configured in settings',
                sent: 0,
            });
        }

        // Find products with low stock
        const lowStockProducts = await Product.find({
            status: 'active',
            lowStockAlertEnabled: true,
            $expr: { $lte: ['$stock', '$alertQuantity'] },
        })
            .sort({ stock: 1 })
            .lean();

        // Filter products that haven't been notified yet
        const toNotify = lowStockProducts.filter((p: any) => !p.lowStockNotifSent);

        if (toNotify.length === 0) {
            return NextResponse.json({
                success: true,
                message: 'No new low stock products to notify',
                sent: 0,
                totalLowStock: lowStockProducts.length,
            });
        }

        // Build message
        const storeName = settings?.storeName || 'Salon';
        const productList = toNotify
            .map((p: any, i: number) => `${i + 1}. *${p.name}* — Sisa: ${p.stock} (Min: ${p.alertQuantity})`)
            .join('\n');

        const message =
            `⚠️ *Notifikasi Stok Rendah — ${storeName}*\n\n` +
            `Ada ${toNotify.length} produk yang stoknya hampir habis:\n\n` +
            `${productList}\n\n` +
            `Segera lakukan restok! 📦`;

        const result = await sendWhatsApp(adminPhone, message, waConfig);

        if (result.success) {
            // Mark products as notified
            const ids = toNotify.map((p: any) => p._id);
            await Product.updateMany(
                { _id: { $in: ids } },
                { $set: { lowStockNotifSent: true } }
            );
        }

        return NextResponse.json({
            success: true,
            message: `Stock alert sent to admin`,
            sent: result.success ? 1 : 0,
            productsNotified: toNotify.length,
            error: result.error || undefined,
        });
    } catch (error: any) {
        console.error('WA stock alert cron error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
