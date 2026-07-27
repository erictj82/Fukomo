import { getTenantModels } from "@/lib/tenantDb";
import { NextRequest, NextResponse } from "next/server";
import { checkPermission } from "@/lib/rbac";
import { addDays, startOfDay, endOfDay, format } from "date-fns";
import {
    sendSMS,
    sendEmail,
    getAppointmentReminderSMS,
    getAppointmentReminderEmail,
    isEmailConfigured,
    isSMSConfigured,
} from "@/lib/notifications";
import { decryptFonnteToken } from '@/lib/encryption';
import { sendWhatsApp } from "@/lib/fonnte";
import { normalizeIndonesianPhone } from '@/lib/phone';

// POST /api/appointments/send-reminders - Send reminders for upcoming appointments
export async function POST(request: NextRequest, props: any) {
    const tenantSlug = request.headers.get('x-store-slug') || 'pusat';
    const { Appointment } = await getTenantModels(tenantSlug);

    try {
        const permissionError = await checkPermission(request, 'appointments', 'edit');
        if (permissionError) return permissionError;

        const body = await request.json();
        const { daysBefore = 1, method = 'both' } = body; // method: 'sms', 'email', 'wa', or 'both'

        const { Settings } = await getTenantModels(tenantSlug);
        const settings: any = await Settings.findOne({});
        const { getWaProviderConfigFromSettings } = require('@/lib/waProvider');
        const waConfig = getWaProviderConfigFromSettings(settings);

        const emailEnabled = await isEmailConfigured();
        const smsEnabled = await isSMSConfigured();
        const waEnabled = !!(waConfig?.provider === 'balesotomatis' ? waConfig.balesotomatis : (waConfig?.fonnteToken || process.env.FONNTE_TOKEN));

        if (!emailEnabled && !smsEnabled && !waEnabled) {
            return NextResponse.json({
                success: false,
                error: "Neither email, SMS, nor WA is configured. Please set up notifications in Settings.",
            }, { status: 500 });
        }

        const targetDate = addDays(new Date(), daysBefore);
        const startDate = startOfDay(targetDate);
        const endDate = endOfDay(targetDate);

        const appointments = await Appointment.find({
            date: { $gte: startDate, $lte: endDate },
            status: { $in: ['pending', 'confirmed'] },
            reminderSent: { $ne: true }
        })
            .populate('customer', 'name phone email')
            .populate('staff', 'name')
            .populate('services.service', 'name');

        if (appointments.length === 0) {
            return NextResponse.json({
                success: true,
                message: "No appointments found for reminders",
                count: 0
            });
        }

        const remindersSent = [];
        const errors = [];

        for (const appointment of appointments) {
            const customer: any = appointment.customer;
            const staff: any = appointment.staff;

            if (!customer) {
                errors.push({ appointmentId: appointment._id, error: "Customer not found" });
                continue;
            }

            if (!staff) {
                errors.push({ appointmentId: appointment._id, error: "Staff not found (possibly deleted)" });
                continue;
            }

            const dateStr = format(new Date(appointment.date), 'MMMM dd, yyyy');
            const timeStr = appointment.startTime;
            const services = appointment.services.map((s: any) => s.name);

            let smsSent = false;
            let emailSent = false;
            let waSent = false;

            // Send WA
            if ((method === 'wa' || method === 'both') && waEnabled && customer.phone) {
                const waMessage = 
                    `📅 *Pengingat Appointment — ${settings?.storeName || process.env.SALON_NAME || 'Salon'}*\n\n` +
                    `Halo *${customer.name}*,\n\n` +
                    `Ini adalah pengingat bahwa Anda memiliki appointment besok dengan detail:\n` +
                    `- Tanggal: *${dateStr}*\n` +
                    `- Waktu: *${timeStr}*\n` +
                    `- Staff: *${staff.name}*\n` +
                    `- Layanan: *${services.join(', ')}*\n\n` +
                    `Mohon datang tepat waktu. Jika ingin membatalkan/reschedule, silakan hubungi kami.\n` +
                    `Terima kasih!`;
                
                const normalizedPhone = normalizeIndonesianPhone(customer.phone);
                if (!normalizedPhone) {
                    errors.push({ appointmentId: appointment._id, error: "Invalid phone number" });
                    continue;
                }
                const result = await sendWhatsApp(normalizedPhone, waMessage, waConfig);
                waSent = result.success;

                await new Promise(r => setTimeout(r, 8000 + Math.floor(Math.random() * 7000)));
            }

            // Send SMS
            if ((method === 'sms' || method === 'both') && smsEnabled && customer.phone && !waSent) {
                const smsMessage = getAppointmentReminderSMS(
                    customer.name,
                    staff.name,
                    dateStr,
                    timeStr,
                    process.env.SALON_NAME || 'Our Salon'
                );

                smsSent = await sendSMS(customer.phone, smsMessage);
            }

            // Send Email
            if ((method === 'email' || method === 'both') && emailEnabled && customer.email) {
                const emailContent = getAppointmentReminderEmail(
                    customer.name,
                    staff.name,
                    dateStr,
                    timeStr,
                    services,
                    process.env.SALON_NAME || 'Our Salon',
                    process.env.SALON_PHONE,
                    process.env.SALON_ADDRESS
                );

                emailSent = await sendEmail(
                    customer.email,
                    emailContent.subject,
                    emailContent.html,
                    emailContent.text
                );
            }

            if (smsSent || emailSent || waSent) {
                appointment.reminderSent = true;
                appointment.reminderSentAt = new Date();
                await appointment.save();

                remindersSent.push({
                    appointmentId: appointment._id,
                    customerName: customer.name,
                    customerPhone: customer.phone,
                    customerEmail: customer.email,
                    date: appointment.date,
                    time: appointment.startTime,
                    waSent,
                    smsSent,
                    emailSent,
                });
            } else {
                errors.push({
                    appointmentId: appointment._id,
                    customerName: customer.name,
                    error: "Failed to send via any method"
                });
            }
        }

        return NextResponse.json({
            success: true,
            message: `Sent ${remindersSent.length} reminders`,
            count: remindersSent.length,
            reminders: remindersSent,
            errors: errors.length > 0 ? errors : undefined,
            config: {
                emailEnabled,
                smsEnabled,
            }
        });
    } catch (error: any) {
        console.error('Error sending reminders:', error);
        return NextResponse.json({
            success: false,
            error: error.message
        }, { status: 500 });
    }
}

// GET /api/appointments/send-reminders - Check appointments needing reminders
export async function GET(request: NextRequest, props: any) {
    const tenantSlug = request.headers.get('x-store-slug') || 'pusat';
    const { Appointment, Settings } = await getTenantModels(tenantSlug);

    try {
        const permissionError = await checkPermission(request, 'appointments', 'edit');
        if (permissionError) return permissionError;

        const settings = await Settings.findOne({}).lean() as any;
        const { getWaProviderConfigFromSettings } = require('@/lib/waProvider');
        const waConfig = getWaProviderConfigFromSettings(settings);

        const { searchParams } = new URL(request.url);
        const daysBefore = parseInt(searchParams.get("daysBefore") || "1");

        const targetDate = addDays(new Date(), daysBefore);
        const startDate = startOfDay(targetDate);
        const endDate = endOfDay(targetDate);

        const appointments = await Appointment.find({
            date: { $gte: startDate, $lte: endDate },
            status: { $in: ['pending', 'confirmed'] },
            reminderSent: { $ne: true }
        })
            .populate('customer', 'name phone email')
            .populate('staff', 'name');

        const count = appointments.length;

        return NextResponse.json({
            success: true,
            count,
            message: `${count} appointments need reminders`,
            appointments: appointments.map((apt: any) => ({
                id: apt._id,
                customer: apt.customer?.name,
                staff: apt.staff?.name,
                date: apt.date,
                time: apt.startTime,
                hasPhone: !!apt.customer?.phone,
                hasEmail: !!apt.customer?.email,
            })),
            config: {
                emailEnabled: await isEmailConfigured(),
                smsEnabled: await isSMSConfigured(),
                waEnabled: !!(waConfig?.provider === 'balesotomatis' ? waConfig.balesotomatis : (waConfig?.fonnteToken || process.env.FONNTE_TOKEN)),
            }
        });
    } catch (error: any) {
        return NextResponse.json({
            success: false,
            error: error.message
        }, { status: 500 });
    }
}