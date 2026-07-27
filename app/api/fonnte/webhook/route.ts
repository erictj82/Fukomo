import { getTenantModels } from "@/lib/tenantDb";
import { NextRequest, NextResponse } from 'next/server';
import { decryptFonnteToken } from '@/lib/encryption';
import { sendWhatsApp } from '@/lib/fonnte';

const normalizePhone = (phone: string): string => {
    const digits = String(phone || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('0')) return `62${digits.slice(1)}`;
    return digits;
};

const getInboundPhone = (payload: any): string => {
    const candidates = [
        payload?.sender,   // Field utama dari Fonnte
        payload?.from,
        payload?.number,
        payload?.phone,
        // payload?.device DIHAPUS — ini nomor device owner, bukan customer
        payload?.chat,
    ];
    const found = candidates.find((value) => typeof value === 'string' && value.trim().length > 0);
    return String(found || '').trim();
};

const getInboundMessage = (payload: any): string => {
    const candidates = [
        payload?.message,
        payload?.text,
        payload?.msg,
        payload?.body,
        payload?.content,
    ];
    const found = candidates.find((value) => typeof value === 'string' && value.trim().length > 0);
    return String(found || '').trim();
};

const getInboundCustomerName = (payload: any): string => {
    const candidates = [
        payload?.name,
        payload?.pushname,
        payload?.sender_name,
        payload?.profile_name,
    ];
    const found = candidates.find((value) => typeof value === 'string' && value.trim().length > 0);
    return String(found || 'Customer').trim();
};

const renderTemplate = (message: string, vars: Record<string, string>): string => {
    return String(message || '').replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key: string) => vars[key] ?? '');
};

// Returns null jika greeting di-disable global atau tidak ada template aktif
const getGreetingMessage = async (models: any): Promise<{ message: string, waConfig?: import('@/lib/waProvider').WaProviderConfig } | null> => {
    const { WaTemplate, Settings } = models;

    // Cek global toggle dulu
    const settings = await Settings.findOne().select('greetingEnabled fonnteToken waProvider balesotomatisMode balesotomatisApiKey balesotomatisNumberId balesotomatisSecretKey balesotomatisLicensesKey').lean() as any;
    if (settings?.greetingEnabled === false) {
        return null; // Greeting di-disable dari Settings — early exit
    }

    const { getWaProviderConfigFromSettings } = require('@/lib/waProvider');
    const waConfig = getWaProviderConfigFromSettings(settings);

    const activeGreetingTemplate = await WaTemplate.findOne({
        isGreetingEnabled: true,
        $or: [
            { templateType: 'greeting' },
            { templateType: { $exists: false } },
        ],
    })
        .select('message')
        .sort({ createdAt: -1 })
        .lean() as any;

    if (activeGreetingTemplate?.message) {
        return { message: String(activeGreetingTemplate.message), waConfig };
    }

    // Jika tidak ada template aktif, fallback ke env
    // Tapi hanya kirim jika greetingEnabled tidak secara eksplisit false
    return {
        message: process.env.WA_GREETING_MESSAGE || 'Halo, terima kasih sudah menghubungi kami. Admin salon akan membalas pesan Anda secepatnya.',
        waConfig
    };
};

export async function GET() {
    return NextResponse.json({ success: true, message: 'Fonnte webhook endpoint is reachable' });
}

export async function POST(request: NextRequest, props: any) {
    const tenantSlug = request.headers.get('x-store-slug') || 'pusat';
    const models = await getTenantModels(tenantSlug);
    const { WaGreetingLog } = models;

    try {
        // SEC-02 FIX: Verifikasi Signature Webhook Fonnte
        const { Settings } = models;
        const settings = await Settings.findOne().select('fonnteToken waProvider balesotomatisMode balesotomatisApiKey balesotomatisNumberId balesotomatisSecretKey balesotomatisLicensesKey storeName').lean() as any;
        const { getWaProviderConfigFromSettings } = require('@/lib/waProvider');
        const expectedWaConfig = getWaProviderConfigFromSettings(settings);
        
        const authHeader = request.headers.get('authorization');
        
        // Fonnte sends the token either directly or with Bearer prefix. We check both.
        if (expectedWaConfig?.provider === 'fonnte' && expectedWaConfig.fonnteToken) {
            const incomingToken = authHeader?.replace('Bearer ', '')?.trim();
            if (!incomingToken || incomingToken !== expectedWaConfig.fonnteToken) {
                console.warn(`[FONNTE_WEBHOOK] Unauthorized access attempt. IP: ${request.headers.get('x-forwarded-for') || 'unknown'}`);
                return NextResponse.json({ success: false, error: 'Unauthorized webhook signature' }, { status: 401 });
            }
        } else {
            console.warn('[FONNTE_WEBHOOK] Tenant has no fonnteToken configured. Accepting payload blindly.');
        }

        const contentType = request.headers.get('content-type') || '';
        let payload: any = null;

        if (contentType.includes('application/json')) {
            payload = await request.json();
        } else if (contentType.includes('application/x-www-form-urlencoded')) {
            const form = await request.formData();
            payload = Object.fromEntries(form.entries());
        } else {
            const raw = await request.text();
            payload = { raw };
        }

        console.log('[FONNTE_WEBHOOK]', payload);

        const rawPhone = getInboundPhone(payload);
        const message = getInboundMessage(payload);
        const customerName = getInboundCustomerName(payload);
        const normalizedPhone = normalizePhone(rawPhone);

        if (!normalizedPhone || !message) {
            return NextResponse.json({ success: true, skipped: true, reason: 'non-chat payload' });
        }

        // BLOCK-08 FIX: Opt-out mechanism — handle "STOP" keyword
        const lowerMsg = message.toLowerCase().trim();
        if (lowerMsg === 'stop' || lowerMsg === 'berhenti' || lowerMsg === 'unsubscribe') {
            const { Customer } = models;
            // Cari customer berdasarkan nomor HP (normalized) dan disable WA notif
            const updated = await Customer.updateMany(
                { $or: [{ phone: normalizedPhone }, { phone: rawPhone }] },
                { $set: { waNotifEnabled: false } }
            );
            console.log(`[FONNTE_WEBHOOK] Opt-out: ${normalizedPhone} (${updated.modifiedCount} customer(s) updated)`);

            // Kirim konfirmasi opt-out
            const storeName = settings?.storeName || 'Salon';
            await sendWhatsApp(normalizedPhone, `✅ Anda telah berhenti menerima pesan promosi dari ${storeName}. Jika ingin berlangganan kembali, silakan hubungi kami.`, expectedWaConfig);

            return NextResponse.json({ success: true, optedOut: true, phone: normalizedPhone });
        }

        // Cek greeting message SEBELUM insert log
        // Kalau null (greeting di-disable), langsung skip — jangan insert log dulu
        const greetingData = await getGreetingMessage(models);
        if (greetingData === null) {
            return NextResponse.json({ success: true, skipped: true, reason: 'greeting disabled' });
        }

        // Atomic Upsert Lock — prevent spam race condition
        const existingGreeting = await WaGreetingLog.findOneAndUpdate(
            { phoneNormalized: normalizedPhone },
            {
                $setOnInsert: {
                    phoneRaw: rawPhone,
                    firstMessageAt: new Date()
                }
            },
            { upsert: true, new: false }
        );

        if (existingGreeting) {
            return NextResponse.json({ success: true, skipped: true, reason: 'already greeted' });
        }

        // Render template dengan variabel
        const greetingMessage = renderTemplate(greetingData.message, {
            nama_customer: customerName,
            nama_service: process.env.SALON_NAME || 'salon kami',
        });

        const sendResult = await sendWhatsApp(normalizedPhone, greetingMessage, greetingData.waConfig);

        if (!sendResult.success) {
            // Hapus log yang tadi di-insert supaya bisa retry
            await WaGreetingLog.deleteOne({ phoneNormalized: normalizedPhone });
            return NextResponse.json(
                {
                    success: false,
                    error: sendResult.error || 'Failed to send greeting message',
                },
                { status: 500 }
            );
        }

        // Update log hanya setelah WA berhasil terkirim
        await WaGreetingLog.updateOne(
            { phoneNormalized: normalizedPhone },
            { $set: { greetingSentAt: new Date() } }
        );

        return NextResponse.json({ success: true, greeted: true, phone: normalizedPhone });
    } catch (error: any) {
        return NextResponse.json(
            { success: false, error: error?.message || 'Failed to process webhook payload' },
            { status: 500 }
        );
    }
}