import fs from 'fs/promises';
import path from 'path';
import zlib from 'zlib';
import { promisify } from 'util';
import { getMasterModels } from './masterDb';
import { getTenantModels } from './tenantDb';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

// Backup disimpan DI LUAR app-tree (deploy cuma swap .next, tree tetap; tapi biar 100% aman dari
// build/git kita taruh di parent). Override lewat env BACKUP_DIR kalau perlu. Default: sibling
// "backups" dari cwd app (mis. /var/www/next-salon/current → /var/www/next-salon/backups).
const BACKUP_ROOT = process.env.BACKUP_DIR || path.join(process.cwd(), '..', 'backups');

// Jangan bikin disk penuh: skip backup kalau free space di bawah ambang ini.
const MIN_FREE_BYTES = 1024 * 1024 * 1024; // 1 GiB
const DEFAULT_RETENTION = 14;

const SLUG_RE = /^[a-z0-9_-]+$/i;
const FILE_RE = /^backup-[a-z0-9_-]+-(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2})\.json\.gz$/i;

function safeSlug(slug: string): string {
    const s = String(slug || '').trim();
    if (!SLUG_RE.test(s)) throw new Error(`Invalid tenant slug for backup: "${slug}"`);
    return s;
}

export function getTenantBackupDir(slug: string): string {
    return path.join(BACKUP_ROOT, safeSlug(slug));
}

async function ensureDir(dir: string): Promise<void> {
    await fs.mkdir(dir, { recursive: true });
}

/**
 * Kumpulkan SELURUH data tenant (semua ~43 model → find({})) jadi satu objek biasa.
 * Dipakai bareng oleh endpoint download manual (JSON attachment) dan backup terjadwal (gzip).
 */
export async function generateBackupObject(slug: string): Promise<Record<string, unknown>> {
    const models = await getTenantModels(slug);
    const backupData: Record<string, unknown> = {};
    for (const [name, model] of Object.entries(models)) {
        if (model && typeof (model as any).find === 'function') {
            backupData[name] = await (model as any).find({}).lean();
        }
    }
    return backupData;
}

/**
 * Free bytes di filesystem yang menampung folder backup. Kalau statfs gagal (platform lawas),
 * balikin Infinity supaya backup TIDAK terblokir cuma karena kita gagal ngecek disk.
 */
async function freeBytes(dir: string): Promise<number> {
    try {
        const st: any = await (fs as any).statfs(dir);
        return Number(st.bavail) * Number(st.bsize);
    } catch {
        return Infinity;
    }
}

/**
 * WIB "sekarang" dalam potongan yang kita butuhkan buat penjadwalan & penamaan file.
 * dow: 0=Minggu .. 6=Sabtu (WIB). minutes: menit-sejak-tengah-malam WIB.
 */
function wibParts(now: Date): { date: string; dow: number; minutes: number } {
    const tz = 'Asia/Jakarta';
    const y = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric' }).format(now);
    const m = new Intl.DateTimeFormat('en-US', { timeZone: tz, month: '2-digit' }).format(now);
    const d = new Intl.DateTimeFormat('en-US', { timeZone: tz, day: '2-digit' }).format(now);
    const hh = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', hour12: false }).format(now));
    const mm = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: tz, minute: '2-digit' }).format(now));
    const wdShort = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(now);
    const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    // hour '2-digit' bisa balikin "24" di beberapa lingkungan buat tengah malam — normalkan ke 0.
    const hour = hh % 24;
    return { date: `${y}-${m}-${d}`, dow: dowMap[wdShort] ?? 1, minutes: hour * 60 + mm };
}

export interface BackupFileInfo {
    filename: string;
    date: string;      // YYYY-MM-DD (WIB, dari nama file)
    time: string;      // HH:MM (WIB, dari nama file)
    sizeBytes: number;
    createdAt: string; // ISO mtime
}

/**
 * Daftar backup di disk untuk 1 tenant, opsional difilter rentang tanggal (inclusive, YYYY-MM-DD).
 * Urut terbaru dulu.
 */
export async function listBackups(
    slug: string,
    range?: { from?: string; to?: string }
): Promise<BackupFileInfo[]> {
    const dir = getTenantBackupDir(slug);
    let entries: string[];
    try {
        entries = await fs.readdir(dir);
    } catch {
        return []; // belum ada folder = belum ada backup
    }
    const from = range?.from?.trim() || '';
    const to = range?.to?.trim() || '';
    const out: BackupFileInfo[] = [];
    for (const filename of entries) {
        const match = FILE_RE.exec(filename);
        if (!match) continue;
        const date = match[1];
        const time = match[2].replace('-', ':');
        if (from && date < from) continue;
        if (to && date > to) continue;
        try {
            const st = await fs.stat(path.join(dir, filename));
            out.push({ filename, date, time, sizeBytes: st.size, createdAt: st.mtime.toISOString() });
        } catch {
            // file lenyap saat di-scan (race dgn rotasi) — lewati
        }
    }
    out.sort((a, b) => (a.filename < b.filename ? 1 : -1)); // terbaru dulu (nama lexicographic)
    return out;
}

/**
 * Resolusi aman path 1 file backup: nama WAJIB cocok pola & tak boleh keluar dari folder tenant
 * (anti path-traversal). Balikin null kalau tak valid / tak ada.
 */
export async function resolveBackupPath(slug: string, filename: string): Promise<string | null> {
    if (!FILE_RE.test(String(filename || ''))) return null;
    const dir = getTenantBackupDir(slug);
    const full = path.resolve(dir, filename);
    if (path.dirname(full) !== path.resolve(dir)) return null; // traversal guard
    try {
        await fs.access(full);
        return full;
    } catch {
        return null;
    }
}

/** Baca 1 backup dari disk & kembalikan JSON mentah (sudah di-gunzip) untuk di-download. */
export async function readBackupDecompressed(slug: string, filename: string): Promise<Buffer | null> {
    const full = await resolveBackupPath(slug, filename);
    if (!full) return null;
    const gz = await fs.readFile(full);
    return await gunzip(gz);
}

/** Hapus backup terlama sampai tersisa `keep` file untuk tenant ini. */
async function rotate(slug: string, keep: number): Promise<string[]> {
    const dir = getTenantBackupDir(slug);
    let entries: string[];
    try {
        entries = await fs.readdir(dir);
    } catch {
        return [];
    }
    const files = entries.filter((f) => FILE_RE.test(f)).sort(); // lexicographic = kronologis (terlama dulu)
    const excess = Math.max(0, files.length - Math.max(1, keep));
    const removed: string[] = [];
    for (let i = 0; i < excess; i++) {
        try {
            await fs.unlink(path.join(dir, files[i]));
            removed.push(files[i]);
        } catch {
            // ignore
        }
    }
    return removed;
}

export type WriteResult =
    | { status: 'written'; filename: string; bytes: number; rotated: string[] }
    | { status: 'exists'; filename: string }
    | { status: 'lowdisk'; freeBytes: number }
    | { status: 'error'; error: string };

/**
 * Tulis 1 backup ber-gzip ke disk untuk tenant+slot tertentu (idempoten: kalau file slot itu
 * sudah ada, tidak menulis ulang). Atomic via tulis .tmp lalu rename. Rotasi otomatis setelahnya.
 * @param slotDate  "YYYY-MM-DD" (WIB)
 * @param slotLabel "HH-MM" (WIB)
 */
export async function writeBackupToDisk(
    slug: string,
    slotDate: string,
    slotLabel: string,
    keep: number = DEFAULT_RETENTION
): Promise<WriteResult> {
    const s = safeSlug(slug);
    const dir = getTenantBackupDir(s);
    const filename = `backup-${s}-${slotDate}_${slotLabel}.json.gz`;
    const target = path.join(dir, filename);

    await ensureDir(dir);

    // Idempoten: slot ini sudah dibackup → jangan dobel.
    try {
        await fs.access(target);
        return { status: 'exists', filename };
    } catch {
        // belum ada, lanjut
    }

    const free = await freeBytes(dir);
    if (free < MIN_FREE_BYTES) {
        console.warn(`[BACKUP:${s}] Skip — disk menipis (${Math.round(free / 1024 / 1024)}MB free < 1GB).`);
        return { status: 'lowdisk', freeBytes: free };
    }

    try {
        const obj = await generateBackupObject(s);
        const gz = await gzip(Buffer.from(JSON.stringify(obj)));
        const tmp = `${target}.tmp-${process.pid}`;
        await fs.writeFile(tmp, gz);
        await fs.rename(tmp, target); // atomic pada fs yang sama
        const rotated = await rotate(s, keep);
        console.log(`[BACKUP:${s}] ✅ ${filename} (${Math.round(gz.length / 1024)}KB)${rotated.length ? ` — rotasi hapus ${rotated.length}` : ''}`);
        return { status: 'written', filename, bytes: gz.length, rotated };
    } catch (e: any) {
        console.error(`[BACKUP:${s}] Gagal menulis ${filename}:`, e?.message || e);
        return { status: 'error', error: e?.message || 'unknown' };
    }
}

/** Snapshot manual "sekarang" ke disk (dipanggil tombol Backup Sekarang). Slot = jam WIB saat ini. */
export async function runManualBackup(slug: string, keep?: number): Promise<WriteResult> {
    const { date, minutes } = wibParts(new Date());
    const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
    const mm = String(minutes % 60).padStart(2, '0');
    return writeBackupToDisk(slug, date, `${hh}-${mm}`, keep);
}

async function getAllTenantSlugs(): Promise<string[]> {
    try {
        const master = await getMasterModels();
        const stores = await master.Store.find({ isActive: true }).select('slug').lean();
        const slugs = stores.map((s: any) => s.slug).filter(Boolean);
        return slugs.length > 0 ? slugs : ['pusat'];
    } catch (e) {
        console.error('[BACKUP] Gagal ambil daftar tenant:', e);
        return ['pusat'];
    }
}

/**
 * Dipanggil tiap tick scheduler. Untuk tiap tenant yang mengaktifkan backupSchedule, cek apakah
 * ada slot jam (WIB) yang sudah lewat hari ini dan belum ke-backup → tulis. Idempoten per slot
 * (dedup via nama file), jadi aman dipanggil tiap 5 menit.
 */
export async function runDueBackups(now: Date = new Date()): Promise<{ written: string[] }> {
    const { date, dow, minutes } = wibParts(now);
    const written: string[] = [];
    const slugs = await getAllTenantSlugs();

    for (const slug of slugs) {
        try {
            const { Settings } = await getTenantModels(slug);
            const settings: any = await Settings.findOne().lean();
            const sched = settings?.backupSchedule;
            if (!sched?.enabled) continue;

            const times: string[] = Array.isArray(sched.times) ? sched.times : [];
            if (times.length === 0) continue;

            if (sched.frequency === 'weekly') {
                const targetDow = Number.isInteger(sched.dayOfWeek) ? sched.dayOfWeek : 1;
                if (dow !== targetDow) continue; // bukan harinya
            }

            const keep = Number.isInteger(sched.retentionCount) ? sched.retentionCount : DEFAULT_RETENTION;

            for (const t of times) {
                const m = /^(\d{1,2}):(\d{2})$/.exec(String(t).trim());
                if (!m) continue;
                const slotMinutes = parseInt(m[1]) * 60 + parseInt(m[2]);
                if (minutes < slotMinutes) continue; // slot belum tiba hari ini
                const label = `${m[1].padStart(2, '0')}-${m[2]}`;
                const res = await writeBackupToDisk(slug, date, label, keep);
                if (res.status === 'written') written.push(res.filename);
            }
        } catch (e) {
            console.error(`[BACKUP] runDueBackups error tenant "${slug}":`, e);
        }
    }

    return { written };
}

// ============================================================================
// RESTORE / IMPORT
// ----------------------------------------------------------------------------
// Operasi PALING berbahaya di app: menimpa data live tenant dari file backup.
// Semua pengaman ada di layer route (konfirmasi slug + gate role Owner/SuperAdmin
// + safety-backup wajib). Di sini kita fokus: parsing aman, casting yang benar
// (string→ObjectId/Date lewat schema — JANGAN paksa ObjectId karena ada model
// ber-_id String seperti Counter), dan bypass validator (data snapshot dianggap
// sudah valid saat dibuat; validator bisa berubah/drift kemudian).
// ============================================================================

export type BackupObject = Record<string, unknown[]>;

/**
 * Validasi & parse teks/Buffer JSON backup jadi objek {ModelName: [docs...]}.
 * Lempar error yang ramah kalau bukan JSON / struktur salah.
 */
export function parseBackupJson(raw: string | Buffer): BackupObject {
    const text = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw ?? '');
    let obj: unknown;
    try {
        obj = JSON.parse(text);
    } catch {
        throw new Error('File backup bukan JSON yang valid.');
    }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
        throw new Error('Struktur backup tidak dikenali (harus objek { NamaModel: [ ... ] }).');
    }
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        if (!Array.isArray(v)) {
            throw new Error(`Field "${k}" bukan array dokumen — file backup tidak valid.`);
        }
    }
    return obj as BackupObject;
}

/**
 * Decode file backup yang di-UPLOAD (bisa .json mentah atau .json.gz).
 * Deteksi gzip via magic bytes (0x1f 0x8b) lalu gunzip; selain itu treat as JSON.
 */
export async function decodeUploadedBackup(buf: Buffer): Promise<BackupObject> {
    let data = buf;
    if (buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
        data = await gunzip(buf);
    }
    return parseBackupJson(data);
}

export interface RestorePlanItem {
    model: string;   // nama model (key di backup)
    incoming: number; // jumlah dokumen di file backup
    current: number;  // jumlah dokumen di DB tenant saat ini
}

export interface RestorePreview {
    slug: string;
    items: RestorePlanItem[];
    unknownKeys: string[]; // key di file yang tidak cocok model manapun (akan dilewati)
    totalIncoming: number;
    totalCurrent: number;
}

/**
 * Rangkuman "apa yang akan terjadi" TANPA menulis apa pun — untuk layar konfirmasi.
 * Hanya menghitung; tidak menghapus/menyisipkan.
 */
export async function previewRestore(slug: string, backup: BackupObject): Promise<RestorePreview> {
    const s = safeSlug(slug);
    const models = (await getTenantModels(s)) as unknown as Record<string, any>;
    const items: RestorePlanItem[] = [];
    const unknownKeys: string[] = [];
    let totalIncoming = 0;
    let totalCurrent = 0;

    for (const [key, arr] of Object.entries(backup)) {
        const incoming = Array.isArray(arr) ? arr.length : 0;
        const model = models[key];
        if (model && typeof model.countDocuments === 'function') {
            const current = await model.countDocuments({});
            items.push({ model: key, incoming, current });
            totalIncoming += incoming;
            totalCurrent += current;
        } else {
            unknownKeys.push(key);
        }
    }
    items.sort((a, b) => b.incoming - a.incoming);
    return { slug: s, items, unknownKeys, totalIncoming, totalCurrent };
}

export interface RestoreModelResult {
    model: string;
    deleted: number;
    inserted: number;
    failedCast: number; // dokumen yang gagal di-cast (dilewati)
    error?: string;
}

export interface RestoreResult {
    slug: string;
    mode: 'replace' | 'merge';
    safetyBackup: WriteResult | null; // backup keadaan SEBELUM restore (titik rollback)
    perModel: RestoreModelResult[];
    unknownKeys: string[];
    ok: boolean;
}

/**
 * Insert dokumen yang sudah di-cast langsung ke native collection (BYPASS validator),
 * dengan penanganan sukses-parsial saat ordered:false.
 */
async function insertCasted(model: any, casted: any[], mode: 'replace' | 'merge'): Promise<number> {
    if (!casted.length) return 0;
    if (mode === 'merge') {
        const ops = casted.map((doc) => ({
            replaceOne: { filter: { _id: doc._id }, replacement: doc, upsert: true },
        }));
        try {
            const r = await model.collection.bulkWrite(ops, { ordered: false });
            return (r?.upsertedCount || 0) + (r?.modifiedCount || 0) + (r?.insertedCount || 0);
        } catch (e: any) {
            const r = e?.result || {};
            return (r.upsertedCount || 0) + (r.modifiedCount || 0);
        }
    }
    try {
        const r = await model.collection.insertMany(casted, { ordered: false });
        return r?.insertedCount ?? casted.length;
    } catch (e: any) {
        // ordered:false → sisa dokumen tetap masuk; ambil hitungan sebisanya.
        return e?.result?.insertedCount ?? e?.insertedCount ?? 0;
    }
}

/**
 * RESTORE data tenant dari objek backup.
 * - mode 'replace' (default): kosongkan tiap collection lalu isi ulang (true snapshot restore).
 * - mode 'merge': upsert per _id (tidak menghapus apa pun).
 * Casting dilakukan lewat schema (`new Model(doc)`) agar string→ObjectId/Date benar &
 * _id String (mis. Counter) tetap utuh; insert lewat native collection agar validator DILEWATI.
 * Kalau `safety` !== false, backup keadaan SEKARANG dibuat dulu sebagai titik rollback; jika
 * safety-backup gagal keras (lowdisk/error), restore DIBATALKAN (tidak menimpa tanpa jaring).
 */
export async function restoreBackup(
    slug: string,
    backup: BackupObject,
    opts: { mode?: 'replace' | 'merge'; safety?: boolean; keep?: number } = {}
): Promise<RestoreResult> {
    const s = safeSlug(slug);
    const mode: 'replace' | 'merge' = opts.mode === 'merge' ? 'merge' : 'replace';
    const models = (await getTenantModels(s)) as unknown as Record<string, any>;

    // 1) Safety-backup keadaan SEKARANG (titik rollback) sebelum menyentuh data.
    let safetyBackup: WriteResult | null = null;
    if (opts.safety !== false) {
        safetyBackup = await runManualBackup(s, opts.keep);
        if (safetyBackup.status === 'lowdisk' || safetyBackup.status === 'error') {
            return { slug: s, mode, safetyBackup, perModel: [], unknownKeys: [], ok: false };
        }
    }

    // 2) Restore per-collection (hanya key yang cocok model teregister).
    const perModel: RestoreModelResult[] = [];
    const unknownKeys: string[] = [];

    for (const [key, arr] of Object.entries(backup)) {
        const model = models[key];
        if (!model || !model.collection || typeof model.collection.insertMany !== 'function') {
            unknownKeys.push(key);
            continue;
        }
        const docs = Array.isArray(arr) ? arr : [];
        let deleted = 0;
        let inserted = 0;
        let failedCast = 0;
        let error: string | undefined;

        try {
            if (mode === 'replace') {
                const del = await model.deleteMany({});
                deleted = del?.deletedCount || 0;
            }
            // Cast tiap dokumen lewat schema (bukan paksa ObjectId). Dokumen gagal-cast dilewati.
            const casted: any[] = [];
            for (const d of docs) {
                try {
                    casted.push(new model(d).toObject({ depopulate: true }));
                } catch {
                    failedCast++;
                }
            }
            inserted = await insertCasted(model, casted, mode);
        } catch (e: any) {
            error = e?.message || 'unknown';
        }

        perModel.push({ model: key, deleted, inserted, failedCast, error });
    }

    const ok = perModel.every((m) => !m.error);
    return { slug: s, mode, safetyBackup, perModel, unknownKeys, ok };
}
