import { getTenantModels } from "@/lib/tenantDb";
import { NextRequest, NextResponse } from 'next/server';
import { checkPermission, checkPermissionWithSession } from '@/lib/rbac';
import { getWaProviderConfigForPurpose, createBalesOtomatisTemplate, testBalesOtomatisWaba } from '@/lib/waProvider';

export async function GET(request: NextRequest, props: any) {
    const tenantSlug = request.headers.get('x-store-slug') || 'pusat';
    const { WaTemplate, Settings } = await getTenantModels(tenantSlug);

    try {
        const { error: posPermErr } = await checkPermissionWithSession(request, 'pos', 'view');
        if (posPermErr) {
            const { error: waPermErr } = await checkPermissionWithSession(request, 'waTemplates', 'view');
            if (waPermErr) return waPermErr;
        }

        let isWaba = false;
        try {
            const settings = await Settings.findOne({}).lean();
            const waConfig = getWaProviderConfigForPurpose(settings, 'campaign');
            if (waConfig.provider === 'balesotomatis' && waConfig.balesotomatis?.mode === 'waba') {
                isWaba = true;
                const { secretKey, licensesKey } = waConfig.balesotomatis;
                const result = await testBalesOtomatisWaba(secretKey, licensesKey);
                if (result.success && result.templates && Array.isArray(result.templates)) {
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
                                if (loc.metaStatus !== statusVal || loc.metaTemplateName !== metaName) {
                                    loc.metaStatus = statusVal;
                                    loc.metaTemplateName = metaName;
                                    await loc.save();
                                }
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
            }
        } catch (e) {
            // Ignore sync error so list fetch still succeeds
        }

        const { searchParams } = new URL(request.url);
        const search = String(searchParams.get('search') || '').trim();
        const type = String(searchParams.get('type') || '').trim();
        const templateType = type === 'greeting' || type === 'follow_up' ? type : '';

        const query: any = {};
        if (search) {
            query.name = { $regex: search, $options: 'i' };
        }

        if (templateType === 'follow_up') {
            query.$or = [
                { templateType: 'follow_up' },
                { templateType: { $exists: false } }, // legacy templates before templateType exists
            ];
        } else if (templateType === 'greeting') {
            query.$or = [
                { templateType: 'greeting' },
                { templateType: { $exists: false }, isGreetingEnabled: true }, // legacy greeting template
            ];
        }

        // Assignment dropdown (mis. follow-up per-service): kalau tenant WABA-mode, follow-up
        // HANYA terkirim dgn template APPROVED (lihat scheduler Fase 1). Sembunyikan yang belum
        // approved supaya user tidak salah pilih. Tenant Fonnte-only tetap free-text → tampil semua.
        const assignable = String(searchParams.get('assignable') || '') === '1';
        if (assignable && isWaba) {
            query.metaStatus = 'APPROVED';
        }

        const templates = await WaTemplate.find(query).sort({ createdAt: -1 });

        return NextResponse.json({ success: true, data: templates, waba: isWaba });
    } catch (error: any) {
        return NextResponse.json(
            { success: false, error: error?.message || 'Failed to fetch WA templates' },
            { status: 500 }
        );
    }
}

export async function POST(request: NextRequest, props: any) {
    const tenantSlug = request.headers.get('x-store-slug') || 'pusat';
    const { WaTemplate, Settings } = await getTenantModels(tenantSlug);

    try {
        const permissionError = await checkPermission(request, 'waTemplates', 'create');
        if (permissionError) return permissionError;



        const body = await request.json();
        const name = String(body?.name || '').trim();
        const message = String(body?.message || '').trim();
        const requestedType = String(body?.templateType || '').trim();
        const templateType = requestedType === 'greeting' || requestedType === 'follow_up'
            ? requestedType
            : (Boolean(body?.isGreetingEnabled) ? 'greeting' : 'follow_up');
        const isGreetingEnabled = Boolean(body?.isGreetingEnabled);
        const submitToMeta = Boolean(body?.submitToMeta);
        const requestedCategory = String(body?.metaCategory || '').trim().toUpperCase();
        const metaCategory = requestedCategory === 'MARKETING' || requestedCategory === 'UTILITY'
            ? requestedCategory
            : 'UTILITY';

        if (!name || !message) {
            return NextResponse.json(
                { success: false, error: 'name and message are required' },
                { status: 400 }
            );
        }

        if (isGreetingEnabled && templateType !== 'greeting') {
            return NextResponse.json(
                { success: false, error: 'Only greeting templates can be set as active greeting' },
                { status: 400 }
            );
        }

        if (isGreetingEnabled) {
            await WaTemplate.updateMany({}, { $set: { isGreetingEnabled: false } });
        }

        let metaStatus: 'LOCAL' | 'PENDING' | 'APPROVED' | 'REJECTED' = 'LOCAL';
        let metaTemplateName = '';
        let metaVariables: string[] | undefined;
        let metaWarning: string | undefined;

        if (submitToMeta) {
            const settings = await Settings.findOne({}).lean();
            const waConfig = getWaProviderConfigForPurpose(settings, 'campaign');
            if (waConfig.provider === 'balesotomatis' && waConfig.balesotomatis?.mode === 'waba') {
                const { secretKey, licensesKey } = waConfig.balesotomatis;
                const result = await createBalesOtomatisTemplate(secretKey, licensesKey, name, message, metaCategory);
                if (result.success) {
                    metaStatus = 'PENDING';
                    metaTemplateName = name.toLowerCase().replace(/[^a-z0-9_]/g, '_');
                    metaVariables = result.variables;
                } else {
                    // Jangan bohongin user — simpan lokal (LOCAL) tapi kasih tau kenapa gagal ke Meta.
                    metaWarning = result.error || 'Template gagal diajukan ke Meta, tersimpan sebagai lokal.';
                }
            } else {
                metaWarning = 'WhatsApp Business API (WABA) belum aktif di Pengaturan → WhatsApp Provider. Template tersimpan sebagai lokal.';
            }
        }

        const template = await WaTemplate.create({
            name,
            message,
            templateType,
            isGreetingEnabled,
            metaStatus,
            metaCategory,
            metaTemplateName: metaTemplateName || undefined,
            metaVariables,
        });

        return NextResponse.json({ success: true, data: template, warning: metaWarning });
    } catch (error: any) {
        return NextResponse.json(
            { success: false, error: error?.message || 'Failed to create WA template' },
            { status: 500 }
        );
    }
}