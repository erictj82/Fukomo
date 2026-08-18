import { getTenantModels } from "@/lib/tenantDb";
import { NextRequest, NextResponse } from 'next/server';

import { checkPermission } from '@/lib/rbac';


export async function PUT(request: NextRequest, props: any) {
    const tenantSlug = request.headers.get('x-store-slug') || 'pusat';
    const { WaAutomation } = await getTenantModels(tenantSlug);

    const permError = await checkPermission(request, 'settings', 'edit');
    if (permError) return permError;

    try {
        const { id } = await props.params;
        
        

        const body = await request.json();

        // BUG-08/SEC-04 FIX: Whitelist field yang boleh diupdate
        // Mencegah manipulasi field internal seperti lastRunDate, _id, createdAt
        const { name, category, targetRole, frequency, scheduleDays, scheduleTime, daysBefore, messageTemplate, isActive, waTemplateId } = body;
        const update: Record<string, any> = {};
        if (name !== undefined) update.name = name;
        if (category !== undefined) update.category = category;
        if (targetRole !== undefined) update.targetRole = targetRole;
        if (frequency !== undefined) update.frequency = frequency;
        if (scheduleDays !== undefined) update.scheduleDays = scheduleDays;
        if (scheduleTime !== undefined) {
            if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(scheduleTime)) {
                return NextResponse.json({ success: false, error: 'Invalid scheduleTime format. Must be HH:MM' }, { status: 400 });
            }
            update.scheduleTime = scheduleTime;
        }
        if (daysBefore !== undefined) update.daysBefore = daysBefore;
        if (messageTemplate !== undefined) update.messageTemplate = messageTemplate;
        if (isActive !== undefined) update.isActive = isActive;
        // Link opsional ke WaTemplate WABA (Meta-approved) untuk kategori customer-facing.
        // Empty string / null → unlink (kembali ke jalur Fonnte free-text). Cast ObjectId oleh Mongoose.
        if (waTemplateId !== undefined) update.waTemplateId = waTemplateId || null;

        const automation = await WaAutomation.findByIdAndUpdate(id, update, { new: true });
        if (!automation) {
            return NextResponse.json({ success: false, error: 'Automation not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true, data: automation });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest, props: any) {
    const tenantSlug = request.headers.get('x-store-slug') || 'pusat';
    const { WaAutomation } = await getTenantModels(tenantSlug);

    const permError = await checkPermission(request, 'settings', 'edit');
    if (permError) return permError;

    try {
        const { id } = await props.params;
        
        

        const automation = await WaAutomation.findByIdAndDelete(id);
        if (!automation) {
            return NextResponse.json({ success: false, error: 'Automation not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true, message: 'Automation deleted successfully' });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
