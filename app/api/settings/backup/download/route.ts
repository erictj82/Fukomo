import { NextRequest, NextResponse } from 'next/server';
import { checkPermission } from '@/lib/rbac';
import { logActivity } from '@/lib/logger';
import { readBackupDecompressed } from '@/lib/backup';

// GET /api/settings/backup/download?file=backup-<slug>-YYYY-MM-DD_HH-MM.json.gz
// Download 1 backup terjadwal (di-gunzip di server → user terima file .json siap pakai).
export async function GET(request: NextRequest) {
    try {
        const permissionError = await checkPermission(request, 'settings', 'view');
        if (permissionError) return permissionError;

        const tenantSlug = request.headers.get('x-store-slug') || 'pusat';
        const { searchParams } = new URL(request.url);
        const file = searchParams.get('file') || '';

        const buf = await readBackupDecompressed(tenantSlug, file);
        if (!buf) {
            return NextResponse.json({ success: false, error: 'Backup tidak ditemukan / nama tidak valid' }, { status: 404 });
        }

        await logActivity({ req: request, action: 'export', resource: 'Database', details: `Download backup: ${file}` });

        const downloadName = file.replace(/\.gz$/i, '');
        return new NextResponse(buf as any, {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Content-Disposition': `attachment; filename=${downloadName}`,
                'Content-Length': String(buf.length),
            },
        });
    } catch (error: any) {
        console.error('Backup download error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
