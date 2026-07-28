import { NextRequest, NextResponse } from 'next/server';
import { getTenantModels } from '@/lib/tenantDb';
import { sendWhatsApp } from '@/lib/fonnte';
import { decryptFonnteToken } from '@/lib/encryption';
import { normalizeIndonesianPhone } from '@/lib/phone';

export async function POST(request: NextRequest) {
    // Verify cron secret
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tenantSlug = request.headers.get('x-store-slug') || 'pusat';
    const { Settings, Appointment } = await getTenantModels(tenantSlug);

    try {
        const settings: any = await Settings.findOne({}).lean();
        if (!settings?.waAppointmentReminderEnabled) {
            return NextResponse.json({ success: true, message: 'Appointment reminder disabled' });
        }

        const minutesBefore = settings.waAppointmentReminderMinutesBefore || 60;
        const { getWaProviderConfigFromSettings, getWaProviderConfigForPurpose } = require('@/lib/waProvider');
        const waConfig = getWaProviderConfigForPurpose(settings, 'notification');

        if (!waConfig || (waConfig.provider === 'fonnte' && !waConfig.fonnteToken)) {
            return NextResponse.json({ error: 'WA Provider not configured' }, { status: 500 });
        }

        // Find appointments that start within the reminder window
        // Window: now + minutesBefore ± 8 minutes tolerance (for 15-min cron intervals)
        const now = new Date();
        const targetTime = new Date(now.getTime() + minutesBefore * 60 * 1000);
        const windowStart = new Date(targetTime.getTime() - 8 * 60 * 1000);
        const windowEnd = new Date(targetTime.getTime() + 8 * 60 * 1000);

        // Get today's date boundaries
        const todayStart = new Date(now);
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date(now);
        todayEnd.setHours(23, 59, 59, 999);

        // Find appointments today that haven't been reminded yet
        const appointments: any[] = await Appointment.find({
            date: { $gte: todayStart, $lte: todayEnd },
            status: { $in: ['pending', 'confirmed'] },
            reminderSent: { $ne: true },
        })
            .populate('customer', 'name phone waNotifEnabled')
            .populate('staff', 'name')
            .lean();

        // Filter by start time within the window
        const eligibleAppointments = appointments.filter((appt: any) => {
            if (!appt.startTime) return false;
            const [hours, minutes] = appt.startTime.split(':').map(Number);
            const apptDateTime = new Date(appt.date);
            apptDateTime.setHours(hours, minutes, 0, 0);
            return apptDateTime >= windowStart && apptDateTime <= windowEnd;
        });

        let sent = 0, failed = 0;

        for (const appt of eligibleAppointments) {
            const customer: any = appt.customer;
            if (!customer?.phone) continue;
            if (customer.waNotifEnabled === false) continue;

            const serviceNames = appt.services?.map((s: any) => s.name).join(', ') || '-';

            // Build date string
            const tz = settings?.timezone || 'Asia/Jakarta';
            const dateOptions: Intl.DateTimeFormatOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: tz };
            const dateStr = new Date(appt.date).toLocaleDateString('id-ID', dateOptions);

            // Build message from template
            let message = settings.waAppointmentReminderDefaultTemplate ||
                'Halo {{customerName}} 👋\n\nIni reminder, Anda ada janji di *{{storeName}}* hari ini:\n📅 {{date}} pukul *{{time}}*\nLayanan: {{services}}\nStaff: {{staffName}}\n\nSampai jumpa! 💆';

            message = message
                .replace(/\{\{customerName\}\}/g, customer.name || 'Pelanggan')
                .replace(/\{\{storeName\}\}/g, settings.storeName || 'Salon')
                .replace(/\{\{date\}\}/g, dateStr)
                .replace(/\{\{time\}\}/g, appt.startTime || '-')
                .replace(/\{\{services\}\}/g, serviceNames)
                .replace(/\{\{staffName\}\}/g, (appt.staff as any)?.name || '-');

            try {
                const phone = normalizeIndonesianPhone(customer.phone);
                if (!phone) continue;

                const waResult = await sendWhatsApp(phone, message, waConfig);
                if (waResult.success) {
                    await Appointment.findByIdAndUpdate(appt._id, {
                        reminderSent: true,
                        reminderSentAt: new Date()
                    });
                    sent++;
                } else {
                    console.error(`[WA Reminder] Failed to send to ${customer.phone}:`, waResult.error);
                    failed++;
                }
            } catch (err) {
                console.error(`[WA Reminder] Exception for ${customer.phone}:`, err);
                failed++;
            }
        }

        return NextResponse.json({
            success: true,
            sent,
            failed,
            total: eligibleAppointments.length,
            message: `Processed ${eligibleAppointments.length} appointments: ${sent} sent, ${failed} failed`
        });
    } catch (error: any) {
        console.error('[WA Appointment Reminder] Error:', error);
        return NextResponse.json({ success: false, error: 'Failed to process reminders' }, { status: 500 });
    }
}
