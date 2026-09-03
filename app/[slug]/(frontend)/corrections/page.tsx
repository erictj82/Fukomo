"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { usePermission } from "@/hooks/usePermission";
import { Check, ClipboardList, Plus, Replace, Trash2, X } from "lucide-react";
import SearchableSelect from "@/components/dashboard/SearchableSelect";

type Line = { fukomoLineId: string; jobId?: string; serviceId: string; name: string; quantity?: number };
type Candidate = {
    _id: string;
    customerName: string;
    workOrderId?: string;
    workOrderNumber?: string;
    status?: string;
    workSyncStatus?: string;
    lines: Line[];
};
type ServiceOpt = { _id: string; name: string; price?: number };
type Correction = {
    _id: string;
    appointment: string;
    workOrderId?: string;
    workOrderNumber?: string;
    customerName?: string;
    action: "add" | "replace" | "remove";
    fukomoLineId?: string;
    fromServiceName?: string;
    toServiceName?: string;
    reason: string;
    rejectReason?: string;
    status: "pending" | "approved" | "rejected";
    requestedByName?: string;
    requestedAt?: string;
    reviewedByName?: string;
    reviewedAt?: string;
};

const ACTION_LABEL = { add: "Tambah layanan", replace: "Ganti layanan", remove: "Hapus layanan" };

export default function CorrectionsPage() {
    const params = useParams();
    const slug = (params.slug as string) || "pusat";
    const headers = useMemo(() => ({ "x-store-slug": slug, "Content-Type": "application/json" }), [slug]);
    const { canCreate, canEdit } = usePermission();
    const canRequest = canCreate("corrections");
    const canApprove = canEdit("corrections");

    const [tab, setTab] = useState<"pending" | "all">("pending");
    const [rows, setRows] = useState<Correction[]>([]);
    const [candidates, setCandidates] = useState<Candidate[]>([]);
    const [services, setServices] = useState<ServiceOpt[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [busyId, setBusyId] = useState("");
    const [rejectId, setRejectId] = useState("");
    const [rejectReason, setRejectReason] = useState("");

    const [appointmentId, setAppointmentId] = useState("");
    const [action, setAction] = useState<"add" | "replace" | "remove">("replace");
    const [fukomoLineId, setFukomoLineId] = useState("");
    const [toServiceId, setToServiceId] = useState("");
    const [reason, setReason] = useState("");
    const [formError, setFormError] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const selected = candidates.find((c) => c._id === appointmentId);

    const loadRows = useCallback(async () => {
        const qs = tab === "pending" ? "?status=pending" : "";
        const res = await fetch(`/api/corrections${qs}`, { headers });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || "Gagal memuat request");
        setRows(data.data || []);
    }, [headers, tab]);

    const loadCandidates = useCallback(async () => {
        if (!canRequest) return;
        const res = await fetch(`/api/corrections/candidates`, { headers });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || "Gagal memuat WO");
        setCandidates(data.data || []);
        setServices(data.services || []);
    }, [headers, canRequest]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            setError("");
            try {
                await Promise.all([loadRows(), loadCandidates()]);
            } catch (e: unknown) {
                if (!cancelled) setError(e instanceof Error ? e.message : "Gagal memuat");
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [loadRows, loadCandidates]);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError("");
        if (!appointmentId) return setFormError("Pilih WO / appointment.");
        if (!reason.trim()) return setFormError("Alasan wajib diisi.");
        if (action !== "add" && !fukomoLineId) return setFormError("Pilih layanan yang ingin dikoreksi.");
        if (action !== "remove" && !toServiceId) return setFormError("Pilih layanan baru.");
        const line = selected?.lines.find((l) => l.fukomoLineId === fukomoLineId);
        const svc = services.find((s) => s._id === toServiceId);
        setSubmitting(true);
        try {
            const res = await fetch("/api/corrections", {
                method: "POST",
                headers,
                body: JSON.stringify({
                    appointmentId,
                    action,
                    fukomoLineId: action === "add" ? undefined : fukomoLineId,
                    jobId: line?.jobId,
                    fromServiceId: line?.serviceId,
                    fromServiceName: line?.name,
                    toServiceId: action === "remove" ? undefined : toServiceId,
                    toServiceName: svc?.name,
                    reason: reason.trim(),
                }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.error || "Gagal submit");
            setReason("");
            setFukomoLineId("");
            setToServiceId("");
            await loadRows();
        } catch (err: unknown) {
            setFormError(err instanceof Error ? err.message : "Gagal submit");
        } finally {
            setSubmitting(false);
        }
    };

    const approve = async (id: string) => {
        setBusyId(id);
        setError("");
        try {
            const res = await fetch(`/api/corrections/${id}/approve`, { method: "POST", headers });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.error || "Gagal approve");
            await loadRows();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Gagal approve");
        } finally {
            setBusyId("");
        }
    };

    const reject = async (id: string) => {
        setBusyId(id);
        setError("");
        try {
            const res = await fetch(`/api/corrections/${id}/reject`, {
                method: "POST",
                headers,
                body: JSON.stringify({ reason: rejectReason }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.error || "Gagal reject");
            setRejectId("");
            setRejectReason("");
            await loadRows();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Gagal reject");
        } finally {
            setBusyId("");
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Correction Requests</h1>
                <p className="text-sm text-gray-500 mt-1">
                    Koreksi layanan WO yang sudah selesai. Kasir hanya request; Manager/Owner yang approve.
                    History lama tidak dihapus.
                </p>
            </div>

            {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}

            {canRequest && (
                <form onSubmit={submit} className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
                    <div className="flex items-center gap-2 font-semibold text-gray-900">
                        <Plus className="w-4 h-4" /> Request Correction
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <SearchableSelect
                            label="WO / Customer"
                            value={appointmentId}
                            onChange={(v) => {
                                setAppointmentId(v);
                                setFukomoLineId("");
                            }}
                            placeholder="Pilih WO selesai"
                            options={candidates.map((c) => ({
                                value: String(c._id),
                                label: `${c.customerName || "Customer"} · WO #${c.workOrderNumber || "—"}`,
                            }))}
                        />
                        <label className="text-sm space-y-1">
                            <span className="font-medium text-gray-700">Jenis perubahan</span>
                            <select className="w-full border rounded-lg px-3 py-2 text-sm" value={action} onChange={(e) => setAction(e.target.value as "add" | "replace" | "remove")}>
                                <option value="replace">Ganti layanan</option>
                                <option value="add">Tambah layanan</option>
                                <option value="remove">Hapus layanan</option>
                            </select>
                        </label>
                        {action !== "add" && (
                            <SearchableSelect
                                label="Layanan yang dikoreksi"
                                value={fukomoLineId}
                                onChange={setFukomoLineId}
                                placeholder="Pilih layanan yang dikerjakan"
                                options={(selected?.lines || []).map((l) => ({
                                    value: l.fukomoLineId,
                                    label: l.name,
                                }))}
                            />
                        )}
                        {action !== "remove" && (
                            <SearchableSelect
                                label={action === "add" ? "Layanan baru" : "Ganti menjadi"}
                                value={toServiceId}
                                onChange={setToServiceId}
                                placeholder="Cari / pilih layanan"
                                options={services.map((s) => ({
                                    value: s._id,
                                    label: s.name,
                                }))}
                            />
                        )}
                    </div>
                    <label className="text-sm space-y-1 block">
                        <span className="font-medium text-gray-700">Alasan <span className="text-red-500">*</span></span>
                        <textarea
                            className="w-full border rounded-lg px-3 py-2 text-sm min-h-[80px]"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="Wajib — jelaskan kenapa layanan perlu dikoreksi"
                        />
                    </label>
                    {formError && <div className="text-sm text-red-600">{formError}</div>}
                    <button
                        type="submit"
                        disabled={submitting}
                        className="px-4 py-2 rounded-lg bg-blue-900 text-white text-sm font-medium disabled:opacity-50"
                    >
                        {submitting ? "Mengirim..." : "Submit Request"}
                    </button>
                </form>
            )}

            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="flex items-center gap-2 px-5 py-3 border-b">
                    <ClipboardList className="w-4 h-4 text-gray-500" />
                    <button className={`text-sm font-medium ${tab === "pending" ? "text-blue-900" : "text-gray-500"}`} onClick={() => setTab("pending")}>Pending</button>
                    <span className="text-gray-300">|</span>
                    <button className={`text-sm font-medium ${tab === "all" ? "text-blue-900" : "text-gray-500"}`} onClick={() => setTab("all")}>Semua</button>
                </div>
                {loading ? (
                    <div className="p-6 text-sm text-gray-500">Memuat...</div>
                ) : rows.length === 0 ? (
                    <div className="p-6 text-sm text-gray-500">Belum ada correction request.</div>
                ) : (
                    <div className="divide-y">
                        {rows.map((r) => (
                            <div key={r._id} className="p-5 space-y-2">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <div className="font-semibold text-gray-900">{r.customerName || "Customer"} · WO #{r.workOrderNumber || "—"}</div>
                                        <div className="text-sm text-gray-600 mt-0.5">
                                            {ACTION_LABEL[r.action]} · {r.fromServiceName || "—"} → {r.toServiceName || (r.action === "remove" ? "(hapus)" : "—")}
                                        </div>
                                        <div className="text-sm text-gray-500 mt-1">Alasan: {r.reason}</div>
                                        <div className="text-xs text-gray-400 mt-1">
                                            Request oleh {r.requestedByName || "—"} {r.requestedAt ? `· ${new Date(r.requestedAt).toLocaleString("id-ID")}` : ""}
                                            {r.reviewedByName && <> · {r.status} oleh {r.reviewedByName}</>}
                                            {r.rejectReason && <> · Catatan reject: {r.rejectReason}</>}
                                        </div>
                                    </div>
                                    <span className={`text-xs font-semibold uppercase px-2 py-1 rounded ${
                                        r.status === "pending" ? "bg-amber-50 text-amber-800" :
                                        r.status === "approved" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"
                                    }`}>{r.status}</span>
                                </div>
                                {canApprove && r.status === "pending" && (
                                    <div className="flex flex-wrap gap-2 items-center">
                                        <button
                                            onClick={() => approve(r._id)}
                                            disabled={busyId === r._id}
                                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-700 text-white text-xs font-medium disabled:opacity-50"
                                        >
                                            <Check className="w-3.5 h-3.5" /> Approve
                                        </button>
                                        {rejectId === r._id ? (
                                            <>
                                                <input
                                                    className="border rounded-lg px-2 py-1 text-xs"
                                                    placeholder="Alasan reject (opsional)"
                                                    value={rejectReason}
                                                    onChange={(e) => setRejectReason(e.target.value)}
                                                />
                                                <button onClick={() => reject(r._id)} disabled={busyId === r._id} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-700 text-white text-xs">
                                                    <Trash2 className="w-3.5 h-3.5" /> Reject
                                                </button>
                                                <button onClick={() => { setRejectId(""); setRejectReason(""); }} className="text-xs text-gray-500"><X className="w-3.5 h-3.5" /></button>
                                            </>
                                        ) : (
                                            <button onClick={() => setRejectId(r._id)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs text-rose-700">
                                                <Replace className="w-3.5 h-3.5" /> Reject
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
