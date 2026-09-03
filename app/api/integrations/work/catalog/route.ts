/**
 * GET /api/integrations/work/catalog
 * Catalog rows for Work's layanan Excel template (same columns as Unduh untuk Work).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireWorkIntegrationAuth } from '@/lib/workIntegration';
import { getTenantModels } from '@/lib/tenantDb';
import { serviceDocToExportRow } from '@/lib/workServiceExport';

export async function GET(request: NextRequest) {
    const denied = requireWorkIntegrationAuth(request);
    if (denied) return denied;

    const tenantSlug = (request.headers.get('x-store-slug') || 'pusat').trim().toLowerCase();
    try {
        const { Service } = await getTenantModels(tenantSlug);
        const docs = await Service.find({})
            .populate('category', 'name')
            .sort({ name: 1 })
            .lean();
        return NextResponse.json({
            slug: tenantSlug,
            rows: docs.map(serviceDocToExportRow),
        });
    } catch (e: any) {
        return NextResponse.json(
            { error: { code: 'internal', message: e?.message || 'Gagal mengambil katalog layanan' } },
            { status: 500 },
        );
    }
}
