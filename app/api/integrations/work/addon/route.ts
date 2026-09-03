import { NextRequest, NextResponse } from 'next/server';
import { requireWorkIntegrationAuth, applyAddonWorking } from '@/lib/workIntegration';
import { getTenantModels } from '@/lib/tenantDb';

export async function POST(request: NextRequest) {
    const denied = requireWorkIntegrationAuth(request);
    if (denied) return denied;
    const tenantSlug = request.headers.get('x-store-slug') || 'pusat';
    try {
        await getTenantModels(tenantSlug);
        const payload = await request.json();
        const result = await applyAddonWorking(tenantSlug, payload);
        return NextResponse.json(result.body, { status: result.statusCode });
    } catch (e: any) {
        return NextResponse.json(
            { error: { code: 'internal', message: e?.message || 'Gagal memproses add-on' } },
            { status: 500 }
        );
    }
}
