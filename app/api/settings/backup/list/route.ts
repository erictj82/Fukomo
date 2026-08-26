import { NextRequest, NextResponse } from 'next/server';
import { checkPermission } from '@/lib/rbac';
import { listBackups } from '@/lib/backup';

// GET /api/settings/backup/list?from=YYYY-MM-DD&to=YYYY-MM-DD
// Daftar backup terjadwal yang tersimpan di disk untuk tenant ini, opsional filter rentang tanggal.
export async function GET(request: NextRequest) {
    try {
        const permissionError = await checkPermission(request, 'settings', 'view');
        if (permissionError) return permissionError;

        const tenantSlug = request.headers.get('x-store-slug') || 'pusat';
        const { searchParams } = new URL(request.url);
        const from = searchParams.get('from') || undefined;
        const to = searchParams.get('to') || undefined;

        const backups = await listBackups(tenantSlug, { from, to });
        return NextResponse.json({ success: true, data: { backups } });
    } catch (error: any) {
        console.error('Backup list error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
