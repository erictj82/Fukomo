"use client";


import { useParams } from "next/navigation";
import { useState } from "react";
import { useTenantRouter } from "@/hooks/useTenantRouter";
import TenantLink from '@/components/TenantLink';
import { ArrowLeft, Shield } from "lucide-react";
import FormInput, { FormButton } from "@/components/dashboard/FormInput";

// Resources configuration
const RESOURCES = [
    { key: "appointments", label: "Appointments" },
    { key: "pos", label: "POS / Billing" },
    { key: "services", label: "Services" },
    { key: "products", label: "Products / Inventory" },
    { key: "purchases", label: "Purchases" },
    { key: "usageLogs", label: "Usage Logs" },
    { key: "staff", label: "Staff Management" },
    { key: "staffSlots", label: "Staff Availability Slots" },
    { key: "customers", label: "Customers" },
    { key: "suppliers", label: "Suppliers" },
    { key: "payroll", label: "Payroll & Commission" },
    { key: "expenses", label: "Expenses" },
    { key: "reports", label: "Reports" },
    { key: "users", label: "User Management" },
    { key: "roles", label: "Role Management" },
    { key: "invoices", label: "Invoices & Billing" },
    { key: "corrections", label: "Correction Requests", createLabel: "REQUEST_CORRECTION", editLabel: "APPROVE_CORRECTION" },
    { key: "deposits", label: "Deposits / Down Payment" },
    { key: "vouchers", label: "Vouchers & Promotions" },
    { key: "bundles", label: "Service Bundles" },
    { key: "packages", label: "Treatment Packages" },
    { key: "membership", label: "Premium Membership" },
    { key: "waTemplates", label: "WA Templates" },
    { key: "calendarView", label: "Calendar View" },
    { key: "aiReports", label: "AI Powered Reports", type: 'boolean' },
    { key: "activityLogs", label: "Activity / Security Audit Logs" },
];

export default function NewRolePage() {
  const params = useParams();
  const slug = params.slug as string;
    const router = useTenantRouter();

    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    // Form State
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");

    // Permissions State
    const [permissions, setPermissions] = useState<any>({
        dashboard: { view: true },
        settings: { view: false, edit: false },
        ...RESOURCES.reduce((acc, res) => ({
            ...acc,
            [res.key]: { view: 'none', create: false, edit: false, delete: false }
        }), {})
    });

    const handlePermissionChange = (resource: string, field: string, value: any) => {
        setPermissions((prev: any) => ({
            ...prev,
            [resource]: {
                ...prev[resource],
                [field]: value
            }
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setSaving(true);

        try {
            const res = await fetch(`/api/roles`, {
                method: "POST",
                headers: { "x-store-slug": slug, "Content-Type": "application/json" },
                body: JSON.stringify({
                    name,
                    description,
                    permissions
                }),
            });

            const data = await res.json();

            if (data.success) {
                router.push("/roles");
            } else {
                setError(data.error || "Failed to create role");
            }
        } catch (error) {
            console.error("Error creating role:", error);
            setError("An error occurred while creating role");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="p-6 max-w-5xl mx-auto">
            <div className="flex items-center gap-4 mb-6">
                <TenantLink href="/roles" className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                    <ArrowLeft className="w-5 h-5 text-gray-600" />
                </TenantLink>
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Create New Role</h1>
                    <p className="text-gray-500">Define access permissions for this role</p>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Basic Info */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-4">
                        <Shield className="w-5 h-5 text-blue-900" />
                        Role Details
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormInput
                            label="Role Name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. Sales Manager"
                            required
                        />
                        <FormInput
                            label="Description"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Brief description of responsibilities"
                        />
                    </div>
                </div>

                {/* Permissions Matrix */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="p-6 border-b border-gray-200 bg-gray-50">
                        <h2 className="text-lg font-semibold text-gray-900">Access Permissions</h2>
                        <p className="text-sm text-gray-500">Configure what users with this role can see and do.</p>
                    </div>

                    {/* Special Modules: Dashboard & Settings */}
                    <div className="p-6 border-b border-gray-200 grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                            <h3 className="font-semibold text-blue-900 mb-2">Dashboard</h3>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={permissions.dashboard?.view}
                                    onChange={(e) => handlePermissionChange('dashboard', 'view', e.target.checked)}
                                    className="w-4 h-4 text-blue-900 rounded focus:ring-blue-900"
                                />
                                <span className="text-sm text-gray-700">Can view Dashboard</span>
                            </label>
                        </div>

                        <div className="bg-purple-50 p-4 rounded-lg border border-purple-100">
                            <h3 className="font-semibold text-purple-900 mb-2">System Settings</h3>
                            <div className="flex gap-4">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={permissions.settings?.view}
                                        onChange={(e) => handlePermissionChange('settings', 'view', e.target.checked)}
                                        className="w-4 h-4 text-purple-900 rounded focus:ring-purple-900"
                                    />
                                    <span className="text-sm text-gray-700">View</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={permissions.settings?.edit}
                                        onChange={(e) => handlePermissionChange('settings', 'edit', e.target.checked)}
                                        className="w-4 h-4 text-purple-900 rounded focus:ring-purple-900"
                                    />
                                    <span className="text-sm text-gray-700">Edit</span>
                                </label>
                            </div>
                        </div>
                    </div>

                    {/* Standard Resources Table */}
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-gray-50 border-b border-gray-200">
                                <tr>
                                    <th className="px-6 py-3 text-sm font-semibold text-gray-700 w-1/4">Feature</th>
                                    <th className="px-6 py-3 text-sm font-semibold text-gray-700 w-1/3">View Scope</th>
                                    <th className="px-6 py-3 text-sm font-semibold text-gray-700">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {RESOURCES.map((res) => (
                                    <tr key={res.key} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4 font-medium text-gray-900">
                                            {res.label}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex gap-4">
                                                <label className="flex items-center gap-2 cursor-pointer group">
                                                    <input
                                                        type="radio"
                                                        name={`${res.key}-view`}
                                                        checked={permissions[res.key]?.view === 'none'}
                                                        onChange={() => handlePermissionChange(res.key, 'view', 'none')}
                                                        className="w-4 h-4 text-blue-900 focus:ring-blue-900 border-gray-300"
                                                    />
                                                    <span className="text-sm text-gray-600 group-hover:text-gray-900">None</span>
                                                </label>
                                                <label className="flex items-center gap-2 cursor-pointer group">
                                                    <input
                                                        type="radio"
                                                        name={`${res.key}-view`}
                                                        checked={permissions[res.key]?.view === 'own'}
                                                        onChange={() => handlePermissionChange(res.key, 'view', 'own')}
                                                        className="w-4 h-4 text-blue-900 focus:ring-blue-900 border-gray-300"
                                                    />
                                                    <span className="text-sm text-gray-600 group-hover:text-gray-900">Own Only</span>
                                                </label>
                                                <label className="flex items-center gap-2 cursor-pointer group">
                                                    <input
                                                        type="radio"
                                                        name={`${res.key}-view`}
                                                        checked={permissions[res.key]?.view === 'all'}
                                                        onChange={() => handlePermissionChange(res.key, 'view', 'all')}
                                                        className="w-4 h-4 text-blue-900 focus:ring-blue-900 border-gray-300"
                                                    />
                                                    <span className="text-sm text-gray-600 group-hover:text-gray-900">All</span>
                                                </label>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex gap-6">
                                                <label className="flex items-center gap-2 cursor-pointer group">
                                                    <input
                                                        type="checkbox"
                                                        checked={permissions[res.key]?.create}
                                                        onChange={(e) => handlePermissionChange(res.key, 'create', e.target.checked)}
                                                        className="w-4 h-4 text-green-600 rounded focus:ring-green-600 border-gray-300"
                                                    />
                                                    <span className="text-sm text-gray-600 group-hover:text-gray-900">{(res as any).createLabel || "Create"}</span>
                                                </label>
                                                <label className="flex items-center gap-2 cursor-pointer group">
                                                    <input
                                                        type="checkbox"
                                                        checked={permissions[res.key]?.edit}
                                                        onChange={(e) => handlePermissionChange(res.key, 'edit', e.target.checked)}
                                                        className="w-4 h-4 text-amber-600 rounded focus:ring-amber-600 border-gray-300"
                                                    />
                                                    <span className="text-sm text-gray-600 group-hover:text-gray-900">{(res as any).editLabel || "Edit"}</span>
                                                </label>
                                                <label className="flex items-center gap-2 cursor-pointer group">
                                                    <input
                                                        type="checkbox"
                                                        checked={permissions[res.key]?.delete}
                                                        onChange={(e) => handlePermissionChange(res.key, 'delete', e.target.checked)}
                                                        className="w-4 h-4 text-red-600 rounded focus:ring-red-600 border-gray-300"
                                                    />
                                                    <span className="text-sm text-gray-600 group-hover:text-gray-900">Delete</span>
                                                </label>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {error && (
                    <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                        {error}
                    </div>
                )}

                <div className="flex justify-end gap-3">
                    <TenantLink
                        href="/roles"
                        className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                        Cancel
                    </TenantLink>
                    <FormButton
                        type="submit"
                        loading={saving}
                    >
                        Create Role
                    </FormButton>
                </div>
            </form>
        </div>
    );
}