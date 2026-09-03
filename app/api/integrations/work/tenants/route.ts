import { NextRequest, NextResponse } from 'next/server';
import { requireWorkIntegrationAuth } from '@/lib/workIntegration';
import { getMasterModels } from '@/lib/masterDb';

export async function GET(request: NextRequest) {
    const denied = requireWorkIntegrationAuth(request);
    if (denied) return denied;
    try {
        const master = await getMasterModels();
        const stores = await master.Store.find({ isActive: true }).select('slug name').lean();
        return NextResponse.json({
            tenants: (stores || []).map((s: any) => ({
                slug: s.slug,
                name: s.name || s.slug,
            })),
        });
    } catch (e: any) {
        return NextResponse.json(
            { error: { code: 'internal', message: e?.message || 'Gagal mengambil daftar cabang Fukomo' } },
            { status: 500 },
        );
    }
}
