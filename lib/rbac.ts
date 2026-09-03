import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import {
    canViewCorrections,
    hasNamedCorrectionPermission,
} from '@/lib/correctionPerms';

type Action = 'view' | 'create' | 'edit' | 'delete';
export type CorrectionAccessAction = 'view' | 'request' | 'approve';

// Return type: null = allowed, NextResponse = denied
// Session dibawa ikut agar caller tidak perlu memanggil auth() lagi (B14 fix)
export type PermissionResult = {
    error: NextResponse;
    session: null;
} | {
    error: null;
    session: any;
};

export async function checkPermission(
    request: NextRequest,
    resource: string,
    action: Action
): Promise<NextResponse | null> {
    const result = await checkPermissionWithSession(request, resource, action);
    return result.error;
}

// [B14 FIX] Versi yang return session sekaligus — gunakan ini di route yang butuh
// session setelah permission check, agar tidak ada double auth() call
export async function checkPermissionWithSession(
    request: NextRequest,
    resource: string,
    action: Action
): Promise<PermissionResult> {
    const session: any = await auth();

    if (!session || !session.user) {
        return {
            error: NextResponse.json(
                { success: false, error: "Unauthorized" },
                { status: 401 }
            ),
            session: null,
        };
    }

    // [B13 FIX] Validasi x-store-slug header tidak bisa dimanipulasi untuk akses tenant lain
    // Super Admin diizinkan override (untuk kebutuhan admin lintas-tenant)
    const isSuperAdmin =
        session.user.role === 'Super Admin' ||
        (session.user.role && session.user.role.name === 'Super Admin');

    const requestedSlug = request.headers.get('x-store-slug');
    const sessionSlug = session.user.tenantSlug;

    if (!isSuperAdmin && requestedSlug && sessionSlug && requestedSlug !== sessionSlug) {
        return {
            error: NextResponse.json(
                { success: false, error: "Access Denied: Store slug mismatch" },
                { status: 403 }
            ),
            session: null,
        };
    }

    const { permissions } = session.user;

    // Super admin — boleh semua
    if (isSuperAdmin) {
        return { error: null, session };
    }

    // Tidak ada permission object
    if (!permissions) {
        return {
            error: NextResponse.json(
                { success: false, error: "Access Denied: No permissions found" },
                { status: 403 }
            ),
            session: null,
        };
    }

    const resourcePerms = permissions[resource];
    if (!resourcePerms) {
        return {
            error: NextResponse.json(
                { success: false, error: "Access Denied: Resource restricted" },
                { status: 403 }
            ),
            session: null,
        };
    }

    let allowed = false;
    if (action === 'view') {
        allowed = resourcePerms.view !== 'none';
    } else {
        allowed = !!resourcePerms[action];
    }

    if (!allowed) {
        return {
            error: NextResponse.json(
                { success: false, error: `Access Denied: Cannot ${action} ${resource}` },
                { status: 403 }
            ),
            session: null,
        };
    }

    return { error: null, session };
}

// Enhanced permission check that includes data ownership
export async function checkResourceOwnership(
    request: NextRequest,
    resource: string,
    action: Action,
    resourceId?: string,
    ownerId?: string
): Promise<NextResponse | null> {
    // [B14 FIX] Gunakan checkPermissionWithSession agar tidak double auth()
    const result = await checkPermissionWithSession(request, resource, action);
    if (result.error) return result.error;

    const session = result.session;

    // Super admin atau view=all → allow
    const isSuperAdmin =
        session.user.role === 'Super Admin' ||
        (session.user.role && session.user.role.name === 'Super Admin');

    if (isSuperAdmin || session.user.permissions?.[resource]?.view === 'all') {
        return null;
    }

    // view=own → cek kepemilikan
    if (session.user.permissions?.[resource]?.view === 'own' && ownerId) {
        if (ownerId.toString() !== session.user.id) {
            return NextResponse.json(
                { success: false, error: "Access Denied: You can only access your own resources" },
                { status: 403 }
            );
        }
    }

    return null;
}

// Helper to get view scope for filtering data
// [B14 FIX] Terima session opsional — jika sudah punya session dari checkPermissionWithSession,
// pass langsung untuk menghindari auth() call kedua
export async function getViewScope(
    resource: string,
    existingSession?: any
): Promise<'all' | 'own' | 'none'> {
    const session = existingSession ?? await auth();
    if (!session?.user) return 'none';

    const isSuperAdmin =
        session.user.role === 'Super Admin' ||
        (session.user.role && session.user.role.name === 'Super Admin');

    if (isSuperAdmin) return 'all';

    if (!session.user.permissions) return 'none';
    return session.user.permissions[resource]?.view || 'none';
}

// Helper to get current user ID
export async function getCurrentUserId(): Promise<string | null> {
    const session: any = await auth();
    return session?.user?.id || null;
}

export async function requireCorrectionAccess(
    request: NextRequest,
    action: CorrectionAccessAction
): Promise<PermissionResult> {
    const session: any = await auth();
    if (!session || !session.user) {
        return {
            error: NextResponse.json(
                { success: false, error: "Unauthorized" },
                { status: 401 }
            ),
            session: null,
        };
    }

    const isSuperAdmin =
        session.user.role === 'Super Admin' ||
        (session.user.role && session.user.role.name === 'Super Admin');
    const requestedSlug = request.headers.get('x-store-slug');
    const sessionSlug = session.user.tenantSlug;
    if (!isSuperAdmin && requestedSlug && sessionSlug && requestedSlug !== sessionSlug) {
        return {
            error: NextResponse.json(
                { success: false, error: "Access Denied: Store slug mismatch" },
                { status: 403 }
            ),
            session: null,
        };
    }

    const perms = session.user.permissions;
    const role = session.user.role;
    let allowed = false;
    if (action === 'view') allowed = canViewCorrections(perms, role);
    if (action === 'request') allowed = hasNamedCorrectionPermission(perms, role, 'REQUEST_CORRECTION');
    if (action === 'approve') allowed = hasNamedCorrectionPermission(perms, role, 'APPROVE_CORRECTION');

    if (!allowed) {
        const label = action === 'request' ? 'REQUEST_CORRECTION' : action === 'approve' ? 'APPROVE_CORRECTION' : 'corrections';
        return {
            error: NextResponse.json(
                { success: false, error: `Access Denied: ${label}` },
                { status: 403 }
            ),
            session: null,
        };
    }
    return { error: null, session };
}