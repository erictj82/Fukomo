"use client";


import { useParams } from "next/navigation";
import { useState, useEffect } from "react";
import { DollarSign, Calendar, User, TrendingUp, Download, Plus, Eye, Check, X, Edit, Trash2, Search, Filter, FileText, ChevronLeft, ChevronRight, MoreVertical } from "lucide-react";
import { format } from "date-fns";
import Modal from "@/components/dashboard/Modal";
import SearchableSelect from "@/components/dashboard/SearchableSelect";
import { FormButton } from "@/components/dashboard/FormInput";
import PermissionGate from "@/components/PermissionGate";
import { useSettings } from "@/components/providers/SettingsProvider";

interface Payroll {
    _id: string;
    staff: { _id: string; name: string };
    month: number;
    year: number;
    baseSalary: number;
    totalCommission: number;
    totalSellingCommission?: number;
    totalTips: number;
    bonuses: number;
    deductions: number;
    totalAmount: number;
    status: string;
    breakdown: any;
    notes?: string;
}

interface Staff {
    _id: string;
    name: string;
}

const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
];

export default function PayrollPage() {
  const params = useParams();
  const slug = params.slug as string;
    const { settings } = useSettings();
    const [payrolls, setPayrolls] = useState<Payroll[]>([]);
    const [staff, setStaff] = useState<Staff[]>([]);
    const [loading, setLoading] = useState(true);
    const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
    const [selectedPayroll, setSelectedPayroll] = useState<Payroll | null>(null);
    const [generating, setGenerating] = useState(false);
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const [pagination, setPagination] = useState<any>({ total: 0, page: 1, limit: 10, pages: 0 });
    const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
    const [updating, setUpdating] = useState(false);

    const currentDate = new Date();
    const [filterMonth, setFilterMonth] = useState<string>((currentDate.getMonth() + 1).toString());
    const [filterYear, setFilterYear] = useState<string>(currentDate.getFullYear().toString());
    const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth() + 1);
    const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());
    const [selectedStaff, setSelectedStaff] = useState("");

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (activeDropdown && !(event.target as Element).closest('.dropdown-trigger')) {
                setActiveDropdown(null);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [activeDropdown]);

    useEffect(() => {
        fetchData();
    }, [search, page, filterMonth, filterYear]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const queryParams = new URLSearchParams({
                search,
                page: page.toString(),
                limit: "10"
            });
            if (filterMonth) queryParams.append("month", filterMonth);
            if (filterYear) queryParams.append("year", filterYear);

            const [payrollRes, staffRes] = await Promise.all([
                fetch(`/api/payroll?${queryParams.toString()}`, { headers: { "x-store-slug": slug } }),
                fetch("/api/staff/payroll-list", { headers: { "x-store-slug": slug } })
            ]);

            const payrollData = await payrollRes.json();
            const staffData = await staffRes.json();

            if (payrollData.success) {
                setPayrolls(payrollData.data);
                if (payrollData.pagination) setPagination(payrollData.pagination);
            }
            if (staffData.success) setStaff(staffData.data);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleGeneratePayroll = async () => {
        if (!selectedStaff) {
            alert("Please select a staff member");
            return;
        }

        setGenerating(true);
        try {
            const res = await fetch("/api/payroll", {
                method: "POST",
                headers: { "x-store-slug": slug, "Content-Type": "application/json" },
                body: JSON.stringify({
                    staffId: selectedStaff,
                    month: selectedMonth,
                    year: selectedYear
                })
            });

            const data = await res.json();
            if (data.success) {
                fetchData();
                setIsGenerateModalOpen(false);
                setSelectedStaff("");
            } else {
                alert(data.error || "Failed to generate payroll");
            }
        } catch (error) {
            console.error(error);
            alert("Error generating payroll");
        } finally {
            setGenerating(false);
        }
    };

    const handleStatusUpdate = async (id: string, status: string) => {
        try {
            const res = await fetch(`/api/payroll/${id}`, {
                method: "PUT",
                headers: { "x-store-slug": slug, "Content-Type": "application/json" },
                body: JSON.stringify({ status, paidDate: status === "paid" ? new Date() : null })
            });

            if ((await res.json()).success) {
                fetchData();
            }
        } catch (error) {
            console.error(error);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure you want to delete this payroll record?")) return;
        try {
            const res = await fetch(`/api/payroll/${id}`, { headers: { "x-store-slug": slug }, method: "DELETE" });
            const data = await res.json();
            if (data.success) {
                fetchData();
                setIsDetailModalOpen(false);
                setSelectedPayroll(null);
            } else {
                alert(data.error || "Failed to delete payroll");
            }
        } catch (error) {
            console.error(error);
        }
    };

    const viewDetails = (payroll: Payroll) => {
        setSelectedPayroll(payroll);
        setEditPayrollData({
            bonuses: payroll.bonuses,
            deductions: payroll.deductions,
            notes: payroll.notes || ""
        });
        setIsDetailModalOpen(true);
    };

    const [editPayrollData, setEditPayrollData] = useState({
        bonuses: 0,
        deductions: 0,
        notes: ""
    });

    const handleUpdatePayrollDetails = async () => {
        if (!selectedPayroll) return;
        setUpdating(true);
        try {
            const totalAmount = selectedPayroll.baseSalary + selectedPayroll.totalCommission + (selectedPayroll.totalSellingCommission || 0) + selectedPayroll.totalTips + editPayrollData.bonuses - editPayrollData.deductions;

            const res = await fetch(`/api/payroll/${selectedPayroll._id}`, {
                method: "PUT",
                headers: { "x-store-slug": slug, "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...editPayrollData,
                    totalAmount
                })
            });

            if ((await res.json()).success) {
                fetchData();
                setIsDetailModalOpen(false);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setUpdating(false);
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case "paid": return "bg-green-100 text-green-700 border-green-200";
            case "approved": return "bg-blue-100 text-blue-700 border-blue-200";
            default: return "bg-gray-100 text-gray-700 border-gray-200";
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
            <div className="max-w-7xl mx-auto">
                {/* Header Section */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Payroll & Commission</h1>
                        <p className="text-sm text-gray-500">Manage staff salaries, commissions, and tips</p>
                    </div>
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                        <button
                            onClick={() => setIsGenerateModalOpen(true)}
                            className="w-full sm:w-auto px-4 py-2 bg-blue-900 text-white rounded-lg hover:bg-blue-800 transition-all flex items-center justify-center gap-2 shadow-sm font-semibold text-sm"
                        >
                            <Plus className="w-4 h-4 shrink-0" />
                            Generate Payroll
                        </button>
                    </div>
                </div>

                {/* Main Card */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden text-black">
                    {/* Filters Bar */}
                    <div className="p-4 border-b border-gray-200 flex flex-col lg:flex-row gap-4 items-center justify-between bg-gray-50/50">
                        <div className="relative w-full lg:w-96">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                            <input
                                type="text"
                                placeholder="Search by staff name..."
                                className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900 transition-all text-sm"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                        <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto">
                            <div className="flex w-full gap-2">
                                <select
                                    className="w-full sm:w-auto px-3 py-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900 transition-all text-sm"
                                    value={filterMonth}
                                    onChange={(e) => { setFilterMonth(e.target.value); setPage(1); }}
                                >
                                    <option value="">All Months</option>
                                    {MONTHS.map((month, idx) => (
                                        <option key={idx} value={(idx + 1).toString()}>{month}</option>
                                    ))}
                                </select>
                                <select
                                    className="w-full sm:w-auto px-3 py-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900 transition-all text-sm"
                                    value={filterYear}
                                    onChange={(e) => { setFilterYear(e.target.value); setPage(1); }}
                                >
                                    <option value="">All Years</option>
                                    {[2024, 2025, 2026].map(year => (
                                        <option key={year} value={year.toString()}>{year}</option>
                                    ))}
                                </select>
                            </div>
                            <button
                                onClick={() => { 
                                    setSearch(""); 
                                    setFilterMonth((currentDate.getMonth() + 1).toString()); 
                                    setFilterYear(currentDate.getFullYear().toString()); 
                                    setPage(1); 
                                }}
                                className="w-full sm:w-auto text-gray-500 hover:text-gray-700 font-medium text-sm px-4 py-2 bg-gray-100 sm:bg-transparent rounded-lg sm:rounded-none transition-colors"
                            >
                                Reset Filters
                            </button>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 hidden xl:table">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Staff</th>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Period</th>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Salary</th>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Commission</th>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Selling Comm</th>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Tips</th>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Total</th>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                                    <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-100">
                                {loading && payrolls.length === 0 ? (
                                    Array.from({ length: 5 }).map((_, i) => (
                                        <tr key={i} className="animate-pulse">
                                            <td colSpan={8} className="px-6 py-4"><div className="h-4 bg-gray-100 rounded"></div></td>
                                        </tr>
                                    ))
                                ) : payrolls.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                                            <DollarSign className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                            <p>No payroll records found</p>
                                        </td>
                                    </tr>
                                ) : (
                                    payrolls.map((payroll) => (
                                        <tr key={payroll._id} className="hover:bg-gray-50/50 transition-colors">
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-xs">
                                                        {payroll.staff.name.substring(0, 2).toUpperCase()}
                                                    </div>
                                                    <span className="text-sm font-bold text-gray-900">{payroll.staff.name}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="flex items-center gap-1.5 text-sm text-gray-600">
                                                    <Calendar className="w-3.5 h-3.5 text-gray-400" />
                                                    {MONTHS[payroll.month - 1]} {payroll.year}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                                {settings.symbol}{(payroll.baseSalary || 0).toLocaleString('id-ID')}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-green-600">
                                                {settings.symbol}{(payroll.totalCommission || 0).toLocaleString('id-ID')}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-emerald-600">
                                                {settings.symbol}{(payroll.totalSellingCommission || 0).toLocaleString('id-ID')}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-purple-600">
                                                {settings.symbol}{(payroll.totalTips || 0).toLocaleString('id-ID')}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">
                                                {settings.symbol}{(payroll.totalAmount || 0).toLocaleString('id-ID')}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border ${getStatusColor(payroll.status)}`}>
                                                    {payroll.status}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                                                <div className="relative flex justify-end items-center gap-2 dropdown-trigger">
                                                    <button
                                                        onClick={() => setActiveDropdown(activeDropdown === payroll._id ? null : payroll._id)}
                                                        className="p-2 text-gray-400 hover:text-blue-900 hover:bg-blue-50 rounded-lg transition-all"
                                                    >
                                                        <MoreVertical className="w-5 h-5" />
                                                    </button>

                                                    {activeDropdown === payroll._id && (
                                                        <div className="absolute right-0 mt-10 w-48 bg-white border border-gray-100 rounded-xl shadow-xl z-50 py-1 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 text-left">
                                                            <button
                                                                onClick={() => {
                                                                    viewDetails(payroll);
                                                                    setActiveDropdown(null);
                                                                }}
                                                                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50 transition-colors"
                                                            >
                                                                <Edit className="w-4 h-4 text-blue-600" />
                                                                Edit / View Details
                                                            </button>
                                                            {payroll.status === "draft" && (
                                                                <button
                                                                    onClick={() => {
                                                                        handleStatusUpdate(payroll._id, "approved");
                                                                        setActiveDropdown(null);
                                                                    }}
                                                                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-green-50 transition-colors"
                                                                >
                                                                    <Check className="w-4 h-4 text-green-600" />
                                                                    Approve
                                                                </button>
                                                            )}
                                                            {payroll.status === "approved" && (
                                                                <button
                                                                    onClick={() => {
                                                                        handleStatusUpdate(payroll._id, "paid");
                                                                        setActiveDropdown(null);
                                                                    }}
                                                                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-green-50 transition-colors"
                                                                >
                                                                    <DollarSign className="w-4 h-4 text-green-600" />
                                                                    Mark as Paid
                                                                </button>
                                                            )}
                                                            <div className="h-px bg-gray-100 my-1" />
                                                            <button
                                                                onClick={() => {
                                                                    handleDelete(payroll._id);
                                                                    setActiveDropdown(null);
                                                                }}
                                                                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                                Delete Record
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>

                        {/* Mobile Card View (Payroll) */}
                        <div className="xl:hidden flex flex-col divide-y divide-gray-100">
                            {loading && payrolls.length === 0 ? (
                                Array.from({ length: 5 }).map((_, i) => (
                                    <div key={i} className="p-4 animate-pulse space-y-3">
                                        <div className="h-4 bg-gray-100 rounded w-1/2"></div>
                                        <div className="h-4 bg-gray-100 rounded w-1/3"></div>
                                    </div>
                                ))
                            ) : payrolls.length === 0 ? (
                                <div className="p-12 text-center text-gray-500">
                                    <DollarSign className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                    <p>No payroll records found</p>
                                </div>
                            ) : (
                                payrolls.map((payroll) => (
                                    <div key={payroll._id} className="p-4 flex flex-col gap-3 relative hover:bg-gray-50/50 transition-colors">
                                        <div className="flex justify-between items-start pr-8">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm shrink-0">
                                                    {payroll.staff.name.substring(0, 2).toUpperCase()}
                                                </div>
                                                <div>
                                                    <h3 className="text-sm font-bold text-gray-900 leading-tight">{payroll.staff.name}</h3>
                                                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-400 font-medium tracking-wide">
                                                        <Calendar className="w-3 h-3" />
                                                        {MONTHS[payroll.month - 1]} {payroll.year}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="absolute top-4 right-2 dropdown-trigger">
                                            <button
                                                onClick={() => setActiveDropdown(activeDropdown === payroll._id ? null : payroll._id)}
                                                className="p-1.5 text-gray-400 hover:text-blue-900 hover:bg-blue-50 rounded-lg transition-all"
                                            >
                                                <MoreVertical className="w-5 h-5 shrink-0" />
                                            </button>
                                            {activeDropdown === payroll._id && (
                                                <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-100 rounded-xl shadow-xl z-50 py-1 overflow-hidden font-medium">
                                                    <button onClick={() => { viewDetails(payroll); setActiveDropdown(null); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50 transition-colors">
                                                        <Edit className="w-4 h-4 text-blue-600" /> Edit / View Details
                                                    </button>
                                                    {payroll.status === "draft" && (
                                                        <button onClick={() => { handleStatusUpdate(payroll._id, "approved"); setActiveDropdown(null); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-green-50 transition-colors">
                                                            <Check className="w-4 h-4 text-green-600" /> Approve
                                                        </button>
                                                    )}
                                                    {payroll.status === "approved" && (
                                                        <button onClick={() => { handleStatusUpdate(payroll._id, "paid"); setActiveDropdown(null); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-green-50 transition-colors">
                                                            <DollarSign className="w-4 h-4 text-green-600" /> Mark as Paid
                                                        </button>
                                                    )}
                                                    <div className="h-px bg-gray-100 my-1" />
                                                    <button onClick={() => { handleDelete(payroll._id); setActiveDropdown(null); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors">
                                                        <Trash2 className="w-4 h-4" /> Delete Record
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-2 mt-1 -mb-1">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border ${getStatusColor(payroll.status)}`}>
                                                {payroll.status}
                                            </span>
                                        </div>

                                        <div className="grid grid-cols-2 gap-2 text-[11px] bg-gray-50/80 rounded-xl p-3 border border-gray-100 mt-2">
                                            <div className="flex justify-between items-center border-b border-gray-200 pb-1.5 pt-0.5">
                                                <span className="text-gray-500 font-medium">Salary</span>
                                                <span className="font-bold text-gray-900">{settings.symbol}{(payroll.baseSalary || 0).toLocaleString('id-ID')}</span>
                                            </div>
                                            <div className="flex justify-between items-center border-b border-gray-200 pb-1.5 pt-0.5">
                                                <span className="text-gray-500 font-medium">Comm.</span>
                                                <span className="font-bold text-green-600">{settings.symbol}{(payroll.totalCommission || 0).toLocaleString('id-ID')}</span>
                                            </div>
                                            <div className="flex justify-between items-center border-b border-gray-200 pb-1.5 pt-0.5">
                                                <span className="text-gray-500 font-medium">Sell Comm.</span>
                                                <span className="font-bold text-emerald-600">{settings.symbol}{(payroll.totalSellingCommission || 0).toLocaleString('id-ID')}</span>
                                            </div>
                                            <div className="flex justify-between items-center pt-1">
                                                <span className="text-gray-500 font-medium">Tips</span>
                                                <span className="font-bold text-purple-600">{settings.symbol}{(payroll.totalTips || 0).toLocaleString('id-ID')}</span>
                                            </div>
                                            <div className="flex justify-between items-center pt-1">
                                                <span className="text-blue-800 font-bold uppercase tracking-wide">Total</span>
                                                <span className="font-black text-blue-900 bg-blue-100/50 px-1 py-0.5 rounded">{settings.symbol}{(payroll.totalAmount || 0).toLocaleString('id-ID')}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Pagination */}
                    <div className="px-4 py-4 bg-gray-50 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div className="text-sm text-gray-500 font-medium text-center sm:text-left">
                            Showing <span className="text-gray-900">{payrolls.length}</span> of <span className="text-gray-900">{pagination.total}</span> records
                        </div>
                        <div className="flex items-center gap-2 w-full justify-center sm:w-auto">
                            <button
                                onClick={() => page > 1 && setPage(page - 1)}
                                disabled={page <= 1}
                                className="p-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <div className="flex items-center gap-1">
                                {Array.from({ length: Math.min(5, pagination.pages) }, (_, i) => {
                                    let pageNum;
                                    if (pagination.pages <= 5) {
                                        pageNum = i + 1;
                                    } else if (pagination.page <= 3) {
                                        pageNum = i + 1;
                                    } else if (pagination.page >= pagination.pages - 2) {
                                        pageNum = pagination.pages - 4 + i;
                                    } else {
                                        pageNum = pagination.page - 2 + i;
                                    }
                                    return (
                                        <button
                                            key={pageNum}
                                            onClick={() => setPage(pageNum)}
                                            className={`w-8 h-8 rounded-lg text-sm font-semibold transition-all ${page === pageNum
                                                ? "bg-blue-900 text-white"
                                                : "text-gray-600 hover:bg-gray-100"
                                                }`}
                                        >
                                            {pageNum}
                                        </button>
                                    );
                                })}
                            </div>
                            <button
                                onClick={() => page < pagination.pages && setPage(page + 1)}
                                disabled={page >= pagination.pages}
                                className="p-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                            >
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Generate Payroll Modal */}
            <Modal isOpen={isGenerateModalOpen} onClose={() => setIsGenerateModalOpen(false)} title="Generate Payroll">
                <div className="space-y-4">
                    <SearchableSelect
                        label="Staff Member"
                        placeholder="Select Staff"
                        required
                        value={selectedStaff}
                        onChange={(val) => setSelectedStaff(val)}
                        options={staff.map(s => ({ value: s._id, label: s.name }))}
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <SearchableSelect
                            label="Month"
                            value={selectedMonth.toString()}
                            onChange={(val) => setSelectedMonth(parseInt(val))}
                            options={MONTHS.map((month, idx) => ({ value: (idx + 1).toString(), label: month }))}
                        />
                        <SearchableSelect
                            label="Year"
                            value={selectedYear.toString()}
                            onChange={(val) => setSelectedYear(parseInt(val))}
                            options={[2024, 2025, 2026].map(year => ({ value: year.toString(), label: year.toString() }))}
                        />
                    </div>
                    <div className="flex flex-col-reverse sm:flex-row justify-end sm:space-x-3 gap-3 sm:gap-0 mt-6">
                        <button onClick={() => setIsGenerateModalOpen(false)} className="w-full sm:w-auto px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-bold transition-colors text-center">Cancel</button>
                        <FormButton onClick={handleGeneratePayroll} loading={generating} className="w-full sm:w-auto text-center justify-center">
                            Generate
                        </FormButton>
                    </div>
                </div>
            </Modal>

            {/* Detail Modal */}
            {selectedPayroll && (
                <Modal isOpen={isDetailModalOpen} onClose={() => setIsDetailModalOpen(false)} title={`Payroll Details - ${selectedPayroll.staff.name}`}>
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
                            <div>
                                <p className="text-xs text-gray-500">Period</p>
                                <p className="font-semibold">{MONTHS[selectedPayroll.month - 1]} {selectedPayroll.year}</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-500">Status</p>
                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(selectedPayroll.status)}`}>
                                    {selectedPayroll.status}
                                </span>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <div className="flex justify-between py-2 border-b">
                                <span className="text-gray-600">Base Salary</span>
                                <span className="font-semibold">{settings.symbol}{(selectedPayroll.baseSalary || 0).toLocaleString('id-ID')}</span>
                            </div>
                            <div className="flex justify-between py-2 border-b">
                                <span className="text-gray-600">Total Commission</span>
                                <span className="font-semibold text-green-600">{settings.symbol}{(selectedPayroll.totalCommission || 0).toLocaleString('id-ID')}</span>
                            </div>
                            <div className="flex justify-between py-2 border-b">
                                <span className="text-gray-600">Total Selling Commission</span>
                                <span className="font-semibold text-emerald-600">{settings.symbol}{(selectedPayroll.totalSellingCommission || 0).toLocaleString('id-ID')}</span>
                            </div>
                            <div className="flex justify-between py-2 border-b">
                                <span className="text-gray-600">Total Tips</span>
                                <span className="font-semibold text-purple-600">{settings.symbol}{(selectedPayroll.totalTips || 0).toLocaleString('id-ID')}</span>
                            </div>

                            <div className="pt-2">
                                <label className="text-sm font-medium text-gray-700">Bonuses</label>
                                <input
                                    type="number"
                                    className="w-full mt-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-900 focus:border-transparent"
                                    value={editPayrollData.bonuses}
                                    onChange={(e) => setEditPayrollData({ ...editPayrollData, bonuses: parseFloat(e.target.value) || 0 })}
                                />
                            </div>

                            <div>
                                <label className="text-sm font-medium text-gray-700">Deductions</label>
                                <input
                                    type="number"
                                    className="w-full mt-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-900 focus:border-transparent"
                                    value={editPayrollData.deductions}
                                    onChange={(e) => setEditPayrollData({ ...editPayrollData, deductions: parseFloat(e.target.value) || 0 })}
                                />
                            </div>

                            <div>
                                <label className="text-sm font-medium text-gray-700">Notes</label>
                                <textarea
                                    className="w-full mt-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-900 focus:border-transparent"
                                    rows={2}
                                    value={editPayrollData.notes}
                                    onChange={(e) => setEditPayrollData({ ...editPayrollData, notes: e.target.value })}
                                />
                            </div>

                            <div className="flex justify-between py-3 bg-blue-50 px-3 rounded-lg mt-2">
                                <span className="font-bold text-gray-900">Final Total</span>
                                <span className="font-bold text-blue-900 text-lg">
                                    {settings.symbol}{((selectedPayroll.baseSalary || 0) + (selectedPayroll.totalCommission || 0) + (selectedPayroll.totalSellingCommission || 0) + (selectedPayroll.totalTips || 0) + editPayrollData.bonuses - editPayrollData.deductions).toLocaleString('id-ID')}
                                </span>
                            </div>
                        </div>

                        <div className="flex flex-col sm:flex-row justify-between items-center pt-4 border-t gap-4">
                            <button
                                onClick={() => handleDelete(selectedPayroll._id)}
                                className="w-full sm:w-auto px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center justify-center gap-2 font-semibold"
                            >
                                <Trash2 className="w-4 h-4 shrink-0" />
                                Delete Record
                            </button>
                            <div className="flex flex-col-reverse sm:flex-row gap-3 w-full sm:w-auto">
                                <button
                                    onClick={() => setIsDetailModalOpen(false)}
                                    className="w-full sm:w-auto px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors font-bold text-center"
                                >
                                    Cancel
                                </button>
                                <FormButton
                                    onClick={handleUpdatePayrollDetails}
                                    loading={updating}
                                    className="w-full sm:w-auto text-center justify-center"
                                >
                                    Submit
                                </FormButton>
                            </div>
                        </div>

                        <div className="pt-4 border-t space-y-4">
                            <div className="flex justify-between items-center text-sm">
                                <span className="font-semibold text-gray-700">Appointments:</span>
                                <span className="text-gray-600">{selectedPayroll.breakdown?.appointments?.length || 0}</span>
                            </div>
                            {selectedPayroll.breakdown?.invoices?.length > 0 && (
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="font-semibold text-gray-700">Direct Sales (POS):</span>
                                        <span className="text-gray-600">{selectedPayroll.breakdown.invoices.length}</span>
                                    </div>
                                    <div className="bg-gray-50 p-3 rounded-lg text-xs space-y-2 max-h-40 overflow-y-auto">
                                        {selectedPayroll.breakdown.invoices.map((inv: any) => (
                                            <div key={inv.invoiceId} className="flex justify-between items-center border-b border-gray-100 pb-1.5 last:border-0 last:pb-0">
                                                <div className="flex flex-col gap-0.5">
                                                    <span className="font-bold text-gray-700">{inv.invoiceNumber}</span>
                                                    <span className="text-[10px] text-gray-400 font-medium italic">{format(new Date(inv.date), "dd MMM yyyy")}</span>
                                                </div>
                                                <div className="flex flex-col items-end gap-0.5">
                                                    <span className="font-semibold text-green-600">Comm: {settings.symbol}{inv.commission.toLocaleString('id-ID', { maximumFractionDigits: 0 })}</span>
                                                    {inv.tip > 0 && <span className="font-black text-purple-600 italic tracking-tighter">Tip: {settings.symbol}{inv.tip.toLocaleString('id-ID', { maximumFractionDigits: 0 })}</span>}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}
