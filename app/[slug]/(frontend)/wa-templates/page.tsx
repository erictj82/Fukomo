"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Edit, Plus, Search, Trash2, MessageSquareText } from "lucide-react";
import Modal from "@/components/dashboard/Modal";
import FormInput, { FormButton, FormSelect, FormTextArea } from "@/components/dashboard/FormInput";
import PermissionGate from "@/components/PermissionGate";

interface WaTemplate {
    _id: string;
    name: string;
    message: string;
    templateType?: 'greeting' | 'follow_up';
    isGreetingEnabled?: boolean;
    metaStatus?: 'LOCAL' | 'PENDING' | 'APPROVED' | 'REJECTED';
    metaTemplateName?: string;
    createdAt: string;
}

const SAMPLE_VALUES: Record<string, string> = {
    nama_customer: "Rani Putri",
    nama_service: "Hair Spa",
};

const renderPreview = (message: string) => {
    return message.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key: string) => SAMPLE_VALUES[key] || "");
};

export default function WaTemplatesPage() {
    const params = useParams();
    const slug = params.slug as string;
    const [templates, setTemplates] = useState<WaTemplate[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");

    const [wabaTemplates, setWabaTemplates] = useState<any[]>([]);
    const [wabaLoading, setWabaLoading] = useState(false);
    const [wabaError, setWabaError] = useState<string | null>(null);
    const [isWabaMode, setIsWabaMode] = useState(false);
    const [submittingMetaId, setSubmittingMetaId] = useState<string | null>(null);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState<WaTemplate | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const [formData, setFormData] = useState({
        name: "",
        message: "",
        templateType: "follow_up",
        isGreetingEnabled: false,
        submitToMeta: true,
    });

    const previewMessage = useMemo(() => renderPreview(formData.message), [formData.message]);
    const activeGreetingTemplate = useMemo(
        () => templates.find((template) => template.isGreetingEnabled && (template.templateType === 'greeting' || !template.templateType)),
        [templates]
    );

    useEffect(() => {
        fetchTemplates();
        fetchWabaTemplates();
    }, []);

    const fetchWabaTemplates = async () => {
        setWabaLoading(true);
        setWabaError(null);
        try {
            const res = await fetch(`/api/wa/waba-templates`, { headers: { "x-store-slug": slug } });
            const data = await res.json();
            if (data.success) {
                setIsWabaMode(data.isWaba);
                setWabaTemplates(data.templates || []);
            } else {
                setIsWabaMode(Boolean(data.isWaba));
                if (data.isWaba) setWabaError(data.error);
            }
        } catch (err: any) {
            setWabaError("Gagal mengambil data dari Meta.");
        } finally {
            setWabaLoading(false);
        }
    };

    const fetchTemplates = async () => {
        setLoading(true);
        try {
            const query = new URLSearchParams();
            if (search.trim()) query.append("search", search.trim());

            const res = await fetch(`/api/wa/templates?${query.toString()}`);
            const data = await res.json();
            if (data.success) {
                setTemplates(data.data || []);
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            fetchTemplates();
        }, 300);

        return () => clearTimeout(timer);
    }, [search]);

    const openModal = (template?: WaTemplate) => {
        if (template) {
            setEditingTemplate(template);
            setFormData({
                name: template.name,
                message: template.message,
                templateType: template.templateType || (template.isGreetingEnabled ? 'greeting' : 'follow_up'),
                isGreetingEnabled: Boolean(template.isGreetingEnabled),
                submitToMeta: isWabaMode && template.metaStatus !== 'APPROVED',
            });
        } else {
            setEditingTemplate(null);
            setFormData({
                name: "",
                message: "Halo {{nama_customer}}, terima kasih sudah menggunakan layanan {{nama_service}} di salon kami.",
                templateType: "follow_up",
                isGreetingEnabled: false,
                submitToMeta: isWabaMode,
            });
        }

        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingTemplate(null);
    };

    const handleSubmitToMeta = async (t: WaTemplate) => {
        if (!confirm(`Apakah Anda yakin ingin mengajukan template "${t.name}" ke Meta (WhatsApp Business API)?`)) return;
        setSubmittingMetaId(t._id);
        try {
            const res = await fetch(`/api/wa/templates/${t._id}/submit-meta`, {
                method: "POST",
                headers: { "x-store-slug": slug },
            });
            const data = await res.json();
            if (data.success) {
                alert("✅ " + data.message);
                fetchTemplates();
                fetchWabaTemplates();
            } else {
                alert("❌ Gagal: " + (data.error || "Gagal mengajukan ke Meta"));
            }
        } catch (e: any) {
            alert("❌ Terjadi kesalahan: " + e.message);
        } finally {
            setSubmittingMetaId(null);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);

        try {
            const url = editingTemplate ? `/api/wa/templates/${editingTemplate._id}` : "/api/wa/templates";
            const method = editingTemplate ? "PUT" : "POST";

            const res = await fetch(url, {
                method,
                headers: { "x-store-slug": slug, "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...formData,
                    isGreetingEnabled: formData.templateType === 'greeting' ? formData.isGreetingEnabled : false,
                }),
            });

            const data = await res.json();
            if (!data.success) {
                alert(data.error || "Gagal menyimpan template");
                return;
            }

            closeModal();
            await fetchTemplates();
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Hapus template ini?")) return;

        const res = await fetch(`/api/wa/templates/${id}`, { headers: { "x-store-slug": slug }, method: "DELETE" });
        const data = await res.json();
        if (!data.success) {
            alert(data.error || "Gagal menghapus template");
            return;
        }

        await fetchTemplates();
    };

    const handleToggleGreeting = async (template: WaTemplate) => {
        const res = await fetch(`/api/wa/templates/${template._id}`, {
            method: "PUT",
            headers: { "x-store-slug": slug, "Content-Type": "application/json" },
            body: JSON.stringify({
                name: template.name,
                message: template.message,
                templateType: 'greeting',
                isGreetingEnabled: !template.isGreetingEnabled,
            }),
        });

        const data = await res.json();
        if (!data.success) {
            alert(data.error || "Gagal update status greeting");
            return;
        }

        await fetchTemplates();

        if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("wa-greeting-status-changed"));
        }
    };

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Manajemen Template WA</h1>
                    <p className="text-sm text-gray-500">Kelola template pesan WhatsApp untuk greeting dan follow-up otomatis.</p>
                </div>
                <PermissionGate resource="waTemplates" action="create">
                    <button
                        onClick={() => openModal()}
                        className="px-4 py-2 bg-blue-900 text-white rounded-lg hover:bg-blue-800 transition-all flex items-center gap-2 font-semibold"
                    >
                        <Plus className="w-4 h-4" />
                        Template Baru
                    </button>
                </PermissionGate>
            </div>

            {/* WABA Meta Templates Section */}
            {isWabaMode && (
                <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl border border-green-200 shadow-sm p-5 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
                                <h2 className="text-lg font-bold text-gray-900">Template WhatsApp Business API Resmi (Meta)</h2>
                            </div>
                            <p className="text-xs text-gray-600 mt-1">
                                Template resmi di-approve Meta untuk pengingat (reminder) & follow-up di luar window 24 jam.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={fetchWabaTemplates}
                            disabled={wabaLoading}
                            className="px-4 py-2 bg-emerald-700 text-white text-sm font-semibold rounded-lg hover:bg-emerald-800 transition-all shadow-sm disabled:opacity-50 flex items-center gap-2 self-start sm:self-center"
                        >
                            <span>🔄</span>
                            {wabaLoading ? "Menyiapkan..." : "Sync & Cek Status Meta"}
                        </button>
                    </div>

                    {wabaError && (
                        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
                            {wabaError}
                        </div>
                    )}

                    {!wabaLoading && !wabaError && wabaTemplates.length === 0 && (
                        <div className="p-4 bg-white/80 border border-green-100 rounded-lg text-center text-sm text-gray-500">
                            Belum ada template yang ditemukan di akun WABA Meta Anda. Buat template melalui dashboard penyedia WABA Anda, lalu klik Sync.
                        </div>
                    )}

                    {wabaTemplates.length > 0 && (
                        <div className="divide-y divide-gray-200 bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                            {wabaTemplates.map((t: any, idx: number) => {
                                const tName = t.name || t.template_name || `Template #${idx + 1}`;
                                const tStatus = String(t.status || t.template_status || "UNKNOWN").toUpperCase();
                                const tLang = t.language || t.template_language || "id";
                                const tCat = t.category || t.template_category || "UTILITY";
                                
                                const isApproved = tStatus === "APPROVED";
                                const isPending = tStatus === "PENDING" || tStatus === "IN_REVIEW";
                                const isRejected = tStatus === "REJECTED";

                                return (
                                    <div key={t.id || tName} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-gray-50 transition-colors">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2">
                                                <span className="font-semibold text-sm text-gray-900 font-mono">{tName}</span>
                                                <span className="text-[10px] uppercase tracking-wider bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-medium">
                                                    {tLang} • {tCat}
                                                </span>
                                            </div>
                                            {t.components && (
                                                <p className="text-xs text-gray-500 line-clamp-2">
                                                    {t.components.find((c: any) => c.type === 'BODY')?.text || "Template WABA tersinkronisasi dari server Meta"}
                                                </p>
                                            )}
                                        </div>
                                        <div className="flex items-center self-start sm:self-center">
                                            {isApproved ? (
                                                <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-sm">
                                                    <span>🟢</span> Approved (Siap Dipakai!)
                                                </span>
                                            ) : isPending ? (
                                                <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-300 shadow-sm">
                                                    <span>🟡</span> Sedang Ditinjau Meta
                                                </span>
                                            ) : isRejected ? (
                                                <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-rose-100 text-rose-800 border border-rose-300 shadow-sm">
                                                    <span>🔴</span> Ditolak Meta
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full bg-gray-100 text-gray-700">
                                                    <span>⚪</span> {tStatus}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                {activeGreetingTemplate ? (
                    <div className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                        <span className="font-semibold">Greeting aktif saat ini:</span> {activeGreetingTemplate.name}
                    </div>
                ) : (
                    <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        Belum ada template greeting yang aktif. Aktifkan salah satu template untuk auto greeting.
                    </div>
                )}
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                <div className="relative max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Cari template..."
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg"
                    />
                </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                {loading ? (
                    <div className="p-8 text-sm text-gray-500">Memuat template...</div>
                ) : templates.length === 0 ? (
                    <div className="p-10 text-center text-gray-500">
                        <MessageSquareText className="w-10 h-10 mx-auto mb-2 opacity-40" />
                        Belum ada template WA.
                    </div>
                ) : (
                    <div className="divide-y divide-gray-100">
                        {templates.map((template) => (
                            <div key={template._id} className="p-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                <div className="space-y-2 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <h3 className="font-semibold text-gray-900">{template.name}</h3>
                                        <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-full border ${template.templateType === 'greeting' || (!template.templateType && template.isGreetingEnabled)
                                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                                            : 'bg-purple-50 text-purple-700 border-purple-200'
                                            }`}>
                                            {template.templateType === 'greeting' || (!template.templateType && template.isGreetingEnabled) ? 'Greeting' : 'Follow Up'}
                                        </span>
                                        {template.isGreetingEnabled && (
                                            <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                Greeting Active
                                            </span>
                                        )}
                                        {isWabaMode && (
                                            template.metaStatus === 'APPROVED' ? (
                                                <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-sm flex items-center gap-1">
                                                    🟢 Approved Meta (Siap Jalan!)
                                                </span>
                                            ) : template.metaStatus === 'PENDING' ? (
                                                <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 shadow-sm flex items-center gap-1">
                                                    🟡 Menunggu Review Meta
                                                </span>
                                            ) : template.metaStatus === 'REJECTED' ? (
                                                <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300 shadow-sm flex items-center gap-1">
                                                    🔴 Ditolak Meta
                                                </span>
                                            ) : (
                                                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 border border-gray-300 flex items-center gap-1">
                                                    ⚪ Belum ke Meta
                                                </span>
                                            )
                                        )}
                                    </div>
                                    <p className="text-sm text-gray-600 whitespace-pre-wrap">{template.message}</p>
                                    <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg p-2">
                                        <div className="font-semibold text-gray-700 mb-1">Preview:</div>
                                        {renderPreview(template.message)}
                                    </div>
                                </div>
                                <div className="flex gap-2 flex-wrap items-center">
                                    {isWabaMode && template.metaStatus !== 'APPROVED' && (
                                        <PermissionGate resource="waTemplates" action="edit">
                                            <button
                                                type="button"
                                                disabled={submittingMetaId === template._id}
                                                onClick={() => handleSubmitToMeta(template)}
                                                className="px-3 py-2 border border-emerald-400 bg-emerald-50 rounded-lg text-sm font-semibold text-emerald-700 hover:bg-emerald-100 flex items-center gap-1 shadow-sm transition-all disabled:opacity-50"
                                                title="Ajukan persetujuan template ini ke Meta agar bisa dikirim di luar batas 24 jam"
                                            >
                                                <span>🚀</span> {submittingMetaId === template._id ? "Mengajukan..." : "Ajukan ke Meta"}
                                            </button>
                                        </PermissionGate>
                                    )}
                                    {(template.templateType === 'greeting' || (!template.templateType && template.isGreetingEnabled)) && (
                                        <PermissionGate resource="waTemplates" action="edit">
                                            <button
                                                onClick={() => handleToggleGreeting(template)}
                                                className={`px-3 py-2 border rounded-lg text-sm flex items-center gap-1 ${template.isGreetingEnabled
                                                        ? "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                                                        : "border-gray-300 text-gray-700 hover:bg-gray-50"
                                                    }`}
                                            >
                                                <MessageSquareText className="w-4 h-4" /> {template.isGreetingEnabled ? "ON Greeting" : "OFF Greeting"}
                                            </button>
                                        </PermissionGate>
                                    )}
                                    <PermissionGate resource="waTemplates" action="edit">
                                        <button
                                            onClick={() => openModal(template)}
                                            className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-1"
                                        >
                                            <Edit className="w-4 h-4" /> Edit
                                        </button>
                                    </PermissionGate>
                                    <PermissionGate resource="waTemplates" action="delete">
                                        <button
                                            onClick={() => handleDelete(template._id)}
                                            className="px-3 py-2 border border-red-200 rounded-lg text-sm text-red-600 hover:bg-red-50 flex items-center gap-1"
                                        >
                                            <Trash2 className="w-4 h-4" /> Hapus
                                        </button>
                                    </PermissionGate>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <Modal isOpen={isModalOpen} onClose={closeModal} title={editingTemplate ? "Edit Template WA" : "Tambah Template WA"}>
                <form onSubmit={handleSubmit}>
                    <FormInput
                        label="Nama Template"
                        required
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="Contoh: Follow Up 3 Hari"
                    />
                    <FormTextArea
                        label="Isi Pesan"
                        required
                        rows={5}
                        value={formData.message}
                        onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                        placeholder="Gunakan variabel: {{nama_customer}}, {{nama_service}}"
                    />
                    <FormSelect
                        label="Tipe Template"
                        value={formData.templateType}
                        onChange={(e: any) => setFormData({
                            ...formData,
                            templateType: e.target.value,
                            isGreetingEnabled: e.target.value === 'greeting' ? formData.isGreetingEnabled : false,
                        })}
                        options={[
                            { value: "follow_up", label: "Follow Up" },
                            { value: "greeting", label: "Greeting" },
                        ]}
                    />
                    {formData.templateType === 'greeting' && (
                        <label className="flex items-center gap-2 text-sm text-gray-700 mb-4">
                            <input
                                type="checkbox"
                                checked={formData.isGreetingEnabled}
                                onChange={(e) => setFormData({ ...formData, isGreetingEnabled: e.target.checked })}
                            />
                            Gunakan template ini sebagai auto greeting (ON)
                        </label>
                    )}
                    {isWabaMode && (
                        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg mb-4">
                            <label className="flex items-start gap-2 text-sm font-medium text-emerald-900 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={formData.submitToMeta}
                                    onChange={(e) => setFormData({ ...formData, submitToMeta: e.target.checked })}
                                    className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500"
                                />
                                <div>
                                    <span>☑️ Langsung sambungkan & ajukan persetujuan ke server Meta (WABA)</span>
                                    <p className="text-xs font-normal text-emerald-700 mt-0.5">
                                        Saat dicentang, sistem akan mendaftarkan template ini ke server Meta. Setelah diajukan, status akan menjadi 🟡 Pending Review hingga disetujui (🟢 Approved).
                                    </p>
                                </div>
                            </label>
                        </div>
                    )}
                    <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg p-3 mb-4">
                        <div className="font-semibold text-gray-700 mb-1">Preview dengan data contoh:</div>
                        <div className="whitespace-pre-wrap">{previewMessage}</div>
                    </div>

                    <div className="flex justify-end gap-3 mt-6">
                        <button
                            type="button"
                            onClick={closeModal}
                            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                        >
                            Batal
                        </button>
                        <FormButton type="submit" loading={submitting}>
                            {editingTemplate ? "Update" : "Simpan"}
                        </FormButton>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
