
"use client";


import { useParams } from "next/navigation";
import { useState, useEffect } from "react";
import { Plus, Edit, Trash2, Search, DollarSign, Calendar, Tag, Filter, ChevronLeft, ChevronRight, MoreVertical, FileText } from "lucide-react";
import Modal from "@/components/dashboard/Modal";
import FormInput, { FormSelect, FormButton } from "@/components/dashboard/FormInput";
import { useSettings } from "@/components/providers/SettingsProvider";
import SearchableSelect from "@/components/dashboard/SearchableSelect";
import PermissionGate from "@/components/PermissionGate";
import { formatDate, getCurrentDateInTimezone } from "@/lib/dateUtils";

interface Expense {
    _id: string;
    title: string;
    amount: number;
    category: string;
    date: string;
    paymentMethod: string;
    notes?: string;
}

const EXPENSE_CATEGORIES = [
    "Sewa (Rent)",
    "Listrik & Air (Utilities)",
    "Gaji (Salaries)",
    "Bahan Baku (Supplies)",
    "Pemasaran (Marketing)",
    "Perawatan (Maintenance)",
    "Transportasi",
    "Lainnya"
];

export default function ExpensesPage() {
  const params = useParams();
  const slug = params.slug as string;
    const { settings } = useSettings();
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
    const [search, setSearch] = useState("");
    const [selectedCategory, setSelectedCategory] = useState("");
    const [page, setPage] = useState(1);
    const [pagination, setPagination] = useState<any>({ total: 0, page: 1, limit: 10, pages: 0 });
    const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (activeDropdown && !(event.target as Element).closest('.dropdown-trigger')) {
                setActiveDropdown(null);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [activeDropdown]);

    const [formData, setFormData] = useState({
        title: "",
        amount: 0,
        category: "Lainnya",
        date: getCurrentDateInTimezone(settings.timezone),
        paymentMethod: "Cash",
        notes: ""
    });

    useEffect(() => {
        fetchExpenses();
    }, [search, selectedCategory, page]);

    const fetchExpenses = async () => {
        setLoading(true);
        try {
            const query = new URLSearchParams();
            if (search) query.append("search", search);
            if (selectedCategory) query.append("category", selectedCategory);
            query.append("page", page.toString());
            query.append("limit", "10");

            const res = await fetch(`/api/expenses?${query.toString()}`, { headers: { "x-store-slug": slug } });
            const data = await res.json();
            if (data.success) {
                setExpenses(data.data);
                if (data.pagination) setPagination(data.pagination);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const url = editingExpense ? `/api/expenses/${editingExpense._id}` : "/api/expenses";
            const res = await fetch(url, {
                method: editingExpense ? "PUT" : "POST",
                headers: { "x-store-slug": slug, "Content-Type": "application/json" },
                body: JSON.stringify(formData),
            });
            const data = await res.json();
            if (data.success) {
                fetchExpenses();
                closeModal();
            } else {
                alert(data.error || "Something went wrong");
            }
        } catch (error) {
            console.error(error);
            alert("An error occurred");
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Delete this expense?")) return;
        const res = await fetch(`/api/expenses/${id}`, { headers: { "x-store-slug": slug }, method: "DELETE" });
        if ((await res.json()).success) fetchExpenses();
    };

    const openModal = (expense?: Expense) => {
        if (expense) {
            setEditingExpense(expense);
            setFormData({
                title: expense.title,
                amount: expense.amount,
                category: expense.category,
                date: getCurrentDateInTimezone(settings.timezone, new Date(expense.date)),
                paymentMethod: expense.paymentMethod,
                notes: expense.notes || ""
            });
        } else {
            setEditingExpense(null);
            setFormData({
                title: "",
                amount: 0,
                category: "Lainnya",
                date: getCurrentDateInTimezone(settings.timezone),
                paymentMethod: "Cash",
                notes: ""
            });
        }
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingExpense(null);
    };

    const totalExpenses = expenses.reduce((sum, exp) => sum + exp.amount, 0);

    return (
        <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
            <div className="max-w-7xl mx-auto">
                {/* Header Section */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Expense Management</h1>
                        <p className="text-sm text-gray-500">Track and manage business expenses</p>
                    </div>
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                        <PermissionGate resource="expenses" action="create">
                            <button
                                onClick={() => openModal()}
                                className="w-full sm:w-auto px-4 py-2 bg-blue-900 text-white rounded-lg hover:bg-blue-800 transition-all flex justify-center items-center gap-2 shadow-sm font-semibold text-sm"
                            >
                                <Plus className="w-4 h-4 shrink-0" />
                                Add Expense
                            </button>
                        </PermissionGate>
                    </div>
                </div>

                {/* Main Card */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden text-black">
                    {/* Filters Bar */}
                    <div className="p-4 border-b border-gray-200 flex flex-col md:flex-row gap-4 items-center justify-between bg-gray-50/50">
                        <div className="relative w-full md:w-96">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                            <input
                                type="text"
                                placeholder="Search expenses..."
                                className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900 transition-all text-sm"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
                            <div className="w-full sm:w-48">
                                <SearchableSelect
                                    placeholder="All Categories"
                                    value={selectedCategory}
                                    onChange={(val) => setSelectedCategory(val)}
                                    options={[
                                        { value: "", label: "All Categories" },
                                        ...EXPENSE_CATEGORIES.map(cat => ({ value: cat, label: cat }))
                                    ]}
                                />
                            </div>
                            <button
                                onClick={() => { setSearch(""); setSelectedCategory(""); setPage(1); }}
                                className="w-full sm:w-auto text-gray-500 hover:text-gray-700 font-medium text-sm px-4 py-2 bg-gray-100 sm:bg-transparent rounded-lg sm:rounded-none transition-colors"
                            >
                                Reset Filters
                            </button>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 hidden md:table">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Title</th>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Category</th>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Amount</th>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Payment</th>
                                    <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-100">
                                {loading && expenses.length === 0 ? (
                                    Array.from({ length: 5 }).map((_, i) => (
                                        <tr key={i} className="animate-pulse">
                                            <td colSpan={6} className="px-6 py-4"><div className="h-4 bg-gray-100 rounded"></div></td>
                                        </tr>
                                    ))
                                ) : expenses.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                                            <DollarSign className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                            <p>No expenses found</p>
                                        </td>
                                    </tr>
                                ) : (
                                    expenses.map((expense) => (
                                        <tr key={expense._id} className="hover:bg-gray-50/50 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="text-sm font-semibold text-gray-900">{expense.title}</div>
                                                {expense.notes && <div className="text-xs text-gray-500 truncate max-w-xs">{expense.notes}</div>}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-gray-50 text-gray-600 border border-gray-200">
                                                    <Tag className="w-3 h-3 mr-1" />
                                                    {expense.category}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className="text-sm font-bold text-red-600">{settings.symbol}{expense.amount.toLocaleString('id-ID')}</span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="flex items-center gap-1.5 text-sm text-gray-600">
                                                    <Calendar className="w-3.5 h-3.5 text-gray-400" />
                                                    {formatDate(expense.date, settings.timezone)}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                                                {expense.paymentMethod}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                                                <div className="relative flex justify-end dropdown-trigger">
                                                    <button
                                                        onClick={() => setActiveDropdown(activeDropdown === expense._id ? null : expense._id)}
                                                        className="p-2 text-gray-400 hover:text-blue-900 hover:bg-blue-50 rounded-lg transition-all"
                                                    >
                                                        <MoreVertical className="w-5 h-5" />
                                                    </button>

                                                    {activeDropdown === expense._id && (
                                                        <div className="absolute right-0 mt-10 w-48 bg-white border border-gray-100 rounded-xl shadow-xl z-50 py-1 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 text-left">
                                                            <PermissionGate resource="expenses" action="edit">
                                                                <button
                                                                    onClick={() => {
                                                                        openModal(expense);
                                                                        setActiveDropdown(null);
                                                                    }}
                                                                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50 transition-colors"
                                                                >
                                                                    <Edit className="w-4 h-4 text-blue-600" />
                                                                    Edit Details
                                                                </button>
                                                            </PermissionGate>
                                                            <div className="h-px bg-gray-100 my-1" />
                                                            <PermissionGate resource="expenses" action="delete">
                                                                <button
                                                                    onClick={() => {
                                                                        handleDelete(expense._id);
                                                                        setActiveDropdown(null);
                                                                    }}
                                                                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                                                                >
                                                                    <Trash2 className="w-4 h-4" />
                                                                    Delete Expense
                                                                </button>
                                                            </PermissionGate>
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>

                        {/* Mobile Card View (Expenses) */}
                        <div className="md:hidden flex flex-col divide-y divide-gray-100">
                            {loading && expenses.length === 0 ? (
                                Array.from({ length: 5 }).map((_, i) => (
                                    <div key={i} className="p-4 animate-pulse space-y-3">
                                        <div className="h-4 bg-gray-100 rounded w-1/2"></div>
                                        <div className="h-4 bg-gray-100 rounded w-1/3"></div>
                                    </div>
                                ))
                            ) : expenses.length === 0 ? (
                                <div className="p-12 text-center text-gray-500">
                                    <DollarSign className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                    <p>No expenses found</p>
                                </div>
                            ) : (
                                expenses.map((expense) => (
                                    <div key={expense._id} className="p-4 flex flex-col gap-3 relative hover:bg-gray-50/50 transition-colors">
                                        <div className="flex justify-between items-start pr-8">
                                            <div className="flex flex-col gap-1">
                                                <h3 className="text-sm font-bold text-gray-900 leading-tight">{expense.title}</h3>
                                                {expense.notes && <div className="text-xs text-gray-500 line-clamp-2 pr-4">{expense.notes}</div>}
                                            </div>
                                        </div>

                                        <div className="absolute top-4 right-2 dropdown-trigger">
                                            <button
                                                onClick={() => setActiveDropdown(activeDropdown === expense._id ? null : expense._id)}
                                                className="p-1.5 text-gray-400 hover:text-blue-900 hover:bg-blue-50 rounded-lg transition-all"
                                            >
                                                <MoreVertical className="w-5 h-5 shrink-0" />
                                            </button>
                                            {activeDropdown === expense._id && (
                                                <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-100 rounded-xl shadow-xl z-50 py-1 overflow-hidden font-medium">
                                                    <PermissionGate resource="expenses" action="edit">
                                                        <button onClick={() => { openModal(expense); setActiveDropdown(null); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50 transition-colors">
                                                            <Edit className="w-4 h-4 text-blue-600" /> Edit Details
                                                        </button>
                                                    </PermissionGate>
                                                    <div className="h-px bg-gray-100 my-1" />
                                                    <PermissionGate resource="expenses" action="delete">
                                                        <button onClick={() => { handleDelete(expense._id); setActiveDropdown(null); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors">
                                                            <Trash2 className="w-4 h-4" /> Delete Expense
                                                        </button>
                                                    </PermissionGate>
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex flex-wrap items-center gap-2 mt-1 -mb-1">
                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-gray-50 text-gray-600 border border-gray-200">
                                                <Tag className="w-3 h-3 mr-1 shrink-0" />
                                                {expense.category}
                                            </span>
                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-blue-50 text-blue-700 border border-blue-200">
                                                {expense.paymentMethod}
                                            </span>
                                        </div>

                                        <div className="flex justify-between items-center bg-gray-50/80 rounded-xl p-3 border border-gray-100 mt-2">
                                            <div className="flex items-center gap-1.5 text-xs text-gray-600 font-medium">
                                                <Calendar className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                                {formatDate(expense.date, settings.timezone)}
                                            </div>
                                            <div className="font-black text-red-600 text-[13px]">
                                                {settings.symbol}{expense.amount.toLocaleString('id-ID')}
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
                            Showing <span className="text-gray-900">{expenses.length}</span> of <span className="text-gray-900">{pagination.total}</span> records
                        </div>
                        <div className="flex items-center justify-center gap-2 w-full sm:w-auto">
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

            {/* Expense Modal */}
            <Modal isOpen={isModalOpen} onClose={closeModal} title={editingExpense ? "Edit Expense" : "Add Expense"}>
                <form onSubmit={handleSubmit}>
                    <FormInput
                        label="Expense Title"
                        required
                        value={formData.title}
                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                        placeholder="e.g. Monthly Rent"
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <FormInput
                            label={`Amount (${settings.symbol})`}
                            type="number"
                            required
                            value={formData.amount}
                            onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) })}
                            min="0"
                            step="0.01"
                        />
                        <SearchableSelect
                            label="Category"
                            required
                            value={formData.category}
                            onChange={(val) => setFormData({ ...formData, category: val })}
                            options={EXPENSE_CATEGORIES.map(cat => ({ value: cat, label: cat }))}
                        />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <FormInput
                            label="Date"
                            type="date"
                            required
                            value={formData.date}
                            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                        />
                        <FormSelect
                            label="Payment Method"
                            value={formData.paymentMethod}
                            onChange={(e: any) => setFormData({ ...formData, paymentMethod: e.target.value })}
                            options={[
                                { value: "Cash", label: "Cash" },
                                { value: "Card", label: "Card" },
                                { value: "Bank Transfer", label: "Bank Transfer" },
                                { value: "Cheque", label: "Cheque" }
                            ]}
                        />
                    </div>
                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes</label>
                        <textarea
                            value={formData.notes}
                            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                            rows={3}
                            placeholder="Additional notes (optional)"
                            className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-900 focus:border-transparent text-sm resize-none"
                        />
                    </div>
                    <div className="flex flex-col-reverse sm:flex-row justify-end sm:space-x-3 gap-3 sm:gap-0 mt-6">
                        <button type="button" onClick={closeModal} className="w-full sm:w-auto px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-bold transition-colors text-center">Cancel</button>
                        <FormButton type="submit" loading={submitting} className="w-full sm:w-auto text-center justify-center">
                            {editingExpense ? "Update Expense" : "Add Expense"}
                        </FormButton>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
