import { getTenantModels } from "@/lib/tenantDb";
import { NextRequest, NextResponse } from "next/server";

import { startOfMonth, endOfMonth } from "date-fns";
import { checkPermission } from "@/lib/rbac";

// GET /api/payroll - List all payroll records
export async function GET(request: NextRequest, props: any) {
    const tenantSlug = request.headers.get('x-store-slug') || 'pusat';
    const { Payroll, Staff, Appointment, Service, Invoice } = await getTenantModels(tenantSlug);

    try {
    const permissionErrorGET = await checkPermission(request, 'payroll', 'view');
    if (permissionErrorGET) return permissionErrorGET;
        

        const { searchParams } = new URL(request.url);
        const month = searchParams.get("month");
        const year = searchParams.get("year");
        const staffId = searchParams.get("staff");
        const page = parseInt(searchParams.get("page") || "1");
        const limit = parseInt(searchParams.get("limit") || "10");
        const search = searchParams.get("search") || "";

        const query: any = {};
        if (month) query.month = parseInt(month);
        if (year) query.year = parseInt(year);
        if (staffId) query.staff = staffId;

        // If search is provided, we need to find staff matching the name first
        if (search) {
            const staffMembers = await Staff.find({
                name: { $regex: search, $options: "i" }
            }).select("_id");

            const staffIds = staffMembers.map(s => s._id);

            // If checking specifically for a staffId from params, intersect, otherwise just use search results
            if (query.staff) {
                // If search and staff filter conflict, result is likely empty unless it's the same staff
                // But typically search overrides or refines. Let's just add to the query.
                // If query.staff is already set, we check if it is in the found IDs.
                if (!staffIds.some(id => id.toString() === query.staff)) {
                    // No match
                    return NextResponse.json({
                        success: true,
                        data: [],
                        pagination: {
                            page,
                            limit,
                            total: 0,
                            pages: 0
                        }
                    });
                }
            } else {
                query.staff = { $in: staffIds };
            }
        }

        const skip = (page - 1) * limit;

        const [payrolls, total] = await Promise.all([
            Payroll.find(query)
                .populate("staff", "name email phone")
                .sort({ year: -1, month: -1 })
                .skip(skip)
                .limit(limit),
            Payroll.countDocuments(query)
        ]);

        return NextResponse.json({
            success: true,
            data: payrolls,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

// POST /api/payroll - Generate payroll for a staff member
export async function POST(request: NextRequest, props: any) {
    const tenantSlug = request.headers.get('x-store-slug') || 'pusat';
    const { Payroll, Staff, Appointment, Service, Invoice } = await getTenantModels(tenantSlug);

    try {
    const permissionErrorPOST = await checkPermission(request, 'payroll', 'create');
    if (permissionErrorPOST) return permissionErrorPOST;
        
        const body = await request.json();
        const { staffId, month, year } = body;

        if (!staffId || !month || !year) {
            return NextResponse.json(
                { success: false, error: "staffId, month, and year are required" },
                { status: 400 }
            );
        }

        // Check if payroll already exists
        const existing = await Payroll.findOne({ staff: staffId, month, year });
        if (existing) {
            return NextResponse.json(
                { success: false, error: "Payroll for this period already exists" },
                { status: 400 }
            );
        }

        // Get staff details
        const staff = await Staff.findById(staffId);
        if (!staff) {
            return NextResponse.json({ success: false, error: "Staff not found" }, { status: 404 });
        }

        // Get date range for the month
        const startDate = startOfMonth(new Date(year, month - 1));
        const endDate = endOfMonth(new Date(year, month - 1));

        // Get all completed or confirmed appointments for this staff in the month
        const appointments = await Appointment.find({
            staff: staffId,
            date: { $gte: startDate, $lte: endDate },
            status: { $in: ["completed", "confirmed"] },
        }).populate("services.service");

        // Calculate commission breakdown
        const breakdown = {
            appointments: appointments.map((apt: any) => {
                // If appointment already has a calculated commission (new system), use it
                // Otherwise calculate it (old system or fallback)
                // NOTE: We check for > 0 because Mongoose defaults it to 0
                let totalCommission = apt.commission;

                const servicesBreakdown = apt.services.map((svc: any) => {
                    const commValue = Number(svc.service?.commissionValue || 0);

                    let commissionAmount = 0;
                    if (!totalCommission) {
                        commissionAmount = commValue;
                    } else {
                        // NEW LOGIC: Distribute the stored 'after-everything' commission proportionately
                        const aptSubtotal = apt.services.reduce((sum: number, s: any) => sum + s.price, 0);
                        commissionAmount = aptSubtotal > 0 ? (totalCommission * (svc.price / aptSubtotal)) : 0;
                    }

                    return {
                        serviceName: svc.name,
                        serviceAmount: svc.price,
                        commissionRate: 0,
                        commissionAmount,
                    };
                });

                if (!totalCommission) {
                    totalCommission = servicesBreakdown.reduce(
                        (sum: number, s: any) => sum + s.commissionAmount,
                        0
                    );
                }

                return {
                    appointmentId: apt._id,
                    date: apt.date,
                    services: servicesBreakdown,
                    totalCommission,
                    tips: apt.tips || 0,
                };
            }),
            invoices: (await Invoice.find({
                $or: [
                    { staff: staffId },
                    { "staffAssignments.staff": staffId },
                    { "items.staffAssignments.staff": staffId },
                    { "items.sellingBy": staffId }
                ],
                date: { $gte: startDate, $lte: endDate },
                status: { $in: ["paid", "partially_paid"] }
            })).map((inv: any) => {
                let specificCommission = 0;
                let specificTip = 0;
                let sellingCommission = 0;
                
                // Process Item-level assignments first (V3.0 feature)
                let hasItemLevelStaff = false;
                if (inv.items && inv.items.length > 0) {
                    inv.items.forEach((item: any) => {
                        if (item.sellingBy?.toString() === staffId.toString()) {
                            sellingCommission += (item.sellingCommission || 0);
                        }
                        if (item.staffAssignments && item.staffAssignments.length > 0) {
                            hasItemLevelStaff = true;
                            const assignment = item.staffAssignments.find((a: any) => a.staff.toString() === staffId.toString());
                            if (assignment) {
                                specificCommission += (assignment.komisiNominal || assignment.commission || 0);
                            }
                        }
                    });
                }
                
                // Fallback to Invoice-level assignments if no items have staff (V2 compatibility)
                if (!hasItemLevelStaff) {
                    if (inv.staffAssignments && inv.staffAssignments.length > 0) {
                        const assignment = inv.staffAssignments.find((a: any) => a.staff.toString() === staffId.toString());
                        if (assignment) {
                            specificCommission += (assignment.komisiNominal || assignment.commission || 0);
                            specificTip = assignment.tip || 0;
                        } else if (inv.staff?.toString() === staffId.toString()) {
                            specificCommission += inv.commission || 0;
                            specificTip = inv.tips || 0;
                        }
                    } else if (inv.staff?.toString() === staffId.toString()) {
                        specificCommission += inv.commission || 0;
                        specificTip = inv.tips || 0;
                    }
                }

                return {
                    invoiceId: inv._id,
                    invoiceNumber: inv.invoiceNumber,
                    date: inv.date,
                    totalAmount: inv.totalAmount,
                    commission: specificCommission,
                    sellingCommission,
                    tip: specificTip
                };
            })
        };

        // Calculate totals
        const appointmentCommission = breakdown.appointments.reduce(
            (sum: number, apt: any) => sum + apt.totalCommission,
            0
        );
        const invoiceCommission = breakdown.invoices.reduce(
            (sum: number, inv: any) => sum + inv.commission,
            0
        );
        const invoiceSellingCommission = breakdown.invoices.reduce(
            (sum: number, inv: any) => sum + (inv.sellingCommission || 0),
            0
        );
        const totalCommission = appointmentCommission + invoiceCommission;
        const totalSellingCommission = invoiceSellingCommission;
        const appointmentTips = breakdown.appointments.reduce(
            (sum: number, apt: any) => sum + apt.tips,
            0
        );
        const invoiceTips = breakdown.invoices.reduce(
            (sum: number, inv: any) => sum + (inv.tip || 0),
            0
        );
        const totalTips = appointmentTips + invoiceTips;

        const baseSalary = staff.salary || 0;
        const bonuses = 0; // Can be added manually later
        const deductions = 0; // Can be added manually later
        const totalAmount = baseSalary + totalCommission + totalSellingCommission + totalTips + bonuses - deductions;

        // Create payroll record
        const payroll = await Payroll.create({
            staff: staffId,
            month,
            year,
            baseSalary,
            totalCommission,
            totalSellingCommission,
            totalTips,
            bonuses,
            deductions,
            totalAmount,
            status: "draft",
            breakdown,
        });

        const populated = await Payroll.findById(payroll._id).populate("staff", "name email phone");

        return NextResponse.json({ success: true, data: populated });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
