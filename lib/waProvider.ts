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

export interface WaMediaOptions {
    type?: 'image' | 'document' | 'location';
    url?: string;
    fileName?: string; // used for document
    lat?: string;      // used for location
    long?: string;     // used for location
    locationName?: string; // used for location
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
    message: string,
    mediaOptions?: WaMediaOptions
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
            const payload: any = {
                secret_key: cfg.secretKey,
                licenses_key: cfg.licensesKey,
                reciptient: `${countryCode}${localNumber}`, // nama field ini emang typo dari sononya, lihat catatan di atas
                platform: 'whatsapp',
                method_send: 'async',
            };

            if (mediaOptions?.type === 'image' && mediaOptions.url) {
                payload.image_url = mediaOptions.url;
                payload.send_as_caption = 1;
                payload.message = message;
            } else if (mediaOptions?.type === 'document' && mediaOptions.url) {
                payload.file_url = mediaOptions.url;
                payload.fileName = mediaOptions.fileName || 'file.pdf';
                payload.messageType = 'document';
                if (message) payload.message = message;
            } else if (mediaOptions?.type === 'location' && mediaOptions.lat && mediaOptions.long) {
                payload.latitude = mediaOptions.lat;
                payload.longitude = mediaOptions.long;
                payload.nameLocation = mediaOptions.locationName || '';
                payload.messageType = 'location';
                if (message) payload.message = message;
            } else {
                payload.message = message;
            }

            const data = await postJson('/send_meta_personal_message', payload);
            return parseBalesOtomatisResponse(data);
        }

        // mode 'unofficial' (scan QR)
        if (!cfg.apiKey || !cfg.numberId) {
            return { success: false, error: 'BalesOtomatis Un-Official belum dikonfigurasi (apiKey/numberId kosong).' };
        }
        const payloadUnOfficial: any = {
            api_key: cfg.apiKey,
            number_id: cfg.numberId,
            enable_typing: '1',
            method_send: 'async',
            phone_no: localNumber,
            country_code: countryCode,
            message,
        };

        if (mediaOptions?.url) {
            payloadUnOfficial.url = mediaOptions.url;
            if (mediaOptions.type === 'document') payloadUnOfficial.type = 'document';
            else if (mediaOptions.type === 'image') payloadUnOfficial.type = 'image';
        }

        const data = await postJson('/send_personal_message', payloadUnOfficial);
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

// Contoh nilai per variabel yang dikenal — WAJIB dikirim ke Meta (`example.body_text`),
// tanpa ini Meta menolak / template nyangkut jadi draft. Key di-lowercase.
const TEMPLATE_SAMPLE_VALUES: Record<string, string> = {
    nama_customer: 'Budi Santoso',
    customername: 'Budi Santoso',
    customer_name: 'Budi Santoso',
    nama: 'Budi Santoso',
    nama_service: 'Hair Spa',
    service: 'Hair Spa',
    nama_layanan: 'Hair Spa',
    layanan: 'Hair Spa',
    storename: 'Salon Cantik',
    store_name: 'Salon Cantik',
    nama_toko: 'Salon Cantik',
    toko: 'Salon Cantik',
    salon: 'Salon Cantik',
    date: '9 Agustus 2026',
    tanggal: '9 Agustus 2026',
    time: '10:00',
    jam: '10:00',
    amount: 'Rp 150.000',
    total: 'Rp 150.000',
    nominal: 'Rp 150.000',
};

/**
 * Meta WABA template WAJIB pakai placeholder BERNOMOR ({{1}}, {{2}}, ...), BUKAN bernama
 * ({{nama_customer}}). Fungsi ini mengubah placeholder bernama → bernomor secara urut,
 * menyimpan urutan nama variabel asli (buat mapping saat kirim), dan menghasilkan contoh
 * nilai per variabel (buat `example.body_text`). Placeholder yang sudah bernomor dinormalkan
 * ulang jadi urut (mis. {{1}}, {{3}} → {{1}}, {{2}}). Nama yang sama dipakai ulang nomornya.
 */
export function convertToMetaTemplate(message: string): {
    text: string;
    variables: string[];
    examples: string[];
} {
    const variables: string[] = [];
    const seen = new Map<string, number>(); // nama (lowercase) -> nomor 1-based

    const text = String(message || '').replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_m, rawName) => {
        const name = String(rawName).trim();
        const key = name.toLowerCase();
        let idx = seen.get(key);
        if (idx === undefined) {
            variables.push(name);
            idx = variables.length;
            seen.set(key, idx);
        }
        return `{{${idx}}}`;
    });

    const examples = variables.map((name) => TEMPLATE_SAMPLE_VALUES[name.toLowerCase()] || 'Contoh');

    return { text, variables, examples };
}

export async function createBalesOtomatisTemplate(
    secretKey: string,
    licensesKey: string,
    templateName: string,
    message: string,
    category: string = 'UTILITY',
    language: string = 'id'
): Promise<{ success: boolean; data?: any; error?: string; variables?: string[] }> {
    if (!secretKey || !licensesKey) return { success: false, error: 'Kredensial WABA kosong.' };
    try {
        const cleanName = templateName.toLowerCase().replace(/[^a-z0-9_]/g, '_');
        const { text, variables, examples } = convertToMetaTemplate(message);

        // Format payload WAJIB ikut kontrak BalesOtomatis (BUKAN format Meta Graph mentah).
        // SDK resmi /create-template minta: `name`, `body` (string), `variables`
        // (array {placeholder,label,example}), dan `submitToFacebook`. Kirim `components`
        // ala Meta = ditolak / nyangkut sebagai draft, tidak pernah sampai ke Meta —
        // inilah kenapa template mentok "PENDING/draft" selamanya sebelum fix ini.
        const variablesPayload = variables.map((name, i) => ({
            placeholder: `{{${i + 1}}}`,
            label: name,
            // Meta minta contoh nilai untuk SETIAP variabel — tanpa example template ditolak.
            example: examples[i] || 'Contoh',
        }));

        const payload = {
            secret_key: secretKey,
            licenses_key: licensesKey,
            // Collection Postman /create-template pakai `licensesKey` (camelCase) sedangkan
            // endpoint lain pakai `licenses_key` (snake) — kirim dua-duanya biar aman.
            secretKey: secretKey,
            licensesKey: licensesKey,
            name: cleanName,
            language: language,
            category: category,
            // WAJIB true — tanpa ini template hanya tersimpan sebagai draft & tidak pernah
            // diajukan ke Meta (inilah gejala template nyangkut sebelumnya).
            submitToFacebook: true,
            body: text,
            variables: variablesPayload,
        };
        const data = await postJson('/create-template', payload);

        // HONEST success detection. BalesOtomatis balikin success:true TAPI fb_response:null
        // kalau template cuma tersimpan sebagai DRAFT (format non-conforming) — itu BUKAN sukses,
        // Meta gak pernah nerima jadi gak akan pernah APPROVED. Bukti terkirim ke Meta = fb_response
        // yang non-null (berisi status/id dari Meta). Tanpa itu → gagal, jangan ditandai PENDING.
        const fbResponse = data?.fb_response;
        if (fbResponse) {
            return { success: true, data, variables };
        }

        const rawMsg = typeof data?.message === 'string' ? data.message : '';
        if (/draft/i.test(rawMsg)) {
            return {
                success: false,
                error:
                    'Template hanya tersimpan sebagai draft dan TIDAK terkirim ke Meta. ' +
                    'Biasanya karena format tidak sesuai — pastikan placeholder valid, isi pesan jelas, dan kategori cocok (MARKETING untuk promo, UTILITY untuk notifikasi).',
            };
        }
        return {
            success: false,
            error: rawMsg || 'Gagal mengajukan template ke Meta. Pastikan kredensial WABA valid dan format template benar.',
        };
    } catch (error: any) {
        return { success: false, error: error?.message || 'Gagal menghubungi server WABA Meta' };
    }
}


/**
 * Ekstrak nama variabel dari body template — dukung placeholder bernama ({{nama_customer}})
 * MAUPUN bernomor ({{1}}). Dipakai buat backfill campaign lama / template yang metaVariables-nya
 * kosong (mis. hasil sync dari Meta yang cuma nyimpen bentuk bernomor). Urutan = kemunculan
 * pertama; nama/angka yang sama tidak diduplikasi. Placeholder bernomor dikembalikan apa adanya
 * ("1", "2") sehingga tetap punya "count" variabel yang benar walau tanpa nama asli.
 */
export function extractTemplateVariables(message: string): string[] {
    const variables: string[] = [];
    const seen = new Set<string>();
    String(message || '').replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_m, raw) => {
        const name = String(raw).trim();
        const key = name.toLowerCase();
        if (name && !seen.has(key)) {
            seen.add(key);
            variables.push(name);
        }
        return _m;
    });
    return variables;
}

/**
 * Susun `parameters` untuk Send Template WABA sesuai URUTAN variabel template.
 *
 * @param variables urutan nama variabel template (dari metaVariables, atau hasil
 *   extractTemplateVariables kalau metaVariables kosong).
 * @param values    nilai mentah per variabel yang diisi user di UI campaign. Key
 *   di-lowercase-kan saat lookup. Nilai boleh mengandung token personalisasi
 *   ({{nama_customer}}, {{storeName}}, {{date}}) yang di-resolve per penerima via `ctx`.
 * @param ctx       konteks per penerima buat resolusi token.
 *
 * Kalau sebuah variabel tidak punya nilai eksplisit di `values`, fallback ke token
 * personalisasi standar berdasarkan NAMA variabelnya (mis. variabel "nama_customer" →
 * otomatis pakai ctx.customerName), supaya template lama yang variabelnya jelas maknanya
 * tetap terisi tanpa user mengetik ulang.
 */
export function buildTemplateParameters(
    variables: string[],
    values: Record<string, string> | undefined,
    ctx: { customerName?: string; storeName?: string; date?: string; serviceName?: string }
): Array<{ type: 'text'; text: string }> {
    const resolveTokens = (raw: string): string =>
        String(raw ?? '')
            .replace(/\{\{\s*(nama_customer|customername|customer_name|nama)\s*\}\}/gi, ctx.customerName || 'Pelanggan')
            .replace(/\{\{\s*(storename|store_name|nama_toko|toko|salon)\s*\}\}/gi, ctx.storeName || 'Salon')
            .replace(/\{\{\s*(nama_service|nama_layanan|service_name|servicename|layanan|service)\s*\}\}/gi, ctx.serviceName || 'Layanan')
            .replace(/\{\{\s*(date|tanggal)\s*\}\}/gi, ctx.date || '');

    // Fallback per-nama variabel kalau user tidak mengisi nilai eksplisit.
    const nameFallback = (name: string): string => {
        const k = name.toLowerCase();
        if (['nama_customer', 'customername', 'customer_name', 'nama'].includes(k)) return ctx.customerName || 'Pelanggan';
        if (['storename', 'store_name', 'nama_toko', 'toko', 'salon'].includes(k)) return ctx.storeName || 'Salon';
        if (['nama_service', 'nama_layanan', 'service_name', 'servicename', 'layanan', 'service'].includes(k)) return ctx.serviceName || 'Layanan';
        if (['date', 'tanggal'].includes(k)) return ctx.date || '';
        return '';
    };

    return variables.map((name) => {
        const explicit = values?.[name.toLowerCase()];
        const raw = explicit !== undefined && explicit !== '' ? explicit : nameFallback(name);
        return { type: 'text' as const, text: resolveTokens(raw) };
    });
}

/**
 * Resolusi ID NUMERIK Meta dari sebuah template APPROVED berdasarkan NAMA-nya.
 *
 * /send_message_template minta field `template` = ID NUMERIK Meta (mis. "1027996053304714"),
 * BUKAN nama template. Terbukti empiris: kirim nama → "Template not found"; kirim ID numerik
 * → "queued" + pesan terkirim. ID numerik ini ada di /get-template-list sebagai field
 * `templateId` (stabil) dan cuma terisi untuk template ber-status APPROVED. (Ada juga field
 * `template_id` base64 tapi itu token yang BERUBAH tiap request — jangan dipakai.)
 *
 * Balikin null kalau creds kosong, template tidak ketemu, atau belum APPROVED.
 */
export async function getBalesOtomatisTemplateId(
    secretKey: string,
    licensesKey: string,
    templateName: string
): Promise<string | null> {
    if (!secretKey || !licensesKey || !templateName) return null;
    try {
        // NOTE: param `search` server-side semantiknya tidak jelas (mengembalikan 0 saat
        // dikasih nama persis), jadi ambil list penuh (search kosong) lalu FILTER exact
        // di sisi klien. Jumlah template per-tenant kecil, jadi ini aman & andal.
        const data = await postJson('/get-template-list', {
            secret_key: secretKey,
            licenses_key: licensesKey,
            search: '',
            order_by: 'template_created_at',
            order_dir: 'desc',
            start: 0,
            length: 100,
        });
        const list = Array.isArray(data?.data) ? data.data : [];
        const match = list.find(
            (t: any) =>
                t?.template_name === templateName &&
                String(t?.template_status).toUpperCase() === 'APPROVED' &&
                t?.templateId
        );
        return match?.templateId ? String(match.templateId) : null;
    } catch {
        return null;
    }
}

export async function sendTemplateViaBalesOtomatis(
    cfg: BalesOtomatisWabaConfig,
    phone: string,
    templateId: string,
    languageCode: string = 'id',
    parameters: Array<{ type: 'text'; text: string }> = []
): Promise<ProviderSendResult> {
    const { countryCode, localNumber } = splitIndonesianPhone(phone);
    try {
        if (!cfg.secretKey || !cfg.licensesKey) {
            return { success: false, error: 'BalesOtomatis WABA belum dikonfigurasi.' };
        }
        if (!templateId) {
            return { success: false, error: 'Template WABA belum ter-resolve ke ID Meta.' };
        }
        // Payload WAJIB ikut kontrak SDK resmi BalesOtomatis:
        //   template   -> ID NUMERIK Meta template yang APPROVED (mis. "1027996053304714").
        //                 BUKAN nama — kirim nama ditolak "Template not found". ID di-resolve
        //                 dari /get-template-list (field `templateId`) lewat getBalesOtomatisTemplateId.
        //   variables  -> array STRING berurutan sesuai {{1}},{{2}},...
        //   recipients -> SATU string nomor (bukan array)
        //   platform   -> WAJIB "whatsapp_bisnis_api"
        // Sebelumnya kekirim `template_name`/`parameters`/`recipients:[]` tanpa `platform`
        // → ditolak API → blast gagal senyap (antrean campaign kosong terus).
        const data = await postJson('/send_message_template', {
            secret_key: cfg.secretKey,
            licenses_key: cfg.licensesKey,
            recipients: `${countryCode}${localNumber}`,
            platform: 'whatsapp_bisnis_api',
            method_send: 'async',
            template: templateId,
            variables: parameters.map((p) => p.text),
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
