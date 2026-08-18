/**
 * tenantHost — Resolusi tenant dari Host header (mode subdomain).
 *
 * DUAL-MODE + KILL-SWITCH:
 * Fungsi ini HANYA aktif kalau `baseDomain` di-set (dari env
 * TENANT_BASE_DOMAIN di server / NEXT_PUBLIC_TENANT_BASE_DOMAIN di client).
 * Kalau `baseDomain` kosong/undefined → SELALU return null → app jalan
 * persis mode lama (path-based: fukomo.com/pusat/...), nol perubahan.
 *
 * Kalau aktif, app jalan dua-duanya sekaligus:
 *   - Apex path lama : fukomo.com/pusat/dashboard   → resolve null (path-based)
 *   - Subdomain baru : pusat.fukomo.com/dashboard    → resolve "pusat"
 *
 * PURE function: tanpa akses DB, tanpa I/O, tanpa env read di dalam.
 * Semua input eksplisit lewat argumen → gampang di-unit-test & aman
 * dipakai di Edge runtime (proxy.ts) maupun di client bundle.
 */

/**
 * Subdomain yang TIDAK boleh dianggap sebagai slug tenant.
 * - www / apex: bukan tenant.
 * - adminsaas: panel admin SaaS (server PHP terpisah).
 * - api/admin/app/dll: reserved buat infra/route umum, jangan bentrok.
 */
const RESERVED_SUBDOMAINS = new Set<string>([
    'www',
    'adminsaas',
    'admin',
    'api',
    'app',
    'mail',
    'smtp',
    'imap',
    'ftp',
    'static',
    'assets',
    'cdn',
    'ns',
    'ns1',
    'ns2',
    'mx',
    'webmail',
    'panel',
    'dashboard',
    'status',
]);

/**
 * Ambil slug tenant dari host, ATAU null kalau bukan subdomain tenant.
 *
 * @param host        Nilai header Host (boleh termasuk port, boleh null).
 * @param baseDomain  Domain dasar, mis. "fukomo.com". Kalau falsy → mode
 *                    subdomain mati total (return null).
 * @returns slug tenant (lowercase) atau null.
 *
 * Aturan (fail-safe, default ke null):
 *   - host / baseDomain kosong                 → null
 *   - host === baseDomain (apex)               → null
 *   - host tidak berakhiran ".{baseDomain}"    → null (domain lain)
 *   - label > 1 tingkat (a.b.fukomo.com)       → null (bukan tenant simpel)
 *   - label reserved (www/adminsaas/...)       → null
 *   - label bukan slug valid                   → null
 *   - selain itu                               → label sbg slug
 */
export function resolveTenantFromHost(
    host: string | null | undefined,
    baseDomain: string | null | undefined,
): string | null {
    if (!host || !baseDomain) return null;

    // Buang port + normalisasi ke lowercase (host header bisa "PUSAT.Fukomo.com:3000").
    const h = host.split(':')[0].trim().toLowerCase();
    const base = baseDomain.split(':')[0].trim().toLowerCase().replace(/^\.+|\.+$/g, '');
    if (!h || !base) return null;

    // Apex persis (fukomo.com) → bukan tenant.
    if (h === base) return null;

    // Harus subdomain langsung dari base: "<label>.{base}".
    const suffix = `.${base}`;
    if (!h.endsWith(suffix)) return null;

    const label = h.slice(0, -suffix.length);

    // Kosong ("" .fukomo.com) atau multi-level (a.b.fukomo.com) → bukan tenant simpel.
    if (!label || label.includes('.')) return null;

    // Reserved (www, adminsaas, api, dst).
    if (RESERVED_SUBDOMAINS.has(label)) return null;

    // Slug sanity: mulai alfanumerik, isi alfanumerik/dash, gak boleh diakhiri dash.
    // (DNS label rules disederhanakan; cukup buat mencegah karakter aneh.)
    if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)) return null;

    return label;
}

/** Set reserved (dibuka buat test / referensi). */
export const RESERVED_TENANT_SUBDOMAINS = RESERVED_SUBDOMAINS;
