
"use client";


import { useParams } from "next/navigation";
import { useState, useEffect } from "react";
import { Plus, Edit, Trash2, Search, User, Phone, Mail, Scissors, ChevronLeft, ChevronRight, MoreVertical, Filter, FileText } from "lucide-react";
import Modal from "@/components/dashboard/Modal";
import FormInput, { FormButton } from "@/components/dashboard/FormInput";
import PermissionGate from "@/components/PermissionGate";
import { useSettings } from "@/components/providers/SettingsProvider";

interface Staff {
    _id: string;
    name: string;
    email?: string;
    phone?: string;
    designation?: string;
    commissionRate: number;
    salary: number;
    skills: string[];
    isActive: boolean;
}

export default function StaffPage() {
  const params = useParams();
  const slug = params.slug as string;
    const { settings } = useSettings();
    const [staffMembers, setStaffMembers] = useState<Staff[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
    const [search, setSearch] = useState("");
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

    // Form State
    const [formData, setFormData] = useState({
        name: "",
        email: "",
        phone: "",
        designation: "",
        commissionRate: 0,
        salary: 0,
        skills: ""
    });

    useEffect(() => {
        fetchStaff();
    }, [search, page]);

    const fetchStaff = async () => {
        setLoading(true);
        try {
            const query = new URLSearchParams({
                page: page.toString(),
                limit: "10",
                search
            });
            const res = await fetch(`/api/staff?${query}`, { headers: { "x-store-slug": slug } });
            const data = await res.json();
            if (data.success) {
                setStaffMembers(data.data);
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
            const payload = {
                ...formData,
                skills: formData.skills.split(",").map(s => s.trim()).filter(Boolean)
            };

            const url = editingStaff ? `/api/staff/${editingStaff._id}` : "/api/staff";
            const res = await fetch(url, {
                method: editingStaff ? "PUT" : "POST",
                headers: { "x-store-slug": slug, "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (data.success) {
                fetchStaff();
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
        if (!confirm("Remove this staff member?")) return;
        const res = await fetch(`/api/staff/${id}`, { headers: { "x-store-slug": slug }, method: "DELETE" });
        if ((await res.json()).success) fetchStaff();
    };

    const openModal = (staff?: Staff) => {
        if (staff) {
            setEditingStaff(staff);
            setFormData({
                name: staff.name,
                email: staff.email || "",
                phone: staff.phone || "",
                designation: staff.designation || "",
                commissionRate: staff.commissionRate,
                salary: staff.salary || 0,
                skills: staff.skills.join(", ")
            });
        } else {
            setEditingStaff(null);
            setFormData({ name: "", email: "", phone: "", designation: "", commissionRate: 0, salary: 0, skills: "" });
        }
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingStaff(null);
    };

    return (
        <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
            <div className="max-w-7xl mx-auto space-y-6">
                {/* Header Section */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Staff Management</h1>
                        <p className="text-sm text-gray-500">Manage beauticians, employees and their access</p>
                    </div>
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                        <PermissionGate resource="staff" action="create">
                            <button
                                onClick={() => openModal()}
                                className="w-full sm:w-auto px-4 py-2 bg-blue-900 text-white rounded-lg hover:bg-blue-800 transition-all flex items-center justify-center gap-2 shadow-sm font-semibold text-sm"
                            >
                                <Plus className="w-4 h-4 shrink-0" />
                                Add Staff
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
                                placeholder="Search by name, email or phone..."
                                className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900 transition-all text-sm"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                        <div className="flex items-center gap-3 w-full md:w-auto">
                            <button
                                onClick={() => { setSearch(""); setPage(1); }}
                                className="text-gray-500 hover:text-gray-700 font-medium text-sm px-2"
                            >
                                Reset
                            </button>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 hidden md:table">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Staff</th>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Contact</th>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Role & Skills</th>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Salary</th>
                                    <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-100">
                                {loading && staffMembers.length === 0 ? (
                                    Array.from({ length: 5 }).map((_, i) => (
                                        <tr key={i} className="animate-pulse">
                                            <td colSpan={5} className="px-6 py-4"><div className="h-4 bg-gray-100 rounded"></div></td>
                                        </tr>
                                    ))
                                ) : staffMembers.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                                            <User className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                            <p>No staff members found</p>
                                        </td>
                                    </tr>
                                ) : (
                                    staffMembers.map((staff) => (
                                        <tr key={staff._id} className="hover:bg-gray-50/50 transition-colors">
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="flex items-center gap-3">
                                                    <div className="p-2 bg-purple-50 rounded-lg">
                                                        <User className="w-4 h-4 text-purple-600" />
                                                    </div>
                                                    <div>
                                                        <span className="text-sm font-bold text-gray-900">{staff.name}</span>
                                                        <div className="text-[10px] text-gray-400 font-medium uppercase">{staff.designation || "Staff"}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="space-y-1">
                                                    {staff.email && (
                                                        <div className="flex items-center gap-1.5 text-xs text-gray-600">
                                                            <Mail className="w-3 h-3 text-gray-400" />
                                                            {staff.email}
                                                        </div>
                                                    )}
                                                    {staff.phone && (
                                                        <div className="flex items-center gap-1.5 text-xs text-gray-600">
                                                            <Phone className="w-3 h-3 text-gray-400" />
                                                            {staff.phone}
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex flex-wrap gap-1 max-w-[200px]">
                                                    {staff.skills?.slice(0, 3).map((skill, i) => (
                                                        <span key={i} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-100">
                                                            {skill}
                                                        </span>
                                                    ))}
                                                    {staff.skills?.length > 3 && (
                                                        <span className="text-[10px] text-gray-500 font-medium px-1.5 py-0.5">+{staff.skills.length - 3}</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className="text-sm font-bold text-gray-900">{settings.symbol}{staff.salary?.toLocaleString('id-ID') || 0}</span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                                                <div className="relative flex justify-end dropdown-trigger">
                                                    <button
                                                        onClick={() => setActiveDropdown(activeDropdown === staff._id ? null : staff._id)}
                                                        className="p-2 text-gray-400 hover:text-blue-900 hover:bg-blue-50 rounded-lg transition-all"
                                                    >
                                                        <MoreVertical className="w-5 h-5" />
                                                    </button>

                                                    {activeDropdown === staff._id && (
                                                        <div className="absolute right-0 mt-10 w-48 bg-white border border-gray-100 rounded-xl shadow-xl z-50 py-1 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 text-left">
                                                            <PermissionGate resource="staff" action="edit">
                                                                <button
                                                                    onClick={() => {
                                                                        openModal(staff);
                                                                        setActiveDropdown(null);
                                                                    }}
                                                                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50 transition-colors"
                                                                >
                                                                    <Edit className="w-4 h-4 text-blue-600" />
                                                                    Edit Details
                                                                </button>
                                                            </PermissionGate>
                                                            <div className="h-px bg-gray-100 my-1" />
                                                            <PermissionGate resource="staff" action="delete">
                                                                <button
                                                                    onClick={() => {
                                                                        handleDelete(staff._id);
                                                                        setActiveDropdown(null);
                                                                    }}
                                                                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                                                                >
                                                                    <Trash2 className="w-4 h-4" />
                                                                    Delete Staff
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

                        {/* Mobile Card View (Staff) */}
                        <div className="md:hidden flex flex-col divide-y divide-gray-100">
                            {loading && staffMembers.length === 0 ? (
                                Array.from({ length: 5 }).map((_, i) => (
                                    <div key={i} className="p-4 animate-pulse space-y-3">
                                        <div className="h-4 bg-gray-100 rounded w-1/2"></div>
                                        <div className="h-4 bg-gray-100 rounded w-1/3"></div>
                                    </div>
                                ))
                            ) : staffMembers.length === 0 ? (
                                <div className="p-12 text-center text-gray-500">
                                    <User className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                    <p>No staff members found</p>
                                </div>
                            ) : (
                                staffMembers.map((staff) => (
                                    <div key={staff._id} className="p-4 flex flex-col gap-3 relative hover:bg-gray-50/50 transition-colors">
                                        <div className="flex justify-between items-start pr-8">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center shrink-0">
                                                    <User className="w-5 h-5 text-purple-600" />
                                                </div>
                                                <div>
                                                    <h3 className="text-sm font-bold text-gray-900 leading-tight">{staff.name}</h3>
                                                    <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{staff.designation || "Staff"}</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="absolute top-4 right-2 dropdown-trigger">
                                            <button
                                                onClick={() => setActiveDropdown(activeDropdown === staff._id ? null : staff._id)}
                                                className="p-1.5 text-gray-400 hover:text-blue-900 hover:bg-blue-50 rounded-lg transition-all"
                                            >
                                                <MoreVertical className="w-5 h-5 shrink-0" />
                                            </button>
                                            {activeDropdown === staff._id && (
                                                <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-100 rounded-xl shadow-xl z-50 py-1 overflow-hidden font-medium">
                                                    <PermissionGate resource="staff" action="edit">
                                                        <button onClick={() => { openModal(staff); setActiveDropdown(null); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50 transition-colors">
                                                            <Edit className="w-4 h-4 text-blue-600" /> Edit Details
                                                        </button>
                                                    </PermissionGate>
                                                    <div className="h-px bg-gray-100 my-1" />
                                                    <PermissionGate resource="staff" action="delete">
                                                        <button onClick={() => { handleDelete(staff._id); setActiveDropdown(null); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors">
                                                            <Trash2 className="w-4 h-4" /> Delete Staff
                                                        </button>
                                                    </PermissionGate>
                                                </div>
                                            )}
                                        </div>

                                        <div className="space-y-1">
                                            {staff.phone && (
                                                <div className="flex items-center gap-2 text-xs text-gray-600">
                                                    <Phone className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                                    {staff.phone}
                                                </div>
                                            )}
                                            {staff.email && (
                                                <div className="flex items-center gap-2 text-xs text-gray-600">
                                                    <Mail className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                                    <span className="truncate">{staff.email}</span>
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex flex-wrap gap-1 mt-1">
                                            {staff.skills?.map((skill, i) => (
                                                <span key={i} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-100">
                                                    {skill}
                                                </span>
                                            ))}
                                            {staff.skills?.length === 0 && (
                                                <span className="text-[10px] text-gray-400 italic">No skills listed</span>
                                            )}
                                        </div>

                                        <div className="grid grid-cols-1 gap-2 text-sm bg-gray-50/80 rounded-xl p-3 border border-gray-100 mt-2">
                                            <div>
                                                <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-1">Salary</p>
                                                <span className="font-bold text-gray-900">{settings.symbol}{staff.salary?.toLocaleString('id-ID') || 0}</span>
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
                            Showing <span className="text-gray-900">{staffMembers.length}</span> of <span className="text-gray-900">{pagination.total}</span> staff members
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

            {/* Staff Modal */}
            <Modal isOpen={isModalOpen} onClose={closeModal} title={editingStaff ? "Edit Staff" : "Add Staff Member"}>
                <form onSubmit={handleSubmit}>
                    <FormInput
                        label="Full Name"
                        required
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="John Doe"
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                        <FormInput
                            label="Email"
                            type="email"
                            value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        />
                        <FormInput
                            label="Phone"
                            type="tel"
                            value={formData.phone}
                            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                        <FormInput
                            label="Designation"
                            value={formData.designation}
                            onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                            placeholder="e.g. Senior Stylist"
                        />
                        <FormInput
                            label={`Basic Salary (${settings.symbol})`}
                            type="number"
                            min="0"
                            value={formData.salary}
                            onChange={(e) => setFormData({ ...formData, salary: parseFloat(e.target.value) })}
                        />
                    </div>

                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Skills (comma separated)</label>
                        <input
                            type="text"
                            value={formData.skills}
                            onChange={(e) => setFormData({ ...formData, skills: e.target.value })}
                            placeholder="Hair Cut, Facial, Makeup"
                            className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-900 focus:border-transparent text-sm"
                        />
                    </div>

                    <div className="flex flex-col-reverse sm:flex-row justify-end sm:space-x-3 gap-3 sm:gap-0 mt-6">
                        <button type="button" onClick={closeModal} className="w-full sm:w-auto px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 text-center font-bold">Cancel</button>
                        <FormButton type="submit" loading={submitting} className="w-full sm:w-auto text-center justify-center">
                            {editingStaff ? "Update Staff" : "Add Staff"}
                        </FormButton>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
