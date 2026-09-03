import { getTenantModels } from "@/lib/tenantDb";

import { NextRequest, NextResponse } from "next/server";
import { checkPermission } from "@/lib/rbac";

 // Ensure it's registered


const normalizeServicePayload = (payload: any) => {
    const body = { ...payload };

    const toLegacyDays = (value: number, unit: string) => {
        if (!Number.isFinite(value) || value <= 0) return 0;
        if (unit === 'minute') return value / 1440;
        if (unit === 'hour') return value / 24;
        return value;
    };

    if (body?.waFollowUp) {
        const firstDelayUnit = body.waFollowUp.firstDelayUnit || 'day';
        const secondDelayUnit = body.waFollowUp.secondDelayUnit || 'day';
        const firstDelayValue = Number(body.waFollowUp.firstDelayValue ?? body.waFollowUp.firstDays ?? 0);
        const secondDelayValue = Number(body.waFollowUp.secondDelayValue ?? body.waFollowUp.secondDays ?? 0);

        body.waFollowUp = {
            ...body.waFollowUp,
            firstDays: toLegacyDays(firstDelayValue, firstDelayUnit),
            secondDays: toLegacyDays(secondDelayValue, secondDelayUnit),
            firstDelayValue,
            firstDelayUnit,
            secondDelayValue,
            secondDelayUnit,
            firstTemplateId: body.waFollowUp.firstTemplateId || undefined,
            secondTemplateId: body.waFollowUp.secondTemplateId || undefined,
        };
    }

    // Sanitize parentService: convert empty string to null.
    // Only when the field is actually sent — jangan overwrite parent di update parsial.
    if ('parentService' in body && (body.parentService === '' || body.parentService === undefined)) {
        body.parentService = null;
    }

    return body;
};

export async function GET(request: NextRequest, props: any) {
    const tenantSlug = request.headers.get('x-store-slug') || 'pusat';
    const { Service, ServiceCategory } = await getTenantModels(tenantSlug);

    try {
    const permissionErrorGET = await checkPermission(request, 'services', 'view');
    if (permissionErrorGET) return permissionErrorGET;
        
        

        const { searchParams } = new URL(request.url);
        const page = parseInt(searchParams.get("page") || "1");
        const limitParam = parseInt(searchParams.get("limit") || "10");
        const limit = limitParam === 0 ? 0 : limitParam;
        const skip = limit > 0 ? (page - 1) * limit : 0;
        const categoryId = searchParams.get("category");
        const search = searchParams.get("search");

        const query: any = { status: "active" };
        if (categoryId) query.category = categoryId;
        if (search) {
            query.name = { $regex: search, $options: "i" };
        }

        const total = await Service.countDocuments(query);
        let serviceQuery = Service.find(query).populate("category", "name").sort({ name: 1 });
        if (limit > 0) {
            serviceQuery = serviceQuery.skip(skip).limit(limit);
        }
        const services = await serviceQuery;

        return NextResponse.json({
            success: true,
            data: services,
            pagination: {
                total,
                page,
                limit,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ success: false, error: "Failed to fetch services" }, { status: 500 });
    }
}

export async function POST(request: NextRequest, props: any) {
    const tenantSlug = request.headers.get('x-store-slug') || 'pusat';
    const { Service, ServiceCategory } = await getTenantModels(tenantSlug);

    try {
    const permissionErrorPOST = await checkPermission(request, 'services', 'create');
    if (permissionErrorPOST) return permissionErrorPOST;
        
        const rawBody = await request.json();
        const body = normalizeServicePayload(rawBody);
        const { applySkillNameFromCategory } = await import('@/lib/serviceSkillFromCategory');
        await applySkillNameFromCategory(ServiceCategory, body);
        const { isWorkIntegrationEnabled, syncCatalogServiceToWork } = await import('@/lib/workIntegration');
        if (!String(body.skillName || '').trim() && isWorkIntegrationEnabled()) {
            return NextResponse.json({ success: false, error: "Kategori skill wajib dipilih untuk link ke Work." }, { status: 400 });
        }
        const service = await new Service(body).save();
        try {
            if (isWorkIntegrationEnabled()) {
                await syncCatalogServiceToWork(tenantSlug, service);
            }
        } catch (syncErr: any) {
            await Service.findByIdAndDelete(service._id);
            return NextResponse.json({ success: false, error: syncErr?.message || 'Gagal membuat layanan di Work.' }, { status: 502 });
        }
        return NextResponse.json({ success: true, data: await Service.findById(service._id) });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ success: false, error: "Failed to create service" }, { status: 500 });
    }
}
