import crypto from 'crypto';
import { normalizeIndonesianPhone } from '@/lib/phone';

export const UNFILED_FOLDER = '_unfiled';

export type WabaBinding = {
    fingerprint: string;
    phone: string;
};

export type WabaTemplateFolder = {
    key: string;
    phone: string;
    label: string;
    active: boolean;
    templates: any[];
};

export function wabaLicensesFingerprint(licensesKey: string): string {
    const raw = String(licensesKey || '').trim();
    if (!raw) return '';
    return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

export function normalizeWabaPhone(raw: unknown): string {
    return normalizeIndonesianPhone(raw);
}

export function formatWabaPhoneDisplay(phone: string): string {
    const n = normalizeWabaPhone(phone);
    if (!n) return '';
    return n.startsWith('62') ? `+${n}` : n;
}

export function templateFolderKey(template: any): string {
    return normalizeWabaPhone(template?.wabaPhone) || UNFILED_FOLDER;
}

export function belongsToCurrentFolder(template: any, binding: WabaBinding): boolean {
    const key = templateFolderKey(template);
    if (key === UNFILED_FOLDER) return true;
    if (binding.phone) return key === binding.phone;
    const fp = String(template?.wabaLicensesFingerprint || '').trim();
    return Boolean(binding.fingerprint && fp && fp === binding.fingerprint);
}

/** Ambil nomor WABA dari payload BalesOtomatis /get-template-list kalau ada. */
export function extractWabaPhoneFromPayload(data: any): string {
    const buckets: unknown[] = [
        data?.phone,
        data?.phone_number,
        data?.display_phone_number,
        data?.number_whatsapp,
        data?.waba_phone,
        data?.account_phone,
        data?.info?.phone,
        data?.info?.phone_number,
        data?.info?.number_whatsapp,
    ];
    const list = Array.isArray(data?.data) ? data.data : (Array.isArray(data?.templates) ? data.templates : []);
    for (const t of list) {
        buckets.push(t?.phone, t?.phone_number, t?.display_phone_number, t?.number_whatsapp);
    }
    for (const raw of buckets) {
        const n = normalizeWabaPhone(raw);
        if (n.startsWith('62') && n.length >= 10) return n;
    }
    return '';
}

export function bindingFromSettings(settings: any, licensesKey: string): WabaBinding {
    return {
        fingerprint: wabaLicensesFingerprint(licensesKey),
        phone: normalizeWabaPhone(settings?.balesotomatisWabaPhone),
    };
}

export function stampWabaBinding(target: { wabaPhone?: string; wabaLicensesFingerprint?: string }, binding: WabaBinding) {
    if (binding.fingerprint) target.wabaLicensesFingerprint = binding.fingerprint;
    if (binding.phone) target.wabaPhone = binding.phone;
}

export function isTemplateBoundToCurrentWaba(template: any, binding: WabaBinding): boolean {
    if (binding.phone) {
        return templateFolderKey(template) === binding.phone;
    }
    const fp = String(template?.wabaLicensesFingerprint || '').trim();
    if (!binding.fingerprint || !fp || fp !== binding.fingerprint) return false;
    return true;
}

export function templateSendReady(template: any, binding: WabaBinding): boolean {
    return String(template?.metaStatus || '').toUpperCase() === 'APPROVED'
        && Boolean(String(template?.metaTemplateName || template?.name || '').trim())
        && isTemplateBoundToCurrentWaba(template, binding);
}

export function templateUnusableReason(template: any, binding: WabaBinding): string | null {
    if (templateSendReady(template, binding)) return null;
    const folder = formatWabaPhoneDisplay(template?.wabaPhone);
    const current = formatWabaPhoneDisplay(binding.phone);
    if (binding.phone && templateFolderKey(template) !== binding.phone) {
        if (!folder) return `Tidak aktif — belum masuk folder nomor. Setting sekarang folder ${current}.`;
        return `Tidak aktif — ada di folder ${folder}. Setting sedang pakai folder ${current}.`;
    }
    const status = String(template?.metaStatus || 'LOCAL').toUpperCase();
    if (status === 'PENDING') return 'Masih menunggu review Meta.';
    if (status === 'REJECTED') return 'Ditolak Meta.';
    if (status !== 'APPROVED') return 'Belum di-approve Meta.';
    return 'Tidak aktif pada folder nomor di setting.';
}

export function annotateWabaTemplate(template: any, binding: WabaBinding) {
    const usable = templateSendReady(template, binding);
    const folderKey = templateFolderKey(template);
    return {
        usable,
        unusableReason: usable ? null : templateUnusableReason(template, binding),
        currentWabaPhone: binding.phone || '',
        folderKey,
        folderLabel: folderKey === UNFILED_FOLDER ? 'Belum masuk folder nomor' : formatWabaPhoneDisplay(folderKey),
    };
}

export function defaultFolderLabel(key: string): string {
    if (key === UNFILED_FOLDER) return 'Belum masuk folder nomor';
    const display = formatWabaPhoneDisplay(key);
    return display ? `Folder ${display}` : 'Folder template';
}

export function sanitizeFolderLabel(raw: unknown): string {
    return String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 80);
}

export function applyFolderLabels(
    folders: WabaTemplateFolder[],
    labels: Record<string, string> | null | undefined,
): WabaTemplateFolder[] {
    const map = labels && typeof labels === 'object' ? labels : {};
    return folders.map((f) => {
        const custom = sanitizeFolderLabel(map[f.key]);
        return { ...f, label: custom || defaultFolderLabel(f.key) };
    });
}

export function groupTemplatesIntoFolders(templates: any[], binding: WabaBinding): WabaTemplateFolder[] {
    const byKey = new Map<string, WabaTemplateFolder>();
    const ensure = (key: string) => {
        if (!byKey.has(key)) {
            byKey.set(key, {
                key,
                phone: key === UNFILED_FOLDER ? '' : key,
                label: defaultFolderLabel(key),
                active: Boolean(binding.phone) && key === binding.phone,
                templates: [],
            });
        }
        return byKey.get(key)!;
    };
    if (binding.phone) ensure(binding.phone);
    for (const t of templates) {
        ensure(templateFolderKey(t)).templates.push(t);
    }
    return [...byKey.values()].sort((a, b) => {
        if (a.active !== b.active) return a.active ? -1 : 1;
        if (a.key === UNFILED_FOLDER) return 1;
        if (b.key === UNFILED_FOLDER) return -1;
        return a.label.localeCompare(b.label);
    });
}
