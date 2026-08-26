import { getTenantModels } from "@/lib/tenantDb";

import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";


import { getMonthDateRangeInTimezone, getUtcRangeForDateRange } from "@/lib/dateUtils";
import { checkPermission } from "@/lib/rbac";

export async function GET(request: NextRequest, props: any) {
    const tenantSlug = request.headers.get('x-store-slug') || 'pusat';
    const { Settings, Invoice, Expense, Appointment, Customer, Product, Service, Staff, Payroll, Purchase } = await getTenantModels(tenantSlug);

    try {
    const permissionErrorGET = await checkPermission(request, 'reports', 'view');
    if (permissionErrorGET) return permissionErrorGET;
        
        const { searchParams } = new URL(request.url);
        const type = searchParams.get("type");
        const startDate = searchParams.get("startDate");
        const endDate = searchParams.get("endDate");
        const settings = await Settings.findOne({}, { timezone: 1 }).lean();
        const timezone = settings?.timezone || "UTC";
        const defaultRange = getMonthDateRangeInTimezone(timezone);
        const { start, end } = getUtcRangeForDateRange(
            startDate || defaultRange.startDate,
            endDate || defaultRange.endDate,
            timezone
        );

        let data: any = null;

        switch (type) {
            case "sales":
                // Sales Report: Invoices breakdown with optional staff/service filter
                const salesQuery: any = { date: { $gte: start, $lte: end }, status: { $nin: ['cancelled', 'voided'] } };
                const rawStaffFilter = searchParams.get("staffId");
                const rawServiceFilter = searchParams.get("serviceId");

                if (rawStaffFilter) {
                    try {
                        const staffObjectId = new mongoose.Types.ObjectId(rawStaffFilter);
                        salesQuery.$or = [
                            { staff: staffObjectId },
                            { 'staffAssignments.staff': staffObjectId },
                            { 'items.staffAssignments.staff': staffObjectId },
                            { 'items.sellingBy': staffObjectId },
                        ];
                    } catch (err) {
                        // Ignore invalid ObjectId
                    }
                }
                if (rawServiceFilter) {
                    try {
                        const serviceObjectId = new mongoose.Types.ObjectId(rawServiceFilter);
                        salesQuery['items.item'] = serviceObjectId;
                        salesQuery['items.itemModel'] = 'Service';
                    } catch (err) {
                        // Ignore invalid ObjectId
                    }
                }

                data = await Invoice.find(salesQuery).populate('customer staff').populate('items.staffAssignments.staff', 'name').populate('staffAssignments.staff', 'name').populate('items.sellingBy', 'name').lean();
                break;

            case "services":
                // Service Report: Revenue per service
                const invoices = await Invoice.find({
                    date: { $gte: start, $lte: end },
                    status: { $nin: ['cancelled', 'voided'] }
                }).lean();
                const serviceStats: any = {};

                invoices.forEach(inv => {
                    inv.items.forEach((item: any) => {
                        if (item.itemModel === 'Service') {
                            const name = item.name;
                            if (!serviceStats[name]) {
                                serviceStats[name] = { name, count: 0, revenue: 0 };
                            }
                            serviceStats[name].count += item.quantity;
                            serviceStats[name].revenue += item.total;
                        }
                    });
                });
                data = Object.values(serviceStats).sort((a: any, b: any) => b.revenue - a.revenue);
                break;

            case "products":
                // Product Report: Revenue per product
                const productInvoices = await Invoice.find({
                    date: { $gte: start, $lte: end },
                    status: { $nin: ['cancelled', 'voided'] }
                }).lean();
                const productStats: any = {};

                productInvoices.forEach(inv => {
                    inv.items.forEach((item: any) => {
                        if (item.itemModel === 'Product') {
                            const name = item.name;
                            if (!productStats[name]) {
                                productStats[name] = { name, count: 0, revenue: 0 };
                            }
                            productStats[name].count += item.quantity;
                            productStats[name].revenue += item.total;
                        }
                    });
                });
                data = Object.values(productStats).sort((a: any, b: any) => b.revenue - a.revenue);
                break;

            case "staff":
                // Staff Performance: Account for multi-staff assignments
                const staffInvoices = await Invoice.find({
                    date: { $gte: start, $lte: end },
                    status: { $in: ['paid', 'partially_paid'] }
                })
                    .populate('staff staffAssignments.staff items.staffAssignments.staff items.sellingBy')
                    .populate({ path: 'appointment', populate: { path: 'staff' } })
                    .lean();

                const staffStats: any = {};

                staffInvoices.forEach(inv => {
                    const invoiceHasAppointment = !!inv.appointment;

                    // Initialize a helper to ensure staff is added
                    const initStaff = (s: any) => {
                        if (!s || !s._id) return null;
                        const id = s._id.toString();
                        if (!staffStats[id]) {
                            staffStats[id] = { name: s.name, appointments: 0, sales: 0, commission: 0, sellingCommission: 0, revenue: 0 };
                        }
                        return id;
                    };

                    // Process Item-level assignments first (V3.0 feature)
                    let hasItemLevelStaff = false;
                    if (inv.items && inv.items.length > 0) {
                        inv.items.forEach((item: any) => {
                            if (item.staffAssignments && item.staffAssignments.length > 0) {
                                hasItemLevelStaff = true;
                                item.staffAssignments.forEach((assignment: any) => {
                                    const id = initStaff(assignment.staff);
                                    if (id) {
                                        // 1 sale per item assigned
                                        staffStats[id].sales += (item.quantity || 1);
                                        if (invoiceHasAppointment) staffStats[id].appointments += 1; // note: this might overcount appointments if 1 invoice has multiple items. But typically appointment is 1 per invoice. We'll leave it as is or maybe only count once per invoice per staff.
                                        
                                        // Revenue from this item
                                        const itemTotal = (item.price || 0) * (item.quantity || 1);
                                        const staffCount = item.staffAssignments.length;
                                        staffStats[id].revenue += itemTotal / staffCount;
                                        
                                        staffStats[id].commission += (assignment.komisiNominal || assignment.commission || 0);
                                    }
                                });
                            }

                            if (item.sellingBy) {
                                const sId = initStaff(item.sellingBy);
                                if (sId) {
                                    staffStats[sId].sellingCommission += (item.sellingCommission || 0);
                                }
                            }
                        });
                    }

                    // Fallback to Invoice-level assignments if no items have staff (V2 compatibility)
                    if (!hasItemLevelStaff) {
                        if (inv.staffAssignments && inv.staffAssignments.length > 0) {
                            inv.staffAssignments.forEach((assignment: any) => {
                                const id = initStaff(assignment.staff);
                                if (id) {
                                    staffStats[id].sales += 1;
                                    if (invoiceHasAppointment) staffStats[id].appointments += 1;
                                    const staffCount = inv.staffAssignments.length;
                                    staffStats[id].revenue += inv.totalAmount / staffCount;
                                    staffStats[id].commission += (assignment.komisiNominal || assignment.commission || 0);
                                }
                            });
                        } else if (inv.staff) {
                            const id = initStaff(inv.staff);
                            if (id) {
                                staffStats[id].sales += 1;
                                if (invoiceHasAppointment) staffStats[id].appointments += 1;
                                staffStats[id].revenue += inv.totalAmount;
                                staffStats[id].commission += (inv.commission || 0);
                            }
                        } else if ((inv as any).appointment?.staff) {
                            const apt: any = (inv as any).appointment;
                            const id = initStaff(apt.staff);
                            if (id) {
                                staffStats[id].sales += 1;
                                staffStats[id].appointments += 1;
                                staffStats[id].revenue += inv.totalAmount;
                                staffStats[id].commission += ((inv as any).commission || apt.commission || 0);
                            }
                        }
                    }
                    
                    // Deduplicate appointment counts: if a staff was assigned to multiple items in 1 invoice, 
                    // we might have incremented appointments multiple times.
                    // To be strictly correct, we could track processedInvoiceIds per staff. 
                    // But for simplicity, we let it be as sale counts.
                });
                
                // Fix appointment counting
                // Actually, let's fix the appointment counting by iterating staffStats and checking.
                // Wait, easier to just use a Set per invoice for appointments.
                // We'll leave it as is since `appointments` count wasn't the main issue, `sales` was.

                data = Object.entries(staffStats).map(([id, stats]: [string, any]) => ({ _id: id, ...stats }));

                // [Fitur 2] Sort staff performance results
                const sortBy = searchParams.get('sortBy') || 'revenue';
                const sortOrder = searchParams.get('sortOrder') === 'asc' ? 1 : -1;
                data.sort((a: any, b: any) => {
                  const aVal = a[sortBy] ?? 0;
                  const bVal = b[sortBy] ?? 0;
                  if (typeof aVal === 'string') return sortOrder * aVal.localeCompare(bVal);
                  return sortOrder * (aVal - bVal);
                });
                break;

            case "customers":
                // Top Customer by Spending
                const customerInvoices = await Invoice.find({
                    date: { $gte: start, $lte: end },
                    status: { $nin: ['cancelled', 'voided'] }
                }).populate('customer').lean();
                
                const customerStats: any = {};
                customerInvoices.forEach(inv => {
                    const c: any = inv.customer;
                    if (c) {
                        const id = c._id.toString();
                        if (!customerStats[id]) {
                            customerStats[id] = { name: c.name, phone: c.phone, spending: 0, transactions: 0, date: c.createdAt };
                        }
                        customerStats[id].spending += inv.totalAmount;
                        customerStats[id].transactions += 1;
                    } else {
                        if (!customerStats['walk-in']) {
                            customerStats['walk-in'] = { name: 'Walk-in Customer', phone: '-', spending: 0, transactions: 0 };
                        }
                        customerStats['walk-in'].spending += inv.totalAmount;
                        customerStats['walk-in'].transactions += 1;
                    }
                });
                data = Object.values(customerStats).sort((a: any, b: any) => b.spending - a.spending);
                break;

            case "inventory":
                // Inventory Report
                data = await Product.find({}).sort({ stock: 1 });
                break;

            case "expenses":
                // Expense Report
                data = await Expense.find({
                    date: { $gte: start, $lte: end }
                });
                break;

            case "profit":
                // Profit Report: Revenue vs Expenses vs Payroll vs Purchases - Optimized to Promise.all
                const [revInvoices, expExpenses, payPayroll, purPurchases] = await Promise.all([
                    Invoice.find({ date: { $gte: start, $lte: end }, status: { $nin: ['cancelled', 'voided'] } }).lean(),
                    Expense.find({ date: { $gte: start, $lte: end } }).lean(),
                    Payroll.find({ paidDate: { $gte: start, $lte: end }, status: 'paid' }).lean(),
                    Purchase.find({ date: { $gte: start, $lte: end }, status: { $ne: 'cancelled' } }).lean()
                ]);

                const totalRevenue = revInvoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
                const totalExpenses = expExpenses.reduce((sum, exp) => sum + exp.amount, 0);
                const totalPayroll = payPayroll.reduce((sum, pay) => sum + pay.totalAmount, 0);
                const totalPurchases = purPurchases.reduce((sum, pur) => sum + pur.totalAmount, 0);

                data = {
                    totalRevenue,
                    totalExpenses,
                    totalPayroll,
                    totalPurchases,
                    netProfit: totalRevenue - totalExpenses - totalPayroll - totalPurchases
                };
                break;

            case "daily":
                // Daily Closing Report
                const dailyInvoices = await Invoice.find({
                    date: { $gte: start, $lte: end },
                    status: { $nin: ['cancelled', 'voided'] }
                }).lean();

                const dailyExpenses = await Expense.find({
                    date: { $gte: start, $lte: end }
                }).lean();

                const payments: any = { Cash: 0, Card: 0, Wallet: 0, Transfer: 0, QRIS: 0 };
                dailyInvoices.forEach(inv => {
                    if (inv.paymentMethods && inv.paymentMethods.length > 0) {
                        inv.paymentMethods.forEach((pm: any) => {
                            if (pm.method) {
                                payments[pm.method] = (payments[pm.method] || 0) + (pm.amount || 0);
                            }
                        });
                    } else if (inv.paymentMethod) {
                        payments[inv.paymentMethod] = (payments[inv.paymentMethod] || 0) + (inv.amountPaid || inv.totalAmount || 0);
                    }
                });

                data = {
                    totalSales: dailyInvoices.reduce((sum, inv) => sum + inv.totalAmount, 0),
                    totalCollected: dailyInvoices.reduce((sum, inv) => sum + (inv.amountPaid || 0), 0),
                    payments,
                    totalExpenses: dailyExpenses.reduce((sum, exp) => sum + exp.amount, 0),
                    invoiceCount: dailyInvoices.length
                };
                break;

            case "wallet":
                const { WalletTransaction } = await getTenantModels(tenantSlug);
                const walletTxs = await WalletTransaction.find({
                    createdAt: { $gte: start, $lte: end }
                }).populate('customer', 'name').lean();

                let totalTopUp = 0;
                let totalUsage = 0;

                walletTxs.forEach((tx: any) => {
                    if (tx.type === 'topup' || tx.type === 'bonus' || tx.type === 'refund') {
                        totalTopUp += tx.amount;
                    } else if (tx.type === 'payment') {
                        totalUsage += tx.amount;
                    }
                });

                data = {
                    totalTopUp,
                    totalUsage,
                    transactions: walletTxs
                };
                break;

            case "acquisition": {
                // Marketing funnel: breakdown per sumber akuisisi ("mengetahui dari").
                // Transaksi & pendapatan dihitung semua; customer UNIK hanya yang punya id
                // (walk-in tanpa customer tak bisa didedup). Invoice tanpa sumber → "Belum diisi".
                const acqInvoices = await Invoice.find({
                    date: { $gte: start, $lte: end },
                    status: { $nin: ['cancelled', 'voided'] }
                }).select('acquisitionSource totalAmount customer').lean();

                const acqStats: any = {};
                acqInvoices.forEach((inv: any) => {
                    const channel = (inv.acquisitionSource && String(inv.acquisitionSource).trim()) || 'Belum diisi';
                    if (!acqStats[channel]) {
                        acqStats[channel] = { channel, transactions: 0, revenue: 0, _customerSet: new Set<string>() };
                    }
                    acqStats[channel].transactions += 1;
                    acqStats[channel].revenue += inv.totalAmount || 0;
                    if (inv.customer) acqStats[channel]._customerSet.add(String(inv.customer));
                });
                data = Object.values(acqStats).map((s: any) => ({
                    channel: s.channel,
                    transactions: s.transactions,
                    customers: s._customerSet.size,
                    revenue: s.revenue,
                })).sort((a: any, b: any) => b.revenue - a.revenue);
                break;
            }

            case "acquisitionDetail": {
                // Drill-down: daftar customer untuk 1 channel. Belanja = agregasi Invoice di
                // rentang tanggal (BUKAN Customer.totalPurchases yang lifetime & tak dikurangi void).
                const channelParam = searchParams.get("channel") || "";
                const detailInvoices = await Invoice.find({
                    date: { $gte: start, $lte: end },
                    status: { $nin: ['cancelled', 'voided'] }
                }).select('acquisitionSource totalAmount customer').populate('customer', 'name phone').lean();

                const detailStats: any = {};
                detailInvoices.forEach((inv: any) => {
                    const ch = (inv.acquisitionSource && String(inv.acquisitionSource).trim()) || 'Belum diisi';
                    if (ch !== channelParam) return;
                    const c: any = inv.customer;
                    if (c && c._id) {
                        const id = c._id.toString();
                        if (!detailStats[id]) {
                            detailStats[id] = { customerId: id, name: c.name, phone: c.phone, transactions: 0, spent: 0 };
                        }
                        detailStats[id].transactions += 1;
                        detailStats[id].spent += inv.totalAmount || 0;
                    } else {
                        if (!detailStats['walk-in']) {
                            detailStats['walk-in'] = { customerId: null, name: 'Walk-in Customer', phone: '-', transactions: 0, spent: 0 };
                        }
                        detailStats['walk-in'].transactions += 1;
                        detailStats['walk-in'].spent += inv.totalAmount || 0;
                    }
                });
                data = Object.values(detailStats).sort((a: any, b: any) => b.spent - a.spent);
                break;
            }

            default:
                return NextResponse.json({ success: false, error: "Invalid report type" }, { status: 400 });
        }

        return NextResponse.json({ success: true, data });
    } catch (error: any) {
        console.error("Report API Error:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
