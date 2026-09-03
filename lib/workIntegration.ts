import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getTenantModels } from '@/lib/tenantDb';

const HEADER = 'x-integration-key';

export function isWorkIntegrationEnabled(): boolean {
    return Boolean(process.env.WORK_BASE_URL?.trim() && process.env.WORK_INTEGRATION_KEY?.trim());
}

export function workBaseUrl(): string {
    return (process.env.WORK_BASE_URL || '').replace(/\/$/, '');
}

export function workIntegrationKey(): string {
    return (process.env.WORK_INTEGRATION_KEY || '').trim();
}

export function requireWorkIntegrationAuth(request: NextRequest): NextResponse | null {
    const configured = workIntegrationKey();
    if (!configured) {
        return NextResponse.json(
            { error: { code: 'not_configured', message: 'WORK_INTEGRATION_KEY belum diset.' } },
            { status: 503 }
        );
    }
    const provided = request.headers.get(HEADER) || '';
    const a = Buffer.from(provided);
    const b = Buffer.from(configured);
    if (a.length !== b.length) {
        crypto.timingSafeEqual(b, b);
        return NextResponse.json(
            { error: { code: 'unauthorized', message: 'Integration key tidak valid.' } },
            { status: 401 }
        );
    }
    if (!crypto.timingSafeEqual(a, b)) {
        return NextResponse.json(
            { error: { code: 'unauthorized', message: 'Integration key tidak valid.' } },
            { status: 401 }
        );
    }
    return null;
}

export function lineIdFor(appointmentId: string, serviceId: string, index: number): string {
    return `${appointmentId}:${serviceId}:${index}`;
}

export async function upsertVisitFromAppointment(tenantSlug: string, appointment: any) {
    const { Visit } = await getTenantModels(tenantSlug);
    const aptId = String(appointment._id);
    const lines = (appointment.services || []).map((s: any, i: number) => ({
        lineId: lineIdFor(aptId, String(s.service?._id || s.service), i),
        service: s.service?._id || s.service,
        name: s.name,
        price: s.price || 0,
        duration: s.duration || 0,
        packageFlag: Boolean(s.packageFlag),
    }));
    const visit = await Visit.findOneAndUpdate(
        { appointment: appointment._id },
        {
            $set: {
                customer: appointment.customer,
                lineItems: lines,
                notes: appointment.notes || '',
            },
            $setOnInsert: {
                status: 'draft',
            },
        },
        { new: true, upsert: true }
    );
    return visit;
}

async function workFetch(path: string, init: RequestInit & { tenantSlug: string; idempotencyKey: string }) {
    let res: Response;
    try {
        res = await fetch(`${workBaseUrl()}${path}`, {
            ...init,
            headers: {
                'Content-Type': 'application/json',
                'X-Integration-Key': workIntegrationKey(),
                'X-Store-Slug': init.tenantSlug,
                'Idempotency-Key': init.idempotencyKey,
                ...(init.headers || {}),
            },
            signal: AbortSignal.timeout(8000),
        });
    } catch (e: any) {
        const raw = String(e?.message || e);
        const unreachable = /fetch failed|Failed to fetch|ECONNREFUSED|AbortError|TimeoutError|timed out/i.test(raw);
        throw new Error(
            unreachable
                ? `Tidak bisa terhubung ke Work (${workBaseUrl()}). API Work tidak merespons.`
                : `Gagal menghubungi Work: ${raw}`
        );
    }
    const text = await res.text();
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
    return { status: res.status, json };
}

export async function fetchWorkOrderSnapshot(tenantSlug: string, woIds: string[]): Promise<{
    ok: boolean;
    jobs_by_wo: Record<string, unknown[]>;
}> {
    const ids = [...new Set((woIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
    if (!ids.length || !isWorkIntegrationEnabled()) return { ok: false, jobs_by_wo: {} };
    const result = await workFetch('/api/integrations/fukomo/work-orders/snapshot', {
        method: 'POST',
        tenantSlug,
        idempotencyKey: `wo-snapshot:${crypto.randomUUID()}`,
        body: JSON.stringify({ wo_ids: ids }),
    });
    if (result.status >= 400) {
        console.error('[workIntegration] WO snapshot failed', result.status, result.json);
        return { ok: false, jobs_by_wo: {} };
    }
    return { ok: true, jobs_by_wo: result.json?.jobs_by_wo || {} };
}

export async function dispatchVisitToWork(tenantSlug: string, appointment: any, visit: any) {
    if (!isWorkIntegrationEnabled()) return null;
    const { Customer, Visit } = await getTenantModels(tenantSlug);
    const customer = await Customer.findById(appointment.customer).lean();
    const aptId = String(appointment._id);
    const body = {
        appointment_id: aptId,
        tenant_slug: tenantSlug,
        customer: {
            id: customer?._id ? String(customer._id) : String(appointment.customer),
            name: customer?.name || 'Customer',
            phone: customer?.phone || '',
        },
        preferred_staff: appointment.staff
            ? { id: String(appointment.staff._id || appointment.staff), name: appointment.staff?.name }
            : null,
        notes: appointment.notes || '',
        lines: (visit.lineItems || []).map((l: any) => ({
            line_id: l.lineId,
            fukomo_service_id: String(l.service),
            name: l.name,
            duration: l.duration,
            package_flag: Boolean(l.packageFlag),
        })),
    };
    const result = await workFetch(`/api/integrations/fukomo/visits/${aptId}`, {
        method: 'PUT',
        body: JSON.stringify(body),
        tenantSlug,
        idempotencyKey: `dispatch:${aptId}:${visit.updatedAt || Date.now()}`,
    });
    if (result.status >= 400) {
        console.error('[workIntegration] dispatch failed', result.status, result.json);
        throw new Error(result.json?.error?.message || `Work dispatch gagal (${result.status})`);
    }
    await Visit.findByIdAndUpdate(visit._id, {
        $set: {
            status: visit.status === 'draft' ? 'dispatched' : visit.status,
            workOrderId: result.json.wo_id,
            workOrderNumber: result.json.wo_number,
            lastSyncAt: new Date(),
            lastEvent: 'dispatched',
        },
    });
    return result.json;
}

export async function cancelVisitOnWork(tenantSlug: string, appointmentId: string, reason: string) {
    if (!isWorkIntegrationEnabled()) return null;
    const { Visit } = await getTenantModels(tenantSlug);
    const result = await workFetch(`/api/integrations/fukomo/visits/${appointmentId}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
        tenantSlug,
        idempotencyKey: `cancel:${appointmentId}:${reason}`,
    });
    if (result.status >= 400) {
        throw new Error(result.json?.error?.message || `Work cancel gagal (${result.status})`);
    }
    await Visit.findOneAndUpdate(
        { appointment: appointmentId },
        { $set: { status: 'cancelled', lastSyncAt: new Date(), lastEvent: reason } }
    );
    return result;
}

export function shouldSkipAutoInvoice(status: string): boolean {
    if (!isWorkIntegrationEnabled()) return false;
    return ['confirmed', 'processing', 'completed'].includes(status);
}

export async function applyWoEvent(tenantSlug: string, payload: any) {
    const { Appointment, Visit, IntegrationIdempotency } = await getTenantModels(tenantSlug);
    const idem = payload.idempotency_key;
    if (idem) {
        const hit = await IntegrationIdempotency.findOne({ key: idem });
        if (hit) return { replayed: true, statusCode: hit.statusCode, body: hit.body };
    }
    const aptId = payload.appointment_id;
    const appointment = await Appointment.findById(aptId);
    if (!appointment) {
        const body = { error: { code: 'not_found', message: 'Appointment tidak ditemukan.' } };
        return { replayed: false, statusCode: 404, body };
    }
    const visit = await Visit.findOne({ appointment: aptId });
    const event = payload.event;
    const now = new Date();
    const aptSet: Record<string, unknown> = {
        workOrderId: payload.wo_id,
        workOrderNumber: payload.wo_number,
        workSyncStatus: event,
        workLastEventAt: now,
    };
    const update: any = { $set: aptSet };
    if (event === 'processing' && appointment.status === 'confirmed') {
        update.$set.status = 'processing';
        update.$push = {
            statusHistory: {
                status: 'processing', fromStatus: appointment.status, at: now, by: 'work', note: 'WO processing',
            },
        };
    }
    await Appointment.findByIdAndUpdate(aptId, update);

    if (event === 'processing') {
        const fresh = await Appointment.findById(aptId);
        if (fresh) {
            try {
                await ensureDraftInvoice(tenantSlug, fresh, {
                    wo_id: payload.wo_id,
                    wo_number: payload.wo_number,
                });
            } catch (e) {
                console.error('[workIntegration] draft invoice from WO event failed', aptId, e);
            }
        }
    }

    if (visit) {
        const visitStatus =
            event === 'completed' ? 'completed'
                : event === 'cancelled' || event === 'unresolved' ? 'cancelled'
                    : event === 'processing' || event === 'assigned' ? 'in_progress'
                        : visit.status;
        await Visit.findByIdAndUpdate(visit._id, {
            $set: {
                status: visitStatus,
                workOrderId: payload.wo_id,
                workOrderNumber: payload.wo_number,
                lastSyncAt: now,
                lastEvent: event,
                performers: flattenPerformers(payload.jobs),
            },
        });
    }

    try {
        await syncDraftFromWoJobs(tenantSlug, aptId, payload);
    } catch (e) {
        console.error('[workIntegration] draft sync from WO event failed', aptId, e);
    }

    const body = { ok: true, appointment_id: aptId, event };
    if (idem) {
        await IntegrationIdempotency.create({
            key: idem,
            statusCode: 200,
            body,
            expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
        }).catch(() => null);
    }
    return { replayed: false, statusCode: 200, body };
}

export async function applyWoCompleted(tenantSlug: string, payload: any) {
    const result = await applyWoEvent(tenantSlug, { ...payload, event: 'completed' });
    if (result.statusCode !== 200) return result;
    const { Appointment, Visit, Invoice } = await getTenantModels(tenantSlug);
    const aptId = payload.appointment_id;
    const appointment = await Appointment.findById(aptId);
    const paidInvoice = await Invoice.findOne({
        appointment: aptId,
        status: { $in: ['paid', 'partially_paid'] },
    });
    if (appointment && !['completed', 'cancelled', 'no-show'].includes(appointment.status)) {
        const setFields: Record<string, unknown> = { workSyncStatus: 'completed', workLastEventAt: new Date() };
        const history: any = {
            at: new Date(),
            by: 'work',
        };
        if (paidInvoice) {
            setFields.status = 'completed';
            history.status = 'completed';
            history.fromStatus = appointment.status;
            history.note = 'WO selesai — appointment ditutup karena nota sudah dibayar';
        } else {
            history.status = appointment.status;
            history.fromStatus = appointment.status;
            history.note = 'WO selesai — nota siap dilunasi di POS';
        }
        await Appointment.findByIdAndUpdate(aptId, {
            $set: setFields,
            $push: { statusHistory: history },
        });
    }
    await Visit.findOneAndUpdate(
        { appointment: aptId },
        { $set: { status: 'completed', lastEvent: 'completed', lastSyncAt: new Date(), performers: flattenPerformers(payload.jobs) } }
    );
    await Invoice.updateMany(
        { appointment: aptId, status: 'draft' },
        { $set: { status: 'pending', workOrderId: payload.wo_id, workOrderNumber: payload.wo_number } }
    );
    return { replayed: result.replayed, statusCode: 200, body: { ok: true, appointment_id: aptId, event: 'ready_for_pos' } };
}

function flattenPerformers(jobs: any[] = []) {
    const rows: any[] = [];
    for (const j of jobs) {
        for (const p of j.performers || []) {
            rows.push({
                lineId: j.line_id,
                staffName: p.staff_name,
                workStaffId: p.staff_id,
                credit: p.credit,
                completedAt: p.completed_at ? new Date(p.completed_at) : undefined,
            });
        }
    }
    return rows;
}

export async function afterAppointmentSaved(tenantSlug: string, appointment: any, prevStatus?: string) {
    if (!isWorkIntegrationEnabled()) return;
    const { Appointment } = await getTenantModels(tenantSlug);
    const status = appointment.status;
    if (status === 'confirmed' || status === 'processing') {
        const visit = await upsertVisitFromAppointment(tenantSlug, appointment);
        if (status === 'processing') {
            let result: any = null;
            let dispatchError: Error | null = null;
            try {
                result = await dispatchVisitToWork(tenantSlug, appointment, visit);
                if (result?.wo_id) {
                    await Appointment.findByIdAndUpdate(appointment._id, {
                        $set: {
                            workOrderId: result.wo_id,
                            workOrderNumber: result.wo_number,
                            workSyncStatus: 'dispatched',
                            workLastEventAt: new Date(),
                        },
                    });
                    appointment.workOrderId = result.wo_id;
                    appointment.workOrderNumber = result.wo_number;
                }
            } catch (e: any) {
                dispatchError = e instanceof Error ? e : new Error(String(e?.message || e));
                console.error('[workIntegration] dispatch failed, draft nota tetap dibuat', appointment._id, dispatchError.message);
            }
            try {
                await ensureDraftInvoice(tenantSlug, appointment, result);
            } catch (invErr) {
                console.error('[workIntegration] draft invoice failed', appointment._id, invErr);
                throw invErr;
            }
            if (dispatchError) throw dispatchError;
        }
    }
    const becameTerminal = ['cancelled', 'no-show'].includes(status)
        && prevStatus
        && !['cancelled', 'no-show'].includes(prevStatus);
    if (becameTerminal) {
        await cancelVisitOnWork(tenantSlug, String(appointment._id), status === 'no-show' ? 'no_show' : 'cancelled');
        const { Invoice } = await getTenantModels(tenantSlug);
        await Invoice.updateMany(
            { appointment: appointment._id, status: { $in: ['draft', 'pending'] } },
            { $set: { status: 'cancelled' } }
        );
    }
}

export function catalogFieldsChanged(before: any, after: any): boolean {
    if (!before) return true;
    const beforeInactive = String(before.status || '') === 'inactive';
    const afterInactive = String(after?.status || '') === 'inactive';
    return String(before.name || '') !== String(after?.name || '')
        || String(before.skillName || '').trim() !== String(after?.skillName || '').trim()
        || Number(before.duration || 0) !== Number(after?.duration || 0)
        || Number(before.price || 0) !== Number(after?.price || 0)
        || Number(before.memberPrice || 0) !== Number(after?.memberPrice || 0)
        || String(before.commissionType || '') !== String(after?.commissionType || '')
        || Number(before.commissionValue || 0) !== Number(after?.commissionValue || 0)
        || String(before.sellingCommissionType || '') !== String(after?.sellingCommissionType || '')
        || Number(before.sellingCommissionValue || 0) !== Number(after?.sellingCommissionValue || 0)
        || beforeInactive !== afterInactive;
}

export async function syncCatalogServiceToWork(tenantSlug: string, service: any) {
    if (!isWorkIntegrationEnabled()) return null;
    const skillName = String(service.skillName || '').trim();
    if (!skillName) {
        throw new Error('Skill wajib diisi supaya layanan bisa di-link ke Work.');
    }
    const result = await workFetch('/api/integrations/fukomo/catalog/services', {
        method: 'PUT',
        body: JSON.stringify({
            fukomo_service_id: String(service._id),
            name: service.name,
            skill_name: skillName,
            duration: service.duration,
            active: service.status !== 'inactive',
            price: service.price,
            member_price: service.memberPrice,
            commission_type: service.commissionType,
            commission_value: service.commissionValue,
            selling_commission_type: service.sellingCommissionType,
            selling_commission_value: service.sellingCommissionValue,
        }),
        tenantSlug,
        idempotencyKey: `catalog:${service._id}:${service.updatedAt || Date.now()}`,
    });
    if (result.status >= 400) {
        throw new Error(result.json?.error?.message || `Gagal sync layanan ke Work (${result.status})`);
    }
    const { Service } = await getTenantModels(tenantSlug);
    await Service.findByIdAndUpdate(service._id, {
        $set: { workServiceId: result.json.work_service_id, skillName },
    });
    return result.json;
}

function invoiceItemsFromAppointment(appointment: any) {
    const aptId = String(appointment._id);
    return (appointment.services || []).map((s: any, i: number) => {
        const serviceId = s.service?._id || s.service;
        return {
            item: serviceId,
            itemModel: 'Service',
            name: s.name,
            description: String(s.description || s.service?.description || '').trim() || undefined,
            price: s.price || 0,
            quantity: 1,
            discount: 0,
            total: s.price || 0,
            fukomoLineId: s.fukomoLineId || lineIdFor(aptId, String(serviceId), i),
        };
    }).filter((row: any) => row.item);
}

export async function ensureDraftInvoice(tenantSlug: string, appointment: any, woResult: any) {
    const { Invoice, Settings } = await getTenantModels(tenantSlug);
    const existing = await Invoice.findOne({
        appointment: appointment._id,
        status: { $in: ['draft', 'pending'] },
    });
    const woId = woResult?.wo_id || appointment.workOrderId;
    const woNumber = woResult?.wo_number || appointment.workOrderNumber;
    if (existing) {
        const patch: Record<string, unknown> = {};
        if (woId && !existing.workOrderId) patch.workOrderId = woId;
        if (woNumber && !existing.workOrderNumber) patch.workOrderNumber = woNumber;
        if (Object.keys(patch).length) {
            await Invoice.findByIdAndUpdate(existing._id, { $set: patch });
        }
        return existing;
    }
    const settings = await Settings.findOne();
    const taxRate = settings?.taxRate || 0;
    const items = invoiceItemsFromAppointment(appointment);
    const subtotal = items.reduce((acc: number, s: any) => acc + (s.total || 0), 0);
    const tax = subtotal * (taxRate / 100);
    const discount = appointment.discount || 0;
    const { generateInvoiceNumber } = await import('@/lib/invoiceNumber');
    const invoiceNumber = await generateInvoiceNumber(tenantSlug);
    return Invoice.create({
        invoiceNumber,
        customer: appointment.customer?._id || appointment.customer,
        appointment: appointment._id,
        amountPaid: 0,
        sourceType: 'normal_sale',
        staffAssignments: [],
        items,
        subtotal,
        tax,
        discount,
        totalAmount: subtotal + tax - discount,
        workOrderId: woId,
        workOrderNumber: woNumber,
        status: 'draft',
        notes: 'Draft nota dari appointment — bisa dibayar sebelum pekerjaan selesai.',
        date: appointment.date || new Date(),
    });
}

function escapeRe(s: string) {
    return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isMongoId(value: unknown): boolean {
    return /^[a-f0-9]{24}$/i.test(String(value || ''));
}

function nameCandidates(name: string): string[] {
    const raw = String(name || '').trim().replace(/\s+/g, ' ');
    if (!raw) return [];
    const stripped = raw.replace(/\s*[\(\[]\s*\d+\s*[\)\]]\s*$/g, '').trim();
    const noDashNum = raw.replace(/\s*[-–]\s*\d+\s*$/g, '').trim();
    return [...new Set([raw, stripped, noDashNum].filter(Boolean))];
}

async function resolveFukomoService(Service: any, line: any) {
    const name = String(line.name || '').trim();
    if (isMongoId(line.fukomo_service_id)) {
        const byId = await Service.findById(line.fukomo_service_id).catch(() => null);
        if (byId) return byId;
    }
    if (line.work_service_id) {
        const byWork = await Service.findOne({ workServiceId: String(line.work_service_id) });
        if (byWork) return byWork;
    }
    for (const candidate of nameCandidates(name)) {
        const exact = await Service.findOne({
            name: new RegExp(`^${escapeRe(candidate)}$`, 'i'),
            status: { $ne: 'inactive' },
        });
        if (exact) return exact;
    }
    return null;
}

async function resolveFukomoStaff(Staff: any, name?: string) {
    const n = String(name || '').trim().replace(/\s+/g, ' ');
    if (!n) return null;
    const exact = new RegExp(`^${escapeRe(n)}$`, 'i');
    return (
        await Staff.findOne({ name: exact, isActive: { $ne: false } })
        || await Staff.findOne({ name: exact })
    );
}

async function mapPerformersToAssignments(Staff: any, performers: any[] = []) {
    const active = performers.filter((p) =>
        ['accepted', 'working', 'completed'].includes(String(p?.status || 'accepted'))
    );
    const resolved: { staff: any; name: string }[] = [];
    for (const p of active) {
        const st = await resolveFukomoStaff(Staff, p.staff_name);
        if (st) resolved.push({ staff: st, name: st.name });
    }
    const names = (resolved.length ? resolved.map((r) => r.name) : active.map((p) => p.staff_name).filter(Boolean)).join(', ');
    if (!resolved.length) return { assignments: [] as any[], names };
    const raw = 100 / resolved.length;
    const pct = Math.round(raw * 100) / 100;
    const assignments = resolved.map((r, i) => {
        const share = i === resolved.length - 1 ? Math.round((100 - pct * (resolved.length - 1)) * 100) / 100 : pct;
        return {
            staff: r.staff._id,
            staffId: r.staff._id,
            percentage: share,
            porsiPersen: share,
            commission: 0,
            komisiNominal: 0,
            tip: 0,
        };
    });
    return { assignments, names };
}

function billableItems(items: any[] = []) {
    return items.filter((it: any) => !it.removedFromWork);
}

function recalcInvoice(invoice: any, taxRate: number) {
    invoice.subtotal = billableItems(invoice.items).reduce((acc: number, it: any) => acc + (it.total || 0), 0);
    invoice.tax = invoice.subtotal * ((taxRate || 0) / 100);
    invoice.totalAmount = invoice.subtotal + invoice.tax - (invoice.discount || 0);
}

function pushWorkHistory(item: any, event: string, staffName: string, note: string) {
    item.workHistory = item.workHistory || [];
    const last = item.workHistory[item.workHistory.length - 1];
    if (last && last.event === event && last.note === note && last.staffName === staffName) return;
    item.workHistory.push({ at: new Date(), event, staffName, note });
}

export async function applyLineToDraftInvoice(tenantSlug: string, aptId: string, payload: any) {
    const { Appointment, Invoice, Service, Staff, Settings } = await getTenantModels(tenantSlug);
    const appointment = await Appointment.findById(aptId);
    if (!appointment) return { ok: false, statusCode: 404, error: 'Appointment tidak ditemukan.' };
    const line = payload.line || {};
    const lineId = String(line.line_id || '');
    const name = String(line.name || '').trim();
    const isAddon = Boolean(line.is_addon);
    const service = await resolveFukomoService(Service, line);
    if (!service) {
        return { ok: false, statusCode: 422, error: `Layanan belum ada di Fukomo: ${name}` };
    }

    if (isAddon && lineId) {
        const already = (appointment.services || []).some((s: any) => s.fukomoLineId === lineId);
        if (!already) {
            appointment.services.push({
                service: service._id,
                name: service.name,
                price: service.price || 0,
                duration: service.duration || 0,
                fukomoLineId: lineId,
            });
            const subtotal = appointment.services.reduce((acc: number, s: any) => acc + (s.price || 0), 0);
            appointment.subtotal = subtotal;
            appointment.totalDuration = appointment.services.reduce((acc: number, s: any) => acc + (s.duration || 0), 0);
            appointment.totalAmount = subtotal + (appointment.tax || 0) - (appointment.discount || 0);
            await appointment.save();
        }
    }

    let invoice = await Invoice.findOne({ appointment: aptId, status: { $in: ['draft', 'pending'] } });
    if (!invoice) {
        invoice = await ensureDraftInvoice(tenantSlug, appointment, {
            wo_id: payload.wo_id,
            wo_number: payload.wo_number,
        });
    }
    if (!invoice) return { ok: false, statusCode: 500, error: 'Draft nota tidak bisa dibuat.' };

    const { assignments, names: performerNames } = await mapPerformersToAssignments(Staff, payload.performers || []);
    const referrer = payload.referrer || {};
    const sellingStaff = await resolveFukomoStaff(Staff, referrer.staff_name);
    const sellingByName = sellingStaff?.name || referrer.staff_name || '';

    let item = (invoice.items || []).find((it: any) => lineId && it.fukomoLineId === lineId);
    if (!item && !isAddon) {
        item = (invoice.items || []).find((it: any) =>
            String(it.item) === String(service._id) && !String(it.fukomoLineId || '').startsWith('addon:')
        );
    }
    const addedNow = !item;
    if (!item) {
        invoice.items.push({
            item: service._id,
            itemModel: 'Service',
            name: service.name,
            price: service.price || 0,
            quantity: Number(line.quantity || 1) || 1,
            discount: 0,
            total: service.price || 0,
            fukomoLineId: lineId || undefined,
            addedAt: new Date(),
            lockedFromWork: true,
            removedFromWork: false,
            workHistory: [],
        });
        item = invoice.items[invoice.items.length - 1];
        pushWorkHistory(item, 'added', performerNames || sellingByName, isAddon
            ? 'Add-on dari WO — staf sudah menerima'
            : 'Layanan dari WO');
    } else {
        const prevName = item.name;
        const prevId = String(item.item || '');
        if (prevId && prevId !== String(service._id)) {
            item.item = service._id;
            item.name = service.name;
            item.price = service.price || 0;
            const qty = Number(line.quantity || item.quantity || 1) || 1;
            item.quantity = qty;
            item.total = (item.price || 0) * qty - (item.discount || 0);
            item.removedFromWork = false;
            pushWorkHistory(item, 'replaced', performerNames || sellingByName, `${prevName} → ${service.name}`);
            const aptLine = (appointment.services || []).find((s: any) =>
                (lineId && s.fukomoLineId === lineId)
            ) || (appointment.services || []).find((s: any) =>
                String(s.service?._id || s.service || '') === prevId || s.name === prevName
            );
            if (aptLine) {
                aptLine.service = service._id;
                aptLine.name = service.name;
                aptLine.price = service.price || 0;
                if (lineId) aptLine.fukomoLineId = lineId;
                if (service.duration != null) aptLine.duration = service.duration;
                appointment.markModified?.('services');
                await appointment.save();
            }
        } else if (line.quantity != null && Number(line.quantity) !== Number(item.quantity || 1)) {
            const qty = Number(line.quantity) || 1;
            item.quantity = qty;
            item.total = (item.price || 0) * qty - (item.discount || 0);
            item.removedFromWork = false;
            pushWorkHistory(item, 'quantity', performerNames || sellingByName, `Qty ${qty}`);
        } else if (item.removedFromWork) {
            item.removedFromWork = false;
            item.quantity = Number(line.quantity || item.quantity || 1) || 1;
            item.total = (item.price || 0) * item.quantity - (item.discount || 0);
            pushWorkHistory(item, 'restored', performerNames || sellingByName, 'Layanan dikembalikan ke nota');
        }
    }
    if (lineId) item.fukomoLineId = lineId;
    item.lockedFromWork = true;
    if (!item.addedAt) item.addedAt = new Date();
    if (performerNames) item.performerNames = performerNames;
    if (assignments.length) {
        item.staffAssignments = assignments;
        item.splitCommissionMode = 'auto';
        pushWorkHistory(item, 'staff', performerNames, `Dikerjakan: ${performerNames}`);
    } else if (performerNames) {
        pushWorkHistory(item, 'staff', performerNames, `Dikerjakan: ${performerNames}`);
    }
    if (sellingStaff) {
        item.sellingBy = sellingStaff._id;
        item.sellingByName = sellingByName;
        pushWorkHistory(item, 'referrer', sellingByName, `Direferensikan: ${sellingByName}`);
    } else if (sellingByName) {
        item.sellingByName = sellingByName;
        pushWorkHistory(item, 'referrer', sellingByName, `Direferensikan: ${sellingByName}`);
    }
    const settings = await Settings.findOne();
    recalcInvoice(invoice, settings?.taxRate || 0);
    invoice.workOrderId = payload.wo_id || invoice.workOrderId;
    invoice.workOrderNumber = payload.wo_number || invoice.workOrderNumber;
    invoice.markModified?.('items');
    await invoice.save();
    return { ok: true, statusCode: 200, addedNow };
}

export async function removeLineFromDraftInvoice(tenantSlug: string, aptId: string, payload: any) {
    const { Invoice, Settings } = await getTenantModels(tenantSlug);
    const line = payload.line || {};
    const lineId = String(line.line_id || '');
    if (!lineId) return { ok: false, statusCode: 422, error: 'line_id wajib.' };
    const invoice = await Invoice.findOne({ appointment: aptId, status: { $in: ['draft', 'pending'] } });
    if (!invoice) return { ok: true, statusCode: 200, skipped: true };
    const item = (invoice.items || []).find((it: any) => it.fukomoLineId === lineId);
    if (!item) return { ok: true, statusCode: 200, skipped: true };
    item.removedFromWork = true;
    item.quantity = 0;
    item.total = 0;
    pushWorkHistory(item, 'removed', '', `Dihapus dari WO${payload.note ? ` — ${payload.note}` : ''}`);
    const settings = await Settings.findOne();
    recalcInvoice(invoice, settings?.taxRate || 0);
    invoice.markModified?.('items');
    await invoice.save();
    return { ok: true, statusCode: 200 };
}

async function syncDraftFromWoJobs(tenantSlug: string, aptId: string, payload: any) {
    const jobs = payload?.jobs || [];
    const active = jobs.filter((job: any) => !['cancelled'].includes(String(job.status || '')));
    const activeLineIds = new Set(
        active.map((j: any) => String(j.line_id || '')).filter(Boolean)
    );
    for (const job of active) {
        const status = String(job.status || '');
        if (!['waiting', 'offered', 'accepted', 'working', 'completed', 'needs_supervisor'].includes(status)) continue;
        await applyLineToDraftInvoice(tenantSlug, aptId, {
            wo_id: payload.wo_id,
            wo_number: payload.wo_number,
            line: {
                line_id: job.line_id,
                fukomo_service_id: job.fukomo_service_id,
                work_service_id: job.service_id,
                name: job.service_name,
                is_addon: Boolean(job.is_addon),
                job_status: status,
            },
            performers: job.performers || [],
            referrer: job.referrer,
        });
    }
    const { Invoice, Settings } = await getTenantModels(tenantSlug);
    const invoice = await Invoice.findOne({ appointment: aptId, status: { $in: ['draft', 'pending'] } });
    if (!invoice) return;
    let changed = false;
    for (const it of invoice.items || []) {
        const lid = String(it.fukomoLineId || '');
        if (!lid || !it.lockedFromWork) continue;
        if (!activeLineIds.has(lid) && !it.removedFromWork) {
            it.removedFromWork = true;
            it.quantity = 0;
            it.total = 0;
            pushWorkHistory(it, 'removed', '', 'Tidak lagi ada di WO');
            changed = true;
        }
    }
    if (changed) {
        const settings = await Settings.findOne();
        recalcInvoice(invoice, settings?.taxRate || 0);
        invoice.markModified?.('items');
        await invoice.save();
    }
}

export async function applyAddonWorking(tenantSlug: string, payload: any) {
    const { Visit, IntegrationIdempotency } = await getTenantModels(tenantSlug);
    const aptId = payload.appointment_id;
    const event = String(payload.event || 'job_accepted');
    const result = event === 'line_removed' || event === 'job_cancelled'
        ? await removeLineFromDraftInvoice(tenantSlug, aptId, payload)
        : await applyLineToDraftInvoice(tenantSlug, aptId, payload);
    if (!result.ok) {
        const body = { error: { code: result.statusCode === 404 ? 'not_found' : 'unmapped_service', message: result.error } };
        return { replayed: false, statusCode: result.statusCode, body };
    }
    await Visit.findOneAndUpdate(
        { appointment: aptId },
        { $set: { lastSyncAt: new Date(), lastEvent: payload.event || 'job_accepted' } }
    );
    const body = { ok: true, appointment_id: aptId, event: payload.event || 'job_accepted' };
    const idem = payload.idempotency_key;
    if (idem) {
        await IntegrationIdempotency.create({
            key: idem,
            statusCode: 200,
            body,
            expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
        }).catch(() => null);
    }
    return { replayed: false, statusCode: 200, body };
}

function jakartaYmd(d: Date): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(d);
}

export async function markOverdueAppointmentsNoShow() {
    const { getMasterModels } = await import('@/lib/masterDb');
    let slugs = ['pusat'];
    try {
        const master = await getMasterModels();
        const stores = await master.Store.find({ isActive: true }).select('slug').lean();
        slugs = stores.map((s: any) => s.slug).filter(Boolean);
        if (!slugs.length) slugs = ['pusat'];
    } catch {
        slugs = ['pusat'];
    }
    const today = jakartaYmd(new Date());
    let marked = 0;
    for (const slug of slugs) {
        const { Appointment } = await getTenantModels(slug);
        const open = await Appointment.find({
            status: { $in: ['pending', 'confirmed', 'processing'] },
        });
        for (const apt of open) {
            const aptDay = jakartaYmd(new Date(apt.date));
            if (aptDay >= today) continue;
            const prev = apt.status;
            apt.status = 'no-show';
            apt.statusHistory = apt.statusHistory || [];
            apt.statusHistory.push({
                status: 'no-show',
                fromStatus: prev,
                at: new Date(),
                by: 'system',
                note: 'Otomatis no-show: melewati hari appointment',
            });
            await apt.save();
            try {
                await afterAppointmentSaved(slug, apt, prev);
            } catch (e) {
                console.error('[no-show] work cancel failed', slug, apt._id, e);
            }
            marked += 1;
        }
    }
    return marked;
}

export async function applyApprovedCorrectionToWork(tenantSlug: string, payload: {
    appointment_id: string;
    wo_id?: string;
    action: string;
    fukomo_line_id?: string;
    job_id?: string;
    fukomo_service_id?: string;
    work_service_id?: string;
    name?: string;
    reason: string;
    requested_by?: { id?: string; name?: string };
    approved_by?: { id?: string; name?: string };
    correction_id?: string;
}) {
    if (!isWorkIntegrationEnabled()) {
        return {
            status: 503,
            json: { error: { code: 'not_configured', message: 'Work integration belum dikonfigurasi.' } },
        };
    }
    return workFetch('/api/integrations/fukomo/corrections', {
        method: 'POST',
        tenantSlug,
        idempotencyKey: `correction:${payload.correction_id || payload.appointment_id}:${payload.action}`,
        body: JSON.stringify(payload),
    });
}
