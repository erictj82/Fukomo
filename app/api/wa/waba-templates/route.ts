import { getTenantModels } from "@/lib/tenantDb";
import { NextRequest, NextResponse } from 'next/server';
import { checkPermissionWithSession } from '@/lib/rbac';
import { getWaProviderConfigFromSettings, testBalesOtomatisWaba } from '@/lib/waProvider';

export async function GET(request: NextRequest, props: any) {
    const tenantSlug = request.headers.get('x-store-slug') || 'pusat';
    const { Settings } = await getTenantModels(tenantSlug);

    try {
        const { error: permErr } = await checkPermissionWithSession(request, 'waTemplates', 'view');
        if (permErr) {
            const { error: settingsErr } = await checkPermissionWithSession(request, 'settings', 'view');
            if (settingsErr) return settingsErr;
        }

        const settings = await Settings.findOne({}).lean();
        const waConfig = getWaProviderConfigFromSettings(settings);

        if (waConfig.provider !== 'balesotomatis' || waConfig.balesotomatis?.mode !== 'waba') {
            return NextResponse.json({
                success: false,
                error: 'WhatsApp Business API (WABA) belum aktif di Pengaturan -> WhatsApp Provider.',
                isWaba: false,
            });
        }

        const { secretKey, licensesKey } = waConfig.balesotomatis;
        const result = await testBalesOtomatisWaba(secretKey, licensesKey);

        if (!result.success) {
            return NextResponse.json({
                success: false,
                error: result.error || 'Gagal mengambil daftar template WABA dari Meta.',
                isWaba: true,
            });
        }

        return NextResponse.json({
            success: true,
            isWaba: true,
            templates: result.templates || [],
            templateCount: result.templateCount || 0,
        });
    } catch (error: any) {
        return NextResponse.json(
            { success: false, error: error?.message || 'Failed to fetch WABA templates' },
            { status: 500 }
        );
    }
}
