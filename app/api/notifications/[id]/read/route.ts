import { NextRequest, NextResponse } from 'next/server';
import { getTenantModels } from '@/lib/tenantDb';
import { requireCorrectionAccess } from '@/lib/rbac';

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const tenantSlug = request.headers.get('x-store-slug') || 'pusat';
    const { error, session } = await requireCorrectionAccess(request, 'approve');
    if (error) return error;
    const { id } = await props.params;
    const { AppNotification } = await getTenantModels(tenantSlug);
    const row = await AppNotification.findOneAndUpdate(
        { _id: id, user: session.user.id },
        { $set: { readAt: new Date() } },
        { new: true }
    );
    if (!row) return NextResponse.json({ success: false, error: 'Notifikasi tidak ditemukan.' }, { status: 404 });
    return NextResponse.json({ success: true, data: row });
}
