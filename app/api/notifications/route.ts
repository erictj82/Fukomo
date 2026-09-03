import { NextRequest, NextResponse } from 'next/server';
import { getTenantModels } from '@/lib/tenantDb';
import { requireCorrectionAccess } from '@/lib/rbac';

export async function GET(request: NextRequest) {
    const tenantSlug = request.headers.get('x-store-slug') || 'pusat';
    const { error, session } = await requireCorrectionAccess(request, 'approve');
    if (error) return error;
    const { AppNotification } = await getTenantModels(tenantSlug);
    const { searchParams } = new URL(request.url);
    const unreadOnly = searchParams.get('unread') === '1';
    const query: Record<string, unknown> = { user: session.user.id };
    if (unreadOnly) query.readAt = { $exists: false };

    const rows = await AppNotification.find(query).sort({ createdAt: -1 }).limit(50).lean();
    const unread = await AppNotification.countDocuments({ user: session.user.id, readAt: { $exists: false } });
    return NextResponse.json({ success: true, data: rows, unread });
}

export async function POST(request: NextRequest) {
    const tenantSlug = request.headers.get('x-store-slug') || 'pusat';
    const { error, session } = await requireCorrectionAccess(request, 'approve');
    if (error) return error;
    const { AppNotification } = await getTenantModels(tenantSlug);
    await AppNotification.updateMany(
        { user: session.user.id, readAt: { $exists: false } },
        { $set: { readAt: new Date() } }
    );
    return NextResponse.json({ success: true });
}
