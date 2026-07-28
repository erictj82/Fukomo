import { getTenantModels } from "@/lib/tenantDb";
import { NextRequest, NextResponse } from 'next/server';
import { checkPermission, checkPermissionWithSession } from '@/lib/rbac';
import { getWaProviderConfigFromSettings, createBalesOtomatisTemplate, testBalesOtomatisWaba } from '@/lib/waProvider';

export async function GET(request: NextRequest, props: any) {
    const tenantSlug = request.headers.get('x-store-slug') || 'pusat';
    const { WaTemplate, Settings } = await getTenantModels(tenantSlug);

    try {
        const { error: posPermErr } = await checkPermissionWithSession(request, 'pos', 'view');
        if (posPermErr) {
            const { error: waPermErr } = await checkPermissionWithSession(request, 'waTemplates', 'view');
            if (waPermErr) return waPermErr;
        }

        try {
            const settings = await Settings.findOne({}).lean();
            const waConfig = getWaProviderConfigFromSettings(settings);
            if (waConfig.provider === 'balesotomatis' && waConfig.balesotomatis?.mode === 'waba') {
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

        const templates = await WaTemplate.find(query).sort({ createdAt: -1 });

        return NextResponse.json({ success: true, data: templates });
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

        if (submitToMeta) {
            const settings = await Settings.findOne({}).lean();
            const waConfig = getWaProviderConfigFromSettings(settings);
            if (waConfig.provider === 'balesotomatis' && waConfig.balesotomatis?.mode === 'waba') {
                const { secretKey, licensesKey } = waConfig.balesotomatis;
                const result = await createBalesOtomatisTemplate(secretKey, licensesKey, name, message);
                if (result.success) {
                    metaStatus = 'PENDING';
                    metaTemplateName = name.toLowerCase().replace(/[^a-z0-9_]/g, '_');
                }
            }
        }

        const template = await WaTemplate.create({ 
            name, 
            message, 
            templateType, 
            isGreetingEnabled,
            metaStatus,
            metaTemplateName: metaTemplateName || undefined
        });

        return NextResponse.json({ success: true, data: template });
    } catch (error: any) {
        return NextResponse.json(
            { success: false, error: error?.message || 'Failed to create WA template' },
            { status: 500 }
        );
    }
}