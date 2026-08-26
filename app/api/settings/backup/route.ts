import { NextRequest, NextResponse } from 'next/server';
import { checkPermission } from '@/lib/rbac';
import { logActivity } from '@/lib/logger';
import { generateBackupObject } from '@/lib/backup';

export async function GET(request: NextRequest, props: any) {
    try {
        // Security Check
        const permissionError = await checkPermission(request, 'settings', 'view');
        if (permissionError) return permissionError;

        const tenantSlug = request.headers.get('x-store-slug') || 'pusat';
        const backupData = await generateBackupObject(tenantSlug);

        // Log Activity
        await logActivity({
            req: request,
            action: 'export',
            resource: 'Database',
            details: 'Exported full database backup'
        });

        return new NextResponse(JSON.stringify(backupData, null, 2), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Content-Disposition': `attachment; filename=salon-backup-${new Date().toISOString().split('T')[0]}.json`,
            },
        });
    } catch (error: any) {
        console.error('Backup error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
