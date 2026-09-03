/**
 * GET /api/services/work-export
 * Excel of all tenant services for filling Work skills, then uploading in Work.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getTenantModels } from '@/lib/tenantDb';
import { checkPermission } from '@/lib/rbac';
import { serviceDocToExportRow, workServiceExportBuffer } from '@/lib/workServiceExport';

export async function GET(request: NextRequest) {
    const tenantSlug = request.headers.get('x-store-slug') || 'pusat';
    const permError = await checkPermission(request, 'services', 'view');
    if (permError) return permError;

    try {
        const { Service } = await getTenantModels(tenantSlug);
        const docs = await Service.find({})
            .populate('category', 'name')
            .sort({ name: 1 })
            .lean();
        const rows = docs.map(serviceDocToExportRow);
        const buf = workServiceExportBuffer(rows);
        const filename = `fukomo-layanan-work-${tenantSlug}-${new Date().toISOString().split('T')[0]}.xlsx`;
        return new NextResponse(new Uint8Array(buf), {
            status: 200,
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename="${filename}"`,
                'Cache-Control': 'no-cache',
            },
        });
    } catch (err: any) {
        console.error('work-export error:', err);
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}
