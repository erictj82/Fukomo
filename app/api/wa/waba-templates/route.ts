import { getTenantModels } from "@/lib/tenantDb";
import { NextRequest, NextResponse } from 'next/server';
import { checkPermissionWithSession } from '@/lib/rbac';
import { getWaProviderConfigFromSettings, testBalesOtomatisWaba } from '@/lib/waProvider';

export async function GET(request: NextRequest, props: any) {
    const tenantSlug = request.headers.get('x-store-slug') || 'pusat';
    const { Settings, WaTemplate } = await getTenantModels(tenantSlug);

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

        if (result.templates && Array.isArray(result.templates)) {
            const localTemplates = await WaTemplate.find({});
            for (const t of result.templates) {
                const metaName = String(t.name || t.template_name || '').trim().toLowerCase();
                if (!metaName) continue;
                const statusStr = String(t.status || t.template_status || 'PENDING').toUpperCase();
                let statusVal: 'PENDING' | 'APPROVED' | 'REJECTED' = 'PENDING';
                if (statusStr.includes('APPROV') || statusStr === 'ACTIVE') statusVal = 'APPROVED';
                else if (statusStr.includes('REJECT') || statusStr === 'DISABLED') statusVal = 'REJECTED';

                let matched = false;
                for (const loc of localTemplates) {
                    const cleanLoc = loc.name.toLowerCase().replace(/[^a-z0-9_]/g, '_');
                    if (cleanLoc === metaName || loc.name.toLowerCase() === metaName || loc.metaTemplateName === metaName) {
                        loc.metaStatus = statusVal;
                        loc.metaTemplateName = metaName;
                        await loc.save();
                        matched = true;
                    }
                }
                if (!matched) {
                    let bodyText = metaName;
                    if (Array.isArray(t.components)) {
                        const bodyComp = t.components.find((c: any) => c.type === 'BODY' || c.type === 'body');
                        if (bodyComp && bodyComp.text) bodyText = bodyComp.text;
                    } else if (typeof t.message === 'string' && t.message) {
                        bodyText = t.message;
                    }
                    await WaTemplate.create({
                        name: metaName,
                        message: bodyText,
                        templateType: 'follow_up',
                        isGreetingEnabled: false,
                        metaStatus: statusVal,
                        metaTemplateName: metaName,
                    });
                }
            }
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
