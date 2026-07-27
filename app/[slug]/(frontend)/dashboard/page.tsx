
import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getTenantModels } from '@/lib/tenantDb';
import { getCurrencySymbol } from '@/lib/currency';
import StatCard from '@/components/dashboard/StatCard';
import RecentActivity from '@/components/dashboard/RecentActivity';
import SalesChart from '@/components/dashboard/SalesChart';
import ServiceChart from '@/components/dashboard/ServiceChart';
import AIInsight from '@/components/dashboard/AIInsight';
import DashboardFilter from '@/components/dashboard/DashboardFilter';
import { Package, DollarSign, AlertTriangle, Calendar, Users, ShoppingBag } from 'lucide-react';
import { startOfDay, endOfDay, subDays, startOfWeek, endOfWeek, format, startOfMonth, startOfYear, differenceInDays } from 'date-fns';

export default async function DashboardPage(props: any) {
    const searchParams = await props.searchParams;
    const range = searchParams?.range || "today";

    const session = await auth();
    const headersList = await headers();
    const tenantSlug = headersList.get('x-store-slug') || 'pusat';

    if (!session) {
        redirect(`/${tenantSlug}/login`);
    }

    const { Product, Invoice, Appointment, Settings } = await getTenantModels(tenantSlug);

    const storeSettings = await Settings.findOne() || { currency: 'IDR' };
    const currencySymbol = getCurrencySymbol(storeSettings.currency);

    // Date Ranges
    let rangeStart = startOfDay(new Date());
    let rangeEnd = endOfDay(new Date());
    let trendLabel = "Hari Ini";
    let trendDescLabel = "Hari Ini";

    if (range === "7d") {
        rangeStart = startOfDay(subDays(new Date(), 6));
        trendLabel = "7 Hari";
        trendDescLabel = "Dalam 7 Hari Terakhir";
    } else if (range === "30d") {
        rangeStart = startOfDay(subDays(new Date(), 29));
        trendLabel = "30 Hari";
        trendDescLabel = "Dalam 30 Hari Terakhir";
    } else if (range === "this_month") {
        rangeStart = startOfMonth(new Date());
        trendLabel = "Bulan Ini";
        trendDescLabel = "Selama Bulan Ini";
    } else if (range === "this_year") {
        rangeStart = startOfYear(new Date());
        trendLabel = "Tahun Ini";
        trendDescLabel = "Selama Tahun Ini";
    }

    // 1. Fetch Stats
    // 1. Fetch Stats - Optimized to parallel execution
    const [
        productsCount,
        lowStockItems,
        lowStockCount,
        todaysInvoices,
        appointmentsToday
    ] = await Promise.all([
        Product.countDocuments({ status: "active" }),
        Product.find({
            $expr: { $lte: ["$stock", "$alertQuantity"] },
            status: "active"
        }).limit(5).lean(),
        Product.countDocuments({
            $expr: { $lte: ["$stock", "$alertQuantity"] },
            status: "active"
        }),
        Invoice.find({
            date: { $gte: rangeStart, $lte: rangeEnd },
            status: "paid"
        }).lean(),
        Appointment.countDocuments({
            date: { $gte: rangeStart, $lte: rangeEnd },
            status: { $in: ['confirmed', 'completed'] }
        })
    ]);

    const todaysSales = todaysInvoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
    const ordersToday = todaysInvoices.length;

    const serviceStats: Record<string, number> = {};
    todaysInvoices.forEach(inv => {
        inv.items.forEach((item: any) => {
            if (item.itemModel === 'Service' || item.itemModel === 'ServicePackage' || item.itemModel === 'ServiceBundle') {
                serviceStats[item.name] = (serviceStats[item.name] || 0) + item.total;
            }
        });
    });

    const sortedServices = Object.entries(serviceStats)
        .map(([name, revenue]) => ({ name, revenue }))
        .sort((a, b) => b.revenue - a.revenue);

    const top10Services = sortedServices.slice(0, 10);
    const otherServices = sortedServices.slice(10);
    
    if (otherServices.length > 0) {
        const othersRevenue = otherServices.reduce((sum, s) => sum + s.revenue, 0);
        top10Services.push({ name: 'Others', revenue: othersRevenue });
    }
    
    const serviceChartData = top10Services;

    // Sales Chart Data
    // Determine dynamic range for the chart (if > 30 days, we could do months, but let's stick to days max 30 or what the range is)
    const daysDiff = differenceInDays(rangeEnd, rangeStart) || 1;
    const chartDays = Math.min(daysDiff, 30); // Show max 30 data points on chart
    const chartStart = startOfDay(subDays(rangeEnd, chartDays));

    const salesAggregation = await Invoice.aggregate([
        {
            $match: {
                date: { $gte: chartStart, $lte: rangeEnd },
                status: "paid"
            }
        },
        {
            $group: {
                _id: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
                totalSales: { $sum: "$totalAmount" }
            }
        },
        { $sort: { _id: 1 } }
    ]);

    const salesMap = new Map(salesAggregation.map(item => [item._id, item.totalSales]));
    const chartData = [];
    for (let i = chartDays; i >= 0; i--) {
        const d = subDays(rangeEnd, i);
        const dateStr = format(d, 'yyyy-MM-dd');
        chartData.push({
            name: format(d, 'dd MMM'),
            sales: salesMap.get(dateStr) || 0
        });
    }

    // Customer Acquisition
    const customersInRange = [...new Set(todaysInvoices.filter((inv: any) => inv.customer).map((inv: any) => String(inv.customer)))];
    const existingCustomersRaw = await Invoice.distinct('customer', {
        customer: { $in: customersInRange },
        date: { $lt: rangeStart },
        status: { $nin: ['cancelled', 'voided'] }
    });
    const existingCount = existingCustomersRaw.length;
    const totalUnique = customersInRange.length;
    const newCount = totalUnique - existingCount;

    // Recent Activity (Mixed: Sales & Appointments)
    const recentInvoices = await Invoice.find().sort({ createdAt: -1 }).limit(5).populate('customer', 'name');
    const formattedActivity = recentInvoices.map(inv => ({
        id: inv._id.toString(),
        type: "sale" as const, // Casting to match component expectations
        product: `Invoice #${inv.invoiceNumber}`,
        quantity: 1,
        time: format(inv.createdAt, 'hh:mm a')
    }));

    return (
        <div className="space-y-6">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
                    <p className="text-gray-500">Welcome back, {session.user?.name || 'Admin'}! Here is what's happening today.</p>
                </div>
                <div className="mt-4 md:mt-0 flex items-center space-x-3">
                    <DashboardFilter />
                    <span className="hidden md:inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-900 text-white">
                        {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    </span>
                </div>
            </div>

            <AIInsight />

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                    title="Total Revenue"
                    value={`${currencySymbol}${todaysSales.toLocaleString('id-ID')}`}
                    icon={DollarSign}
                    color="green"
                    trend=""
                    trendDesc={trendDescLabel}
                    trendUp={true}
                />
                <StatCard
                    title="Appointments"
                    value={appointmentsToday.toString()}
                    icon={Calendar}
                    color="blue"
                    trend=""
                    trendDesc={trendDescLabel}
                    trendUp={true}
                />
                <StatCard
                    title="Low Stock Items"
                    value={lowStockCount.toString()}
                    icon={AlertTriangle}
                    color="red"
                    trend={lowStockCount > 0 ? "Action Needed" : "Good"}
                    trendUp={lowStockCount === 0}
                />
                <StatCard
                    title="Total Orders"
                    value={ordersToday.toString()}
                    icon={ShoppingBag}
                    color="purple"
                    trend=""
                    trendDesc={trendDescLabel}
                    trendUp={true}
                />
            </div>

            {/* Customer Acquisition Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <StatCard
                    title="Customer Baru"
                    value={newCount.toString()}
                    icon={Users}
                    color="green"
                    trend=""
                    trendDesc={trendDescLabel}
                    trendUp={true}
                />
                <StatCard
                    title="Customer Kembali"
                    value={existingCount.toString()}
                    icon={Users}
                    color="blue"
                    trend=""
                    trendDesc={trendDescLabel}
                    trendUp={true}
                />
                <StatCard
                    title="Total Customer Unik"
                    value={totalUnique.toString()}
                    icon={Users}
                    color="purple"
                    trend=""
                    trendDesc={trendDescLabel}
                    trendUp={true}
                />
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <SalesChart data={chartData} />
                <ServiceChart data={serviceChartData} />
            </div>

            {/* Recent Activity Section */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Recent Activity</h3>
                <RecentActivity activities={formattedActivity} />
            </div>
        </div>
    );
}
