import { NextRequest, NextResponse } from 'next/server';
import { checkPermissionWithSession } from '@/lib/rbac';
import { logActivity } from '@/lib/logger';
import {
    readBackupDecompressed,
    parseBackupJson,
    decodeUploadedBackup,
    previewRestore,
    restoreBackup,
    type BackupObject,
} from '@/lib/backup';

// Batas ukuran body upload (mentah/gzip) — jaga-jaga file raksasa. 200 MB cukup lega
// untuk data salon; di atas itu tolak agar tidak meledakkan memori.
const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;

/** Restore HANYA untuk Owner / Super Admin — bukan sekadar punya settings.edit. */
function isOwnerOrSuperAdmin(session: any): boolean {
    const role = session?.user?.role;
    const name = typeof role === 'string' ? role : role?.name;
    const r = String(name || '').toLowerCase();
    return r === 'super admin' || r === 'owner';
}

export async function POST(request: NextRequest) {
    try {
        // Gate 1: permission settings.edit (bawa session sekalian).
        const { error, session } = await checkPermissionWithSession(request, 'settings', 'edit');
        if (error) return error;

        // Gate 2: restore itu nuklir — wajib Owner/Super Admin, tidak cukup settings.edit.
        if (!isOwnerOrSuperAdmin(session)) {
            return NextResponse.json(
                { success: false, error: 'Hanya Owner / Super Admin yang boleh melakukan restore.' },
                { status: 403 }
            );
        }

        const tenantSlug = request.headers.get('x-store-slug') || 'pusat';
        const url = new URL(request.url);
        const source = url.searchParams.get('source') === 'upload' ? 'upload' : 'disk';
        const mode = url.searchParams.get('mode') === 'merge' ? 'merge' : 'replace';
        const isCommit = url.searchParams.get('commit') === '1';
        const file = url.searchParams.get('file') || '';
        const confirm = url.searchParams.get('confirm') || '';

        // --- Ambil objek backup dari sumbernya ---
        let backup: BackupObject;
        if (source === 'disk') {
            const buf = await readBackupDecompressed(tenantSlug, file);
            if (!buf) {
                return NextResponse.json(
                    { success: false, error: 'File backup tidak ditemukan / nama tidak valid.' },
                    { status: 404 }
                );
            }
            backup = parseBackupJson(buf);
        } else {
            const ab = await request.arrayBuffer();
            if (ab.byteLength === 0) {
                return NextResponse.json({ success: false, error: 'File upload kosong.' }, { status: 400 });
            }
            if (ab.byteLength > MAX_UPLOAD_BYTES) {
                return NextResponse.json({ success: false, error: 'File terlalu besar (maks 200 MB).' }, { status: 413 });
            }
            backup = await decodeUploadedBackup(Buffer.from(ab));
        }

        // --- PREVIEW (default): tidak menulis apa pun ---
        if (!isCommit) {
            const preview = await previewRestore(tenantSlug, backup);
            return NextResponse.json({ success: true, mode: 'preview', data: preview });
        }

        // --- COMMIT: butuh konfirmasi slug persis (anti salah-tenant / salah-pencet) ---
        if (confirm !== tenantSlug) {
            return NextResponse.json(
                { success: false, error: 'Konfirmasi gagal: ketik ulang slug tenant dengan tepat untuk melanjutkan.' },
                { status: 400 }
            );
        }

        const result = await restoreBackup(tenantSlug, backup, { mode, safety: true });

        // Safety-backup gagal keras → restore dibatalkan (tidak ada yang ditimpa).
        if (!result.safetyBackup || result.safetyBackup.status === 'lowdisk' || result.safetyBackup.status === 'error') {
            return NextResponse.json(
                {
                    success: false,
                    error:
                        result.safetyBackup?.status === 'lowdisk'
                            ? 'Restore dibatalkan: ruang disk menipis, safety-backup tidak bisa dibuat.'
                            : 'Restore dibatalkan: gagal membuat safety-backup (titik rollback).',
                    data: result,
                },
                { status: 507 }
            );
        }

        await logActivity({
            req: request,
            action: 'import',
            resource: 'Database',
            details: `Restore database (mode=${mode}, source=${source}${file ? `, file=${file}` : ''}) — safety=${result.safetyBackup.status === 'written' ? result.safetyBackup.filename : result.safetyBackup.status}`,
        });

        return NextResponse.json({ success: result.ok, mode: 'commit', data: result });
    } catch (err: any) {
        console.error('Restore error:', err);
        return NextResponse.json({ success: false, error: err?.message || 'Restore gagal.' }, { status: 500 });
    }
}
