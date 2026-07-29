import { decryptFonnteToken } from './encryption';
import { tryConsumeUsage } from './subscriptionEnforcement';
import { sendViaBalesOtomatis, type WaProviderConfig, type WaMediaOptions } from './waProvider';

export interface SendWhatsAppResult {
    success: boolean;
    data?: unknown;
    error?: string;
    blocked?: boolean; // true kalau gagal karena kuota WA plan abis (bukan error Fonnte)
    quota?: { currentUsage: number; limit: number };
}

/**
 * Send a WhatsApp message via the tenant's configured provider (Fonnte or BalesOtomatis).
 * @param phone - Target phone number
 * @param message - Message body
 * @param providerConfig - Either a plain Fonnte token string (LEGACY — every existing call site
 *   passes this today, keep working exactly as before with zero changes), or a WaProviderConfig
 *   object (from lib/waProvider.ts::getWaProviderConfigFromSettings) to route through BalesOtomatis
 *   instead. This dual-type param is intentional: it lets call sites migrate one at a time instead
 *   of a single risky mass find-and-replace (see the postmortem in git history 20/7 — a previous
 *   mass-enforcement change without staged rollout took down a live tenant).
 * @param storeId - Optional Master DB Store._id. Kalau dikasih, WA quota (SaasPlan.maxWaMessagesPerMonth)
 *   di-cek & di-consume SEBELUM kirim, terlepas dari provider mana yang dipakai. Sengaja OPSIONAL supaya
 *   call site yang belum di-update tetap jalan seperti biasa (unenforced) - lihat
 *   blueprint-teknis-internal.md section 1.4, daftar call site yang masih perlu di-migrate.
 *   Notifikasi PLATFORM (approval toko baru, dsb di lib/provisioning.ts) SENGAJA gak lewat
 *   fungsi ini - itu WA dari platform pakai token global, bukan kuota WA milik tenant.
 */
export async function sendWhatsApp(
    phone: string,
    message: string,
    providerConfig?: string | WaProviderConfig,
    storeId?: string,
    mediaOptions?: WaMediaOptions
): Promise<SendWhatsAppResult> {
    if (storeId) {
        const usageCheck = await tryConsumeUsage(storeId, 'wa', 1);
        if (!usageCheck.allowed) {
            return {
                success: false,
                blocked: true,
                error:
                    usageCheck.reason === 'no_active_subscription'
                        ? 'Toko belum punya langganan aktif.'
                        : `Kuota pesan WA bulan ini (${usageCheck.limit}) sudah habis. Upgrade paket atau beli add-on WA.`,
                quota: usageCheck.limit !== undefined ? { currentUsage: usageCheck.currentUsage ?? usageCheck.limit, limit: usageCheck.limit } : undefined,
            };
        }
    }

    if (!phone || !message) {
        return { success: false, error: 'phone and message are required' };
    }

    // providerConfig sebagai object = tenant ini udah di-migrate ke abstraksi provider baru.
    if (providerConfig && typeof providerConfig === 'object') {
        if (providerConfig.provider === 'balesotomatis') {
            if (!providerConfig.balesotomatis) {
                return { success: false, error: 'Konfigurasi BalesOtomatis kosong.' };
            }
            const result = await sendViaBalesOtomatis(providerConfig.balesotomatis, phone, message, mediaOptions);
            return result;
        }
        // provider === 'fonnte' tapi dibungkus object (dari getWaProviderConfigFromSettings) -
        // lanjut ke jalur Fonnte biasa di bawah dengan token dari dalam object-nya.
        return sendViaFonnte(phone, message, providerConfig.fonnteToken, mediaOptions);
    }

    // providerConfig sebagai string (atau undefined) = jalur LEGACY, behavior sama persis kayak sebelumnya.
    return sendViaFonnte(phone, message, providerConfig, mediaOptions);
}

async function sendViaFonnte(phone: string, message: string, fonnteToken?: string, mediaOptions?: WaMediaOptions): Promise<SendWhatsAppResult> {
    let token = (fonnteToken ?? '').trim();

    // If caller passed a token, use it as-is (caller is responsible for decrypting).
    // Only attempt decrypt if falling back to FONNTE_TOKEN env var.
    if (!token) {
        const envToken = (process.env.FONNTE_TOKEN || '').trim();
        if (envToken) {
            try {
                token = decryptFonnteToken(envToken);
            } catch (decryptErr: any) {
                console.error('[FONNTE] Env token decrypt failed, using raw:', decryptErr.message);
                token = envToken; // Fallback to raw env token
            }
        }
    }

    if (!token) {
        return { success: false, error: 'FONNTE_TOKEN is not configured. Pass token or set env variable.' };
    }

    if (!phone || !message) {
        return { success: false, error: 'phone and message are required' };
    }

    try {
        const payload: any = {
            target: phone,
            message: message,
        };

        if (mediaOptions?.url) {
            payload.url = mediaOptions.url;
            if (mediaOptions.fileName) {
                payload.filename = mediaOptions.fileName;
            }
        } else if (mediaOptions?.type === 'location' && mediaOptions.lat && mediaOptions.long) {
            payload.location = `${mediaOptions.lat},${mediaOptions.long}`;
        }

        const response = await fetch('https://api.fonnte.com/send', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: token,
            },
            body: JSON.stringify(payload),
        });

        const text = await response.text();
        let parsed: unknown = text;

        try {
            parsed = text ? JSON.parse(text) : null;
        } catch {
            parsed = text;
        }

        if (!response.ok) {
            return {
                success: false,
                error: `Fonnte request failed with status ${response.status}`,
                data: parsed,
            };
        }

        // Fonnte can return HTTP 200 with { status: false, reason: "..." }.
        if (parsed && typeof parsed === 'object' && 'status' in (parsed as Record<string, unknown>)) {
            const apiStatus = Boolean((parsed as Record<string, unknown>).status);
            if (!apiStatus) {
                const reason = String((parsed as Record<string, unknown>).reason || 'Fonnte API returned status=false');
                return {
                    success: false,
                    error: reason,
                    data: parsed,
                };
            }
        }

        return { success: true, data: parsed };
    } catch (error: any) {
        return {
            success: false,
            error: error?.message || 'Unknown error while sending WhatsApp message',
        };
    }
}

/**
 * Validate if a phone number is registered on WhatsApp via Fonnte API.
 * Use this before blast/campaign to filter out invalid numbers.
 */
export async function validateWhatsAppNumber(
    phone: string,
    fonnteToken?: string
): Promise<{ valid: boolean; registered: boolean }> {
    const token = (fonnteToken || process.env.FONNTE_TOKEN || '').trim();
    if (!token || !phone) return { valid: false, registered: false };

    try {
        const response = await fetch('https://api.fonnte.com/validate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: token,
            },
            body: JSON.stringify({
                target: phone,
            }),
        });
        const data = await response.json() as any;
        return {
            valid: data?.status === true,
            registered: data?.registered === true,
        };
    } catch {
        return { valid: false, registered: false };
    }
}
