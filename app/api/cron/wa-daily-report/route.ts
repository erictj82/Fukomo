import { getTenantModels } from "@/lib/tenantDb";
/**
 * GET /api/cron/wa-daily-report
 * Send daily sales summary to the owner via WA.
 */
import { NextRequest, NextResponse } from 'next/server';



import { decryptFonnteToken } from '@/lib/encryption';
import { sendWhatsApp } from '@/lib/fonnte';

import { getCurrentDateInTimezone, getUtcRangeForDateRange } from '@/lib/dateUtils';

export async function GET(request: NextRequest, props: any) {
    const tenantSlug = request.headers.get('x-store-slug') || 'pusat';
    const { Invoice, Settings } = await getTenantModels(tenantSlug);

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
        const reportTime = settings?.dailyReportTime || '21:00';
        const schedCheck = checkScheduleTime(reportTime);
        if (!schedCheck.ready) {
            return NextResponse.json({
                success: true,
                message: `Skipped: ${schedCheck.reason}`,
                sent: 0,
                skipped: true,
            });
        }
        // === END CHECK ===

        const ownerPhone = settings?.waOwnerNumber;
        const storeName = settings?.storeName || 'Salon';
        const { getWaProviderConfigFromSettings, getWaProviderConfigForPurpose } = require('@/lib/waProvider');
        const waConfig = getWaProviderConfigForPurpose(settings, 'notification');



        if (!ownerPhone) {
            return NextResponse.json({
                success: true,
                message: 'No owner WA number configured in settings',
                sent: 0,
            });
        }

        // Get today's date range
        const tz = settings?.timezone || 'Asia/Jakarta';
        const todayStr = getCurrentDateInTimezone(tz);
        const { start: startOfDay, end: endOfDay } = getUtcRangeForDateRange(todayStr, todayStr, tz);

        // Query today's paid invoices
        const invoices = await Invoice.find({
            date: { $gte: startOfDay, $lt: endOfDay },
            status: 'paid',
        }).lean();

        // Calculate totals
        const totalCustomers = new Set(invoices.map((inv: any) => String(inv.customer))).size;
        const totalRevenue = invoices.reduce((sum: number, inv: any) => sum + (inv.totalAmount || 0), 0);
        const totalTips = invoices.reduce((sum: number, inv: any) => sum + (inv.tips || 0), 0);

        // Payment method breakdown
        const paymentBreakdown: Record<string, number> = {};
        for (const inv of invoices) {
            const methods = (inv as any).paymentMethods;
            if (Array.isArray(methods) && methods.length > 0) {
                for (const pm of methods) {
                    const method = pm.method || 'Other';
                    paymentBreakdown[method] = (paymentBreakdown[method] || 0) + (pm.amount || 0);
                }
            } else {
                const method = (inv as any).paymentMethod || 'Cash';
                paymentBreakdown[method] = (paymentBreakdown[method] || 0) + ((inv as any).amountPaid || 0);
            }
        }

        // BUG-04 FIX: Check if Automation scheduler is already handling daily_report
        // to prevent double-sending
        try {
            const { WaAutomation } = await getTenantModels(tenantSlug);
            const activeAutoRule = await WaAutomation.findOne({
                category: 'daily_report',
                isActive: true,
            });
            if (activeAutoRule) {
                return NextResponse.json({
                    success: true,
                    message: 'Skipped: daily_report is handled by Automation Scheduler. Disable the automation rule to use this cron instead.',
                    sent: 0,
                    skipped: true,
                });
            }
        } catch (_) {
            // If WaAutomation model not available, proceed with cron
        }

        // Format day name in Indonesian based on timezone
        const now = new Date();
        const formatterDay = new Intl.DateTimeFormat('id-ID', { timeZone: tz, weekday: 'long' });
        const formatterDate = new Intl.DateTimeFormat('id-ID', {
            timeZone: tz,
            day: 'numeric',
            month: 'long',
            year: 'numeric',
        });
        const dayName = formatterDay.format(now);
        const dateStr = formatterDate.format(now);

        // BUG-03 FIX: fmtNum → angka murni tanpa prefix Rp (template sudah include "Rp")
        const fmtNum = (n: number) => n.toLocaleString('id-ID');
        const fmtRp = (n: number) => `Rp${n.toLocaleString('id-ID')}`;

        // Build payment breakdown text
        const paymentLines = Object.entries(paymentBreakdown)
            .map(([method, amount]) => `• ${method}: ${fmtRp(amount)}`)
            .join('\n');

        const tipsLine = totalTips > 0 ? `💝 Total Tips: *${fmtRp(totalTips)}*\n` : '';

        // BUG-01 FIX: Baca settings.waTemplateDailyReport, fallback ke DEFAULT_TEMPLATE
        const DEFAULT_TEMPLATE =
            `📊 *Laporan Harian — {{storeName}}*\n\n` +
            `📅 Hari {{dayName}}, {{date}}\n\n` +
            `👥 Total Customer Visit: *{{totalCustomers}} orang*\n` +
            `🧾 Total Transaksi: *{{totalTransactions}}*\n\n` +
            `💰 *Rincian Pembayaran:*\n{{paymentLines}}\n\n` +
            `💵 Total Pendapatan: *Rp{{totalAmount}}*\n{{tipsLine}}` +
            `\n— Generated by {{storeName}} POS System`;

        const rawTemplate: string = (settings as any)?.waTemplateDailyReport || DEFAULT_TEMPLATE;

        const message = rawTemplate
            .replace(/{{storeName}}/gi, storeName)
            .replace(/{{dayName}}/gi, dayName)
            .replace(/{{date}}/gi, dateStr)
            .replace(/{{totalCustomers}}|{{total_customers}}/gi, String(totalCustomers))
            .replace(/{{totalTransactions}}|{{total_transactions}}/gi, String(invoices.length))
            .replace(/{{totalAmount}}|{{total_revenue}}|{{totalRevenue}}/gi, fmtNum(totalRevenue))
            .replace(/{{paymentLines}}/gi, paymentLines || '• Belum ada transaksi')
            .replace(/{{tipsLine}}/gi, tipsLine)
            .replace(/{{totalTips}}|{{total_tips}}/gi, fmtNum(totalTips));

        const result = await sendWhatsApp(ownerPhone, message, waConfig);



        return NextResponse.json({
            success: true,
            message: 'Daily report sent to owner',
            sent: result.success ? 1 : 0,
            report: {
                date: dateStr,
                totalCustomers,
                totalTransactions: invoices.length,
                totalRevenue,
                totalTips,
                paymentBreakdown,
            },
            error: result.error || undefined,
        });
    } catch (error: any) {
        console.error('WA daily report cron error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
