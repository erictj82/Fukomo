export type CorrectionNamedPermission = 'REQUEST_CORRECTION' | 'APPROVE_CORRECTION';
export type CorrectionAction = 'add' | 'replace' | 'remove';

type CorrectionPerms = {
    view?: string | boolean;
    create?: boolean;
    edit?: boolean;
    delete?: boolean;
};

type PermissionBag = {
    corrections?: CorrectionPerms;
    [key: string]: unknown;
};

export function roleNameOf(role: unknown): string {
    if (!role) return '';
    if (typeof role === 'string') return role;
    const name = (role as { name?: string }).name;
    return String(name || '');
}

export function isPrivilegedRole(role: unknown): boolean {
    const n = roleNameOf(role).toLowerCase();
    return n === 'super admin' || n === 'superadmin' || n === 'admin' || n === 'owner';
}

export function hasNamedCorrectionPermission(
    permissions: PermissionBag | null | undefined,
    role: unknown,
    name: CorrectionNamedPermission,
): boolean {
    if (isPrivilegedRole(role)) return true;
    const p = permissions?.corrections || {};
    if (name === 'REQUEST_CORRECTION') return !!p.create;
    if (name === 'APPROVE_CORRECTION') return !!p.edit;
    return false;
}

export function canViewCorrections(permissions: PermissionBag | null | undefined, role: unknown): boolean {
    if (isPrivilegedRole(role)) return true;
    const p = permissions?.corrections || {};
    if (p.view && p.view !== 'none') return true;
    return !!p.create || !!p.edit;
}

export function validateCorrectionCreate(body: {
    reason?: string;
    action?: string;
    appointmentId?: string;
    toServiceId?: string;
    fukomoLineId?: string;
} | null | undefined): string | null {
    const reason = String(body?.reason || '').trim();
    if (!reason) return 'Alasan koreksi wajib diisi.';
    const action = body?.action as CorrectionAction;
    if (!['add', 'replace', 'remove'].includes(action)) return 'Jenis koreksi tidak valid.';
    if (!body?.appointmentId) return 'Appointment / WO wajib dipilih.';
    if (action === 'add' && !body?.toServiceId) return 'Layanan baru wajib dipilih.';
    if (action === 'replace' && (!body?.fukomoLineId || !body?.toServiceId)) {
        return 'Layanan lama dan layanan baru wajib dipilih.';
    }
    if (action === 'remove' && !body?.fukomoLineId) return 'Layanan yang dihapus wajib dipilih.';
    return null;
}

export function notificationPreview(doc: {
    customerName?: string;
    workOrderNumber?: string;
    fromServiceName?: string;
    toServiceName?: string;
    action?: string;
    reason?: string;
    requestedByName?: string;
}): string {
    const wo = doc.workOrderNumber ? `WO #${doc.workOrderNumber}` : 'WO';
    const from = doc.fromServiceName || (doc.action === 'add' ? '—' : 'layanan lama');
    const to = doc.toServiceName || (doc.action === 'remove' ? '(hapus)' : 'layanan baru');
    const by = doc.requestedByName || 'Kasir';
    return [
        doc.customerName || 'Customer',
        wo,
        `${from} → ${to}`,
        doc.reason || '',
        `oleh ${by}`,
    ].filter(Boolean).join(' · ');
}
