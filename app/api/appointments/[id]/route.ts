import { getTenantModels } from "@/lib/tenantDb";
// appointments/[id]/route.ts

import { NextRequest, NextResponse } from "next/server";

import { checkPermission } from "@/lib/rbac";
import { handleApiError } from "@/lib/errorHandler";
import { scheduleFollowUp } from "@/lib/waFollowUp";
import { generateInvoiceNumber } from "@/lib/invoiceNumber";
import { shouldSkipAutoInvoice, afterAppointmentSaved, ensureDraftInvoice } from "@/lib/workIntegration";

export async function GET(request: NextRequest, props: any) {
    const tenantSlug = request.headers.get('x-store-slug') || 'pusat';
    const { Appointment, Invoice, Deposit, Settings, Staff, Service } = await getTenantModels(tenantSlug);

    try {
        const permissionError = await checkPermission(request, 'appointments', 'view');
        if (permissionError) return permissionError;

        const { id } = await props.params;

        const appointment = await Appointment.findById(id)
            .populate('customer')
            .populate('staff');

        if (!appointment) {
            return NextResponse.json({ success: false, error: "Appointment not found" }, { status: 404 });
        }

        if (appointment.status === 'processing') {
            try {
                await ensureDraftInvoice(tenantSlug, appointment, {
                    wo_id: appointment.workOrderId,
                    wo_number: appointment.workOrderNumber,
                });
            } catch (e) {
                console.error('[appointments] ensure draft failed', id, e);
            }
        }

        return NextResponse.json({ success: true, data: appointment });
    } catch (error: any) {
        return handleApiError('GET_APPOINTMENT', error);
    }
}

export async function PUT(request: NextRequest, props: any) {
    const tenantSlug = request.headers.get('x-store-slug') || 'pusat';
    const { Appointment, Invoice, Deposit, Settings, Staff, Service } = await getTenantModels(tenantSlug);

    try {
        const permissionError = await checkPermission(request, 'appointments', 'edit');
        if (permissionError) return permissionError;

        const { id } = await props.params;
        const body = await request.json();

        const settings = await Settings.findOne();
        const taxRate = settings?.taxRate || 0;

        const existingAppointment = await Appointment.findById(id);
        if (!existingAppointment) {
            return NextResponse.json({ success: false, error: "Appointment not found" }, { status: 404 });
        }

        const { _id, __v, createdAt, updatedAt, ...cleanBody } = body;

        if (cleanBody.status && typeof cleanBody.status === 'object' && cleanBody.status.target) {
            cleanBody.status = cleanBody.status.target.value;
        }

        if (Array.isArray(cleanBody.services) && cleanBody.services.length) {
            const svcIds = cleanBody.services.map((s: any) => s.service?._id || s.service).filter(Boolean);
            if (svcIds.length) {
                const docs = await Service.find({ _id: { $in: svcIds } }).select("description").lean();
                const byId = new Map(docs.map((d: any) => [String(d._id), String(d.description || "").trim()]));
                cleanBody.services = cleanBody.services.map((s: any) => {
                    const d = String(s.description || byId.get(String(s.service?._id || s.service)) || "").trim();
                    return d ? { ...s, description: d } : s;
                });
            }
        }

        const services = cleanBody.services || existingAppointment.services;
        const staffId = cleanBody.staff || existingAppointment.staff;
        const discount = cleanBody.discount !== undefined
            ? cleanBody.discount
            : (existingAppointment.discount || 0);

        const subtotal = services.reduce((acc: number, s: any) => acc + (s.price || 0), 0);
        const tax = subtotal * (taxRate / 100);
        const totalAmount = (subtotal + tax) - discount;

        let totalCommission = 0;
        const catalogDescriptions = new Map<string, string>();
        for (const item of services) {
            const serviceId = item.service?._id || item.service;
            const service = await Service.findById(serviceId);
            const commValue = Number(service?.commissionValue || 0);
            totalCommission += commValue;
            const desc = String(service?.description || "").trim();
            if (serviceId && desc) catalogDescriptions.set(String(serviceId), desc);
        }

        const prevStatus = existingAppointment.status;
        const nextStatus = cleanBody.status || prevStatus;

        if (nextStatus === 'cancelled' && !String(cleanBody.cancelReason || cleanBody.notes || '').trim()) {
            return NextResponse.json({ success: false, error: "Alasan pembatalan wajib diisi." }, { status: 400 });
        }

        if (['processing', 'completed'].includes(prevStatus) && cleanBody.services) {
            const oldKey = (existingAppointment.services || []).map((s: any) => String(s.service)).sort().join(',');
            const newKey = (cleanBody.services || []).map((s: any) => String(s.service?._id || s.service)).sort().join(',');
            if (oldKey !== newKey) {
                return NextResponse.json({
                    success: false,
                    error: "Add-on layanan hanya bisa ditambah dari Work Order di Work, bukan dari appointment Fukomo.",
                }, { status: 400 });
            }
        }

        if (!cleanBody.staff || String(cleanBody.staff).trim() === '') delete cleanBody.staff;

        const historyNote = nextStatus === 'cancelled'
            ? String(cleanBody.cancelReason || '').trim()
            : String(cleanBody.statusNote || '').trim();

        const appointment = await Appointment.findByIdAndUpdate(id, {
            ...cleanBody,
            subtotal,
            tax,
            totalAmount,
            commission: totalCommission,
            ...(nextStatus === 'cancelled' ? { cancelReason: String(cleanBody.cancelReason || '').trim() } : {}),
        }, { new: true });

        if (appointment && cleanBody.status && cleanBody.status !== prevStatus) {
            await Appointment.findByIdAndUpdate(id, {
                $push: {
                    statusHistory: {
                        status: cleanBody.status,
                        fromStatus: prevStatus,
                        at: new Date(),
                        by: 'user',
                        note: historyNote,
                    },
                },
            });
        }

        if (appointment && (appointment.status === 'confirmed' || appointment.status === 'completed')
            && !shouldSkipAutoInvoice(appointment.status)) {

            const existingInvoice = await Invoice.findOne({ appointment: id });

            if (!existingInvoice) {
                // Atomic invoice number via MongoDB counter
                const invoiceNumber = await generateInvoiceNumber(tenantSlug);

                const createdInvoice = await Invoice.create({
                    invoiceNumber,
                    customer: appointment.customer,
                    appointment: appointment._id,
                    items: appointment.services.map((s: any) => {
                        const sid = String(s.service?._id || s.service || "");
                        return {
                        item: s.service,
                        itemModel: 'Service',
                        name: s.name,
                        description: String(s.description || catalogDescriptions.get(sid) || '').trim() || undefined,
                        price: s.price,
                        quantity: 1,
                        total: s.price
                    };
                    }),
                    subtotal: appointment.subtotal,
                    tax: appointment.tax,
                    discount: appointment.discount || 0,
                    totalAmount: appointment.totalAmount,
                    commission: totalCommission,
                    staff: appointment.staff,
                    staffAssignments: appointment.staff
                        ? [{
                            staff: appointment.staff,
                            percentage: 100,
                            porsiPersen: 100,
                            commission: totalCommission,
                            tip: 0
                        }]
                        : [],
                    status: appointment.status === 'completed'
                        ? 'paid'
                        : 'pending',
                    date: appointment.date
                });

                // ✅ FIX HERE
                await scheduleFollowUp(createdInvoice._id, tenantSlug);

            } else if (
                appointment.status === 'completed' &&
                existingInvoice.status !== 'paid'
            ) {
                await Invoice.findByIdAndUpdate(existingInvoice._id, {
                    items: appointment.services.map((s: any) => {
                        const sid = String(s.service?._id || s.service || "");
                        return {
                        item: s.service,
                        itemModel: 'Service',
                        name: s.name,
                        description: String(s.description || catalogDescriptions.get(sid) || '').trim() || undefined,
                        price: s.price || 0,
                        quantity: 1,
                        total: s.price || 0
                    };
                    }),
                    subtotal: appointment.subtotal,
                    tax: appointment.tax,
                    discount: appointment.discount || 0,
                    totalAmount: appointment.totalAmount,
                    commission: totalCommission,
                    staffAssignments: appointment.staff
                        ? [{
                            staff: appointment.staff,
                            percentage: 100,
                            porsiPersen: 100,
                            commission: totalCommission,
                            tip: 0
                        }]
                        : [],
                    status: 'paid',
                    date: appointment.date
                });
            }
        }

        // [BUG FIX Fitur 4] Sync invoice date when appointment date changes
        if (body.date) {
          const newDate = new Date(body.date);
          await Invoice.updateMany(
            { appointment: appointment._id, status: { $nin: ['cancelled', 'voided'] } },
            { $set: { date: newDate } }
          );
        }

        try {
            await afterAppointmentSaved(tenantSlug, appointment, prevStatus);
        } catch (syncErr: any) {
            return NextResponse.json(
                { success: false, error: syncErr?.message || 'Gagal sinkron ke Work. Coba lagi.' },
                { status: 502 }
            );
        }

        return NextResponse.json({ success: true, data: appointment });

    } catch (error: any) {
        return handleApiError('UPDATE_APPOINTMENT', error);
    }
}

export async function DELETE(request: NextRequest, props: any) {
    const tenantSlug = request.headers.get('x-store-slug') || 'pusat';
    const { Appointment, Invoice, Deposit, Customer, WalletTransaction, Settings, Staff, Service } = await getTenantModels(tenantSlug);

    try {
        const permissionError = await checkPermission(request, 'appointments', 'delete');
        if (permissionError) return permissionError;

        const { id } = await props.params;

        const linkedInvoices = await Invoice.find({ appointment: id });

        const hasPaidInvoices = linkedInvoices.some(
            (inv: any) => inv.status === 'paid' || inv.status === 'partially_paid'
        );

        if (hasPaidInvoices) {
            return NextResponse.json(
                {
                    success: false,
                    error: "Jadwal tidak dapat dihapus karena sudah memiliki nota pembayaran lunas. Harap Void nota terlebih dahulu."
                },
                { status: 400 }
            );
        }

        const invoiceIds = linkedInvoices.map((inv: any) => inv._id);

        if (invoiceIds.length > 0) {
            // [B05 FIX] Refund wallet deposits sebelum dihapus
            const walletDeposits = await Deposit.find({
                invoice: { $in: invoiceIds },
                paymentMethod: { $regex: /^wallet$/i },
                amount: { $gt: 0 }
            });

            for (const dep of walletDeposits) {
                if (!dep.customer) continue;

                // Tambah saldo balik ke customer, dan ambil nilai terbaru untuk balanceAfter
                const updatedCustomer = await Customer.findByIdAndUpdate(
                    dep.customer,
                    { $inc: { walletBalance: dep.amount } },
                    { new: true }
                );

                if (updatedCustomer) {
                    await WalletTransaction.create({
                        customer: dep.customer,
                        type: 'refund',
                        amount: dep.amount,
                        balanceAfter: updatedCustomer.walletBalance,
                        description: `Refund dari appointment yang dihapus`,
                        invoice: dep.invoice,
                    });
                }
            }

            await Deposit.deleteMany({ invoice: { $in: invoiceIds } });

            await Invoice.updateMany(
                { _id: { $in: invoiceIds } },
                {
                    $set: {
                        status: 'voided',
                        voidReason: 'Appointment dihapus',
                        voidedAt: new Date()
                    }
                }
            );
        }

        await Appointment.findByIdAndDelete(id);

        return NextResponse.json({ success: true });

    } catch (error: any) {
        return handleApiError('DELETE_APPOINTMENT', error);
    }
}