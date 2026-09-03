import { getTenantModels } from "@/lib/tenantDb";
import { NextRequest, NextResponse } from 'next/server';
import { checkPermission } from '@/lib/rbac';
import {
    UNFILED_FOLDER,
    defaultFolderLabel,
    normalizeWabaPhone,
    sanitizeFolderLabel,
} from '@/lib/wabaBinding';

export async function PUT(request: NextRequest) {
    const tenantSlug = request.headers.get('x-store-slug') || 'pusat';
    const { Settings } = await getTenantModels(tenantSlug);

    try {
        const permissionError = await checkPermission(request, 'waTemplates', 'edit');
        if (permissionError) return permissionError;

        const body = await request.json();
        const rawKey = String(body?.key || '').trim();
        const label = sanitizeFolderLabel(body?.label);
        if (!rawKey) {
            return NextResponse.json({ success: false, error: 'Folder key required' }, { status: 400 });
        }

        const folderKey = rawKey === UNFILED_FOLDER ? UNFILED_FOLDER : normalizeWabaPhone(rawKey);
        if (!folderKey) {
            return NextResponse.json({ success: false, error: 'Folder tidak valid' }, { status: 400 });
        }

        const settings = await Settings.findOne({});
        const current = {
            ...(settings && typeof (settings as any).wabaTemplateFolderLabels === 'object'
                ? (settings as any).wabaTemplateFolderLabels
                : {}),
        };
        if (label) current[folderKey] = label;
        else delete current[folderKey];

        await Settings.findOneAndUpdate(
            {},
            { $set: { wabaTemplateFolderLabels: current } },
            { upsert: true },
        );

        return NextResponse.json({
            success: true,
            key: folderKey,
            label: label || defaultFolderLabel(folderKey),
        });
    } catch (error: any) {
        return NextResponse.json(
            { success: false, error: error?.message || 'Gagal rename folder template' },
            { status: 500 },
        );
    }
}
