import { getTenantModels } from "@/lib/tenantDb";
import { NextRequest, NextResponse } from "next/server";


export async function GET(request: Request, props: any) {
    const tenantSlug = request.headers.get('x-store-slug') || 'pusat';
    const { Payroll, Staff, Appointment, Invoice } = await getTenantModels(tenantSlug);

    try {
        
        const { id } = await props.params;
        const payroll = await Payroll.findById(id).populate("staff", "name email phone");

        if (!payroll) {
            return NextResponse.json({ success: false, error: "Payroll not found" }, { status: 404 });
        }

        return NextResponse.json({ success: true, data: payroll });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}


import { startOfMonth, endOfMonth } from "date-fns";
import { checkPermission } from "@/lib/rbac";

export async function PUT(request: NextRequest, props: any) {
    const tenantSlug = request.headers.get('x-store-slug') || 'pusat';
    const { Payroll, Staff, Appointment, Invoice } = await getTenantModels(tenantSlug);

    try {
    const permissionErrorPUT = await checkPermission(request, 'payroll', 'edit');
    if (permissionErrorPUT) return permissionErrorPUT;
        
        const { id } = await props.params;
        const body = await request.json();

        let payroll = await Payroll.findById(id).populate("staff");

        if (!payroll) {
            return NextResponse.json({ success: false, error: "Payroll not found" }, { status: 404 });
        }

        // Allow strict updates for paid ones, but if it's draft or approved, recalculate from fresh data
        if (payroll.status !== "paid" && body.status !== "paid" && !body.skipRecalculation) {
            const staffId = payroll.staff._id;
            const staff = payroll.staff;
            const month = payroll.month;
            const year = payroll.year;

            const startDate = startOfMonth(new Date(year, month - 1));
            const endDate = endOfMonth(new Date(year, month - 1));

            const appointments = await Appointment.find({
                staff: staffId,
                date: { $gte: startDate, $lte: endDate },
                status: { $in: ["completed", "confirmed"] },
            }).populate("services.service");

            const breakdown = {
                appointments: appointments.map((apt: any) => {
                    let aptTotalCommission = apt.commission;
                    const servicesBreakdown = apt.services.map((svc: any) => {
                        const commValue = Number(svc.service?.commissionValue || 0);
                        let commissionAmount = 0;

                        if (!aptTotalCommission) {
                            commissionAmount = commValue;
                        } else {
                            const aptSubtotal = apt.services.reduce((sum: number, s: any) => sum + s.price, 0);
                            commissionAmount = aptSubtotal > 0 ? (aptTotalCommission * (svc.price / aptSubtotal)) : 0;
                        }

                        return {
                            serviceName: svc.name,
                            serviceAmount: svc.price,
                            commissionRate: 0,
                            commissionAmount,
                        };
                    });

                    if (!aptTotalCommission) {
                        aptTotalCommission = servicesBreakdown.reduce((sum: number, s: any) => sum + s.commissionAmount, 0);
                    }

                    return {
                        appointmentId: apt._id,
                        date: apt.date,
                        services: servicesBreakdown,
                        totalCommission: aptTotalCommission,
                        tips: apt.tips || 0,
                    };
                }),
                invoices: (await Invoice.find({
                    $or: [
                        { staff: staffId },
                        { "staffAssignments.staff": staffId }
                    ],
                    date: { $gte: startDate, $lte: endDate },
                    status: { $in: ["paid", "partially_paid"] }
                })).map((inv: any) => {
                    let specificCommission = 0;
                    let specificTip = 0;
                    if (inv.staffAssignments && inv.staffAssignments.length > 0) {
                        const assignment = inv.staffAssignments.find((a: any) => a.staff.toString() === staffId.toString());
                        if (assignment) {
                            specificCommission = assignment.commission;
                            specificTip = assignment.tip || 0;
                        } else if (inv.staff?.toString() === staffId.toString()) {
                            specificCommission = inv.commission || 0;
                            specificTip = inv.tips || 0;
                        }
                    } else if (inv.staff?.toString() === staffId.toString()) {
                        specificCommission = inv.commission || 0;
                        specificTip = inv.tips || 0;
                    }

                    return {
                        invoiceId: inv._id,
                        invoiceNumber: inv.invoiceNumber,
                        date: inv.date,
                        totalAmount: inv.totalAmount,
                        commission: specificCommission,
                        tip: specificTip
                    };
                })
            };

            const appointmentCommission = breakdown.appointments.reduce((sum: number, apt: any) => sum + apt.totalCommission, 0);
            const invoiceCommission = breakdown.invoices.reduce((sum: number, inv: any) => sum + inv.commission, 0);
            const totalCommission = appointmentCommission + invoiceCommission;

            const appointmentTips = breakdown.appointments.reduce((sum: number, apt: any) => sum + apt.tips, 0);
            const invoiceTips = breakdown.invoices.reduce((sum: number, inv: any) => sum + (inv.tip || 0), 0);
            const totalTips = appointmentTips + invoiceTips;

            payroll.baseSalary = staff.salary || 0;
            payroll.totalCommission = totalCommission;
            payroll.totalTips = totalTips;
            payroll.breakdown = breakdown;

            if (body.bonuses !== undefined) payroll.bonuses = body.bonuses;
            if (body.deductions !== undefined) payroll.deductions = body.deductions;
            if (body.notes !== undefined) payroll.notes = body.notes;
            if (body.status !== undefined) payroll.status = body.status;
            
            payroll.totalAmount = payroll.baseSalary + payroll.totalCommission + payroll.totalTips + payroll.bonuses - payroll.deductions;
            await payroll.save();
        } else {
            // Apply straight updates for simple status changes or when payroll is already paid
            Object.assign(payroll, body);
            await payroll.save();
        }

        const updatedPayroll = await Payroll.findById(id).populate("staff", "name email phone");
        return NextResponse.json({ success: true, data: updatedPayroll });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest, props: any) {
    const tenantSlug = request.headers.get('x-store-slug') || 'pusat';
    const { Payroll, Staff, Appointment, Invoice } = await getTenantModels(tenantSlug);

    try {
    const permissionErrorDELETE = await checkPermission(request, 'payroll', 'delete');
    if (permissionErrorDELETE) return permissionErrorDELETE;
        
        const { id } = await props.params;

        const payroll = await Payroll.findById(id);
        if (!payroll) {
            return NextResponse.json({ success: false, error: "Payroll not found" }, { status: 404 });
        }

        await Payroll.findByIdAndDelete(id);
        return NextResponse.json({ success: true, message: "Payroll deleted" });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
