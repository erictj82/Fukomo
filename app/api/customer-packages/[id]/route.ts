import { getTenantModels } from "@/lib/tenantDb";
import { NextRequest, NextResponse } from "next/server";
import { checkPermissionWithSession } from "@/lib/rbac";
import { logActivity } from "@/lib/logger";

export async function GET(request: NextRequest, props: any) {
    const tenantSlug = request.headers.get('x-store-slug') || 'pusat';
    const { CustomerPackage } = await getTenantModels(tenantSlug);
    try {
        const { error: permissionError } = await checkPermissionWithSession(request, 'pos', 'view');
        if (permissionError) return permissionError;
        const { id } = await props.params;
        const pkg = await CustomerPackage.findById(id).populate('package').populate('customer', 'name phone');
        if (!pkg) return NextResponse.json({ success: false, error: 'Package not found' }, { status: 404 });
        return NextResponse.json({ success: true, data: pkg });
    } catch (error) {
        return NextResponse.json({ success: false, error: 'Failed to fetch package' }, { status: 500 });
    }
}

export async function PUT(request: NextRequest, props: any) {
    const tenantSlug = request.headers.get('x-store-slug') || 'pusat';
    const { CustomerPackage } = await getTenantModels(tenantSlug);
    try {
        const { error: permissionError, session } = await checkPermissionWithSession(request, 'pos', 'edit');
        if (permissionError) return permissionError;

        const { id } = await props.params;
        const body = await request.json();
        const { expiresAt, serviceQuotas } = body;

        const pkg = await CustomerPackage.findById(id);
        if (!pkg) return NextResponse.json({ success: false, error: 'Package not found' }, { status: 404 });

        if (expiresAt !== undefined) pkg.expiresAt = expiresAt ? new Date(expiresAt) : null;
        if (serviceQuotas && Array.isArray(serviceQuotas)) {
            for (const update of serviceQuotas) {
                const quota = pkg.serviceQuotas.find((q: any) => 
                    (update.service && String(q.service) === String(update.service)) ||
                    (update._id && String(q._id) === String(update._id)) ||
                    (update.serviceName && q.serviceName === update.serviceName)
                );
                if (quota) {
                    quota.remainingQuota = Math.max(0, Number(update.remainingQuota));
                }
            }
            pkg.markModified('serviceQuotas');
        }
        await pkg.save();

        await logActivity({ req: request, action: 'update', resource: 'CustomerPackage', resourceId: id, details: `Edited customer package ${pkg.packageName}` });

        return NextResponse.json({ success: true, data: pkg });
    } catch (error: any) {
        console.error('CustomerPackage PUT error:', error);
        return NextResponse.json({ success: false, error: 'Failed to update package' }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest, props: any) {
    const tenantSlug = request.headers.get('x-store-slug') || 'pusat';
    const { CustomerPackage } = await getTenantModels(tenantSlug);
    try {
        const { error: permissionError, session } = await checkPermissionWithSession(request, 'pos', 'delete');
        if (permissionError) return permissionError;

        const { id } = await props.params;
        const pkg = await CustomerPackage.findByIdAndUpdate(id, { status: 'cancelled' }, { new: true });
        if (!pkg) return NextResponse.json({ success: false, error: 'Package not found' }, { status: 404 });

        await logActivity({ req: request, action: 'delete', resource: 'CustomerPackage', resourceId: id, details: `Cancelled customer package ${pkg.packageName}` });

        return NextResponse.json({ success: true, data: pkg });
    } catch (error: any) {
        console.error('CustomerPackage DELETE error:', error);
        return NextResponse.json({ success: false, error: 'Failed to delete package' }, { status: 500 });
    }
}
