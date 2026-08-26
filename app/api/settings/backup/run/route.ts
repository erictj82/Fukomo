import { NextRequest, NextResponse } from 'next/server';
import { checkPermission } from '@/lib/rbac';
import { logActivity } from '@/lib/logger';
import { getTenantModels } from '@/lib/tenantDb';
import { runManualBackup } from '@/lib/backup';

// POST /api/settings/backup/run
// Bikin 1 snapshot full-DB ke disk SEKARANG (tombol "Backup Sekarang"), lalu masuk daftar backup.
export async function POST(request: NextRequest) {
    try {
        const permissionError = await checkPermission(request, 'settings', 'edit');
        if (permissionError) return permissionError;

        const tenantSlug = request.headers.get('x-store-slug') || 'pusat';
        const { Settings } = await getTenantModels(tenantSlug);
        const settings: any = await Settings.findOne().lean();
        const keep = Number.isInteger(settings?.backupSchedule?.retentionCount)
            ? settings.backupSchedule.retentionCount
            : undefined;

        const res = await runManualBackup(tenantSlug, keep);

        if (res.status === 'written' || res.status === 'exists') {
            await logActivity({ req: request, action: 'export', resource: 'Database', details: `Backup ke disk: ${res.filename}` });
        }

        return NextResponse.json({ success: true, data: res });
    } catch (error: any) {
        console.error('Backup run error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
