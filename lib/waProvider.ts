// Provider kedua di samping Fonnte, sesuai blueprint-teknis-internal.md section 1.4
// ("Bungkus jadi lib/waProvider.ts, tambah implementasi [provider baru], switch via config")
// dan keputusan client di chat: gak mau dikunci ke satu provider resmi tertentu.
//
// BalesOtomatis.id (https://api.balesotomatis.id) punya DUA mode koneksi dengan
// AUTH & ENDPOINT YANG BEDA — ini bukan detail sepele, féls kalau ketuker:
//   - 'unofficial' (scan QR, no Meta approval): auth pakai `api_key` + `number_id`,
//     endpoint di /send_personal_message.
//   - 'waba' (WhatsApp Business API resmi, perlu verifikasi Meta): auth pakai
//     `secret_key` + `licenses_key`, endpoint di /send_meta_personal_message.
// Field `number_id` (unofficial) mengacu ke salah satu device yang sudah di-scan
// QR di akun BalesOtomatis tenant — lihat getBalesOtomatisInfo() buat lihat device
// mana aja yang connected sebelum kirim.
//
// ⚠️ QUIRK API MEREKA (bukan typo kita — JANGAN "dibetulin"): endpoint WABA
// /send_meta_personal_message minta field bernama `reciptient` (bukan `recipient`),
// sedangkan /send_message_template minta `recipients` (jamak, ejaan benar). Field
// ini WAJIB persis sesuai spesifikasi Postman collection mereka atau request gagal.

const BASE_URL = 'https://api.balesotomatis.id/public/v1';

export type BalesOtomatisMode = 'unofficial' | 'waba';

export interface BalesOtomatisUnofficialConfig {
    mode: 'unofficial';
    apiKey: string;
    numberId: string;
}

export interface BalesOtomatisWabaConfig {
    mode: 'waba';
    secretKey: string;
    licensesKey: string;
}

export type BalesOtomatisConfig = BalesOtomatisUnofficialConfig | BalesOtomatisWabaConfig;

export interface WaProviderConfig {
    provider: 'fonnte' | 'balesotomatis';
    fonnteToken?: string;
    balesotomatis?: BalesOtomatisConfig;
}

export interface ProviderSendResult {
    success: boolean;
    data?: unknown;
    error?: string;
}

/** "6281234567890" -> { countryCode: "62", localNumber: "81234567890" }.
 *  BalesOtomatis (kedua mode) minta phone_no & country_code TERPISAH, beda dari
 *  Fonnte yang cukup 1 field gabungan. Asumsi nomor Indonesia (country code 62),
 *  konsisten sama lib/phone.ts::normalizeIndonesianPhone yang udah dipakai di codebase. */
export function splitIndonesianPhone(phone: string): { countryCode: string; localNumber: string } {
    const digits = String(phone || '').replace(/\D/g, '');
    if (digits.startsWith('62')) {
        return { countryCode: '62', localNumber: digits.slice(2) };
    }
    if (digits.startsWith('0')) {
        return { countryCode: '62', localNumber: digits.slice(1) };
    }
    return { countryCode: '62', localNumber: digits };
}

function parseBalesOtomatisResponse(data: any): ProviderSendResult {
    const success = data?.code === '200' || data?.code === 200;
    if (success) return { success: true, data };

    // `message` bisa berupa string (Un-Official) ATAU object {state, detail, ...} (WABA Conversations) -
    // lihat contoh response di Postman collection, dua bentuk ini beda per endpoint.
    const rawMessage = data?.message;
    const error =
        typeof rawMessage === 'string'
            ? rawMessage
            : rawMessage?.detail || rawMessage?.state || JSON.stringify(rawMessage) || `BalesOtomatis error (code ${data?.code})`;

    return { success: false, error };
}

async function postJson(path: string, body: Record<string, unknown>): Promise<any> {
    const response = await fetch(`${BASE_URL}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    const text = await response.text();
    try {
        return text ? JSON.parse(text) : {};
    } catch {
        const cleanMsg = text && (text.trim().startsWith('<') || text.includes('<!DOCTYPE') || text.includes('<html'))
            ? `Server WABA BalesOtomatis merespons HTTP ${response.status} (Endpoint tidak tersedia / halaman HTML)`
            : text;
        return { code: String(response.status), message: cleanMsg };
    }
}

export async function sendViaBalesOtomatis(
    cfg: BalesOtomatisConfig,
    phone: string,
    message: string
): Promise<ProviderSendResult> {
    const { countryCode, localNumber } = splitIndonesianPhone(phone);

    try {
        if (cfg.mode === 'waba') {
            if (!cfg.secretKey || !cfg.licensesKey) {
                return { success: false, error: 'BalesOtomatis WABA belum dikonfigurasi (secretKey/licensesKey kosong).' };
            }
            // Endpoint ini butuh 24-jam time window aktif (customer harus pernah chat duluan
            // dalam 24 jam terakhir) - kalau dipakai buat notifikasi proaktif (reminder, invoice)
            // di luar window, BalesOtomatis akan reject dan tenant PERLU pakai Send Template
            // (/send_message_template) yang butuh template pre-approved Meta, bukan free text.
            const data = await postJson('/send_meta_personal_message', {
                secret_key: cfg.secretKey,
                licenses_key: cfg.licensesKey,
                reciptient: `${countryCode}${localNumber}`, // nama field ini emang typo dari sononya, lihat catatan di atas
                platform: 'whatsapp',
                message,
                method_send: 'async',
            });
            return parseBalesOtomatisResponse(data);
        }

        // mode 'unofficial' (scan QR)
        if (!cfg.apiKey || !cfg.numberId) {
            return { success: false, error: 'BalesOtomatis Un-Official belum dikonfigurasi (apiKey/numberId kosong).' };
        }
        const data = await postJson('/send_personal_message', {
            api_key: cfg.apiKey,
            number_id: cfg.numberId,
            enable_typing: '1',
            method_send: 'async',
            phone_no: localNumber,
            country_code: countryCode,
            message,
        });
        return parseBalesOtomatisResponse(data);
    } catch (error: any) {
        return { success: false, error: error?.message || 'Unknown error while sending via BalesOtomatis' };
    }
}

/** WABA gak punya endpoint /info kayak Un-Official. Get List Templates dipakai sebagai
 * tes koneksi paling ringan buat mode ini — kalau secret_key/licenses_key salah, endpoint
 * ini bakal balikin error, kalau bener bakal balikin list (boleh kosong). */
export async function testBalesOtomatisWaba(
    secretKey: string,
    licensesKey: string
): Promise<{ success: boolean; templateCount?: number; templates?: any[]; error?: string }> {
    if (!secretKey || !licensesKey) return { success: false, error: 'Kredensial WABA kosong.' };
    try {
        const data = await postJson('/get-template-list', {
            secret_key: secretKey,
            licenses_key: licensesKey,
            search: '',
            order_by: 'template_created_at',
            order_dir: 'desc',
            start: 0,
            length: 100,
        });
        if (data?.code !== '200' && data?.code !== 200 && !data?.success && data?.status !== true) {
            return { success: false, error: typeof data?.message === 'string' ? data.message : 'Kredensial WABA tidak valid' };
        }
        const templates = Array.isArray(data?.data) ? data.data : (Array.isArray(data?.templates) ? data.templates : []);
        return { success: true, templateCount: templates.length, templates };
    } catch (error: any) {
        return { success: false, error: error?.message || 'Unknown error' };
    }
}

export async function createBalesOtomatisTemplate(
    secretKey: string,
    licensesKey: string,
    templateName: string,
    message: string,
    category: string = 'UTILITY',
    language: string = 'id'
): Promise<{ success: boolean; data?: any; error?: string }> {
    if (!secretKey || !licensesKey) return { success: false, error: 'Kredensial WABA kosong.' };
    try {
        const cleanName = templateName.toLowerCase().replace(/[^a-z0-9_]/g, '_');
        const payload = {
            secret_key: secretKey,
            licenses_key: licensesKey,
            template_name: cleanName,
            language: language,
            category: category,
            components: [
                {
                    type: "BODY",
                    text: message
                }
            ]
        };
        const candidateEndpoints = ['/create_template', '/add_template', '/create-template', '/add-template', '/create_message_template', '/add_message_template'];
        for (const endpoint of candidateEndpoints) {
            const data = await postJson(endpoint, payload);
            if (data?.code === '200' || data?.code === 200 || data?.success || data?.status === true) {
                return { success: true, data };
            }
        }
        return { 
            success: false, 
            error: 'Endpoint pembuatan template otomatis di API BalesOtomatis WABA tidak tersedia atau merespons HTTP 404. Silakan buat dan ajukan template secara langsung melalui dashboard BalesOtomatis atau Meta Business Suite.' 
        };
    } catch (error: any) {
        return { success: false, error: error?.message || 'Gagal menghubungi server WABA Meta' };
    }
}


export async function sendTemplateViaBalesOtomatis(
    cfg: BalesOtomatisWabaConfig,
    phone: string,
    templateName: string,
    languageCode: string = 'id',
    parameters: Array<{ type: 'text'; text: string }> = []
): Promise<ProviderSendResult> {
    const { countryCode, localNumber } = splitIndonesianPhone(phone);
    try {
        if (!cfg.secretKey || !cfg.licensesKey) {
            return { success: false, error: 'BalesOtomatis WABA belum dikonfigurasi.' };
        }
        const data = await postJson('/send_message_template', {
            secret_key: cfg.secretKey,
            licenses_key: cfg.licensesKey,
            recipients: [`${countryCode}${localNumber}`],
            template_name: templateName,
            language: languageCode,
            parameters,
            method_send: 'async',
        });
        return parseBalesOtomatisResponse(data);
    } catch (error: any) {
        return { success: false, error: error?.message || 'Gagal mengirim template WABA' };
    }
}

export interface BalesOtomatisDevice {
    number_id: string;
    number_whatsapp: string;
    state_connection: string;
    last_connected_at: string;
}

/** Buat halaman "status koneksi WA" di Settings tenant - cek device mana yang
 * connected sebelum tenant coba kirim pesan (mode 'unofficial' aja, WABA gak
 * punya konsep "device", nomornya melekat ke licenses_key). */
export async function getBalesOtomatisInfo(
    apiKey: string
): Promise<{ success: boolean; devices?: BalesOtomatisDevice[]; error?: string }> {
    if (!apiKey) return { success: false, error: 'API key kosong' };
    try {
        const data = await postJson('/info', { api_key: apiKey });
        if (data?.code !== '200') {
            return { success: false, error: typeof data?.message === 'string' ? data.message : 'Gagal mengambil info akun BalesOtomatis' };
        }
        return { success: true, devices: data?.info?.devices || [] };
    } catch (error: any) {
        return { success: false, error: error?.message || 'Unknown error' };
    }
}

/**
 * Bangun WaProviderConfig dari dokumen Settings tenant (models/Settings.ts).
 * Call site tinggal: `sendWhatsApp(phone, msg, getWaProviderConfigFromSettings(settings), storeId)`
 * — gak perlu tau nama field mentahnya satu-satu.
 */
export function getWaProviderConfigFromSettings(settings: any): WaProviderConfig {
    if (settings?.waProvider === 'balesotomatis') {
        const mode: BalesOtomatisMode = settings?.balesotomatisMode === 'waba' ? 'waba' : 'unofficial';
        const { decryptFonnteToken } = require('@/lib/encryption');
        
        return {
            provider: 'balesotomatis',
            balesotomatis:
                mode === 'waba'
                    ? { 
                        mode: 'waba', 
                        secretKey: settings?.balesotomatisSecretKey ? decryptFonnteToken(String(settings.balesotomatisSecretKey).trim()) : '', 
                        licensesKey: settings?.balesotomatisLicensesKey ? decryptFonnteToken(String(settings.balesotomatisLicensesKey).trim()) : '' 
                      }
                    : { 
                        mode: 'unofficial', 
                        apiKey: settings?.balesotomatisApiKey ? decryptFonnteToken(String(settings.balesotomatisApiKey).trim()) : '', 
                        numberId: settings?.balesotomatisNumberId || '' 
                      },
        };
    }
    
    if (settings?.fonnteToken) {
        const { decryptFonnteToken } = require('@/lib/encryption');
        return { provider: 'fonnte', fonnteToken: decryptFonnteToken(String(settings.fonnteToken).trim()) };
    }
    
    return { provider: 'fonnte', fonnteToken: '' };
}

/**
 * Tujuan pengiriman pesan WA — menentukan provider mana yang dipakai di mode hybrid.
 * - 'notification' → notifikasi individual (nota, reminder, follow-up, birthday, stok alert, dll)
 * - 'campaign'     → marketing blast / broadcast massal
 */
export type WaSendPurpose = 'notification' | 'campaign';

/**
 * Smart Router: pilih provider berdasarkan tujuan pengiriman.
 * 
 * Kalau waHybridMode AKTIF:
 *   - notification → selalu pakai FONNTE (murah, flat/unlimited)
 *   - campaign     → selalu pakai BALESOTOMATIS WABA (resmi Meta, aman dari ban)
 * 
 * Kalau waHybridMode MATI (default):
 *   - return provider tunggal yang dipilih di settings (backward compatible)
 */
export function getWaProviderConfigForPurpose(settings: any, purpose: WaSendPurpose): WaProviderConfig {
    // Mode hybrid aktif — routing berdasarkan tujuan
    if (settings?.waHybridMode === true) {
        const { decryptFonnteToken } = require('@/lib/encryption');

        if (purpose === 'notification') {
            // Notifikasi → Fonnte (murah, unlimited)
            const token = settings?.fonnteToken 
                ? decryptFonnteToken(String(settings.fonnteToken).trim()) 
                : '';
            return { provider: 'fonnte', fonnteToken: token };
        }

        // Campaign → BalesOtomatis WABA (resmi Meta)
        return {
            provider: 'balesotomatis',
            balesotomatis: {
                mode: 'waba' as const,
                secretKey: settings?.balesotomatisSecretKey 
                    ? decryptFonnteToken(String(settings.balesotomatisSecretKey).trim()) 
                    : '',
                licensesKey: settings?.balesotomatisLicensesKey 
                    ? decryptFonnteToken(String(settings.balesotomatisLicensesKey).trim()) 
                    : '',
            },
        };
    }

    // Mode single-provider (default, backward compatible)
    return getWaProviderConfigFromSettings(settings);
}
