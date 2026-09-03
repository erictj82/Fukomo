"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Bell } from "lucide-react";
import TenantLink from "@/components/TenantLink";
import { usePermission } from "@/hooks/usePermission";

type Notif = {
    _id: string;
    title: string;
    body?: string;
    href?: string;
    payload?: {
        customer?: string;
        wo?: string;
        fromService?: string;
        toService?: string;
        reason?: string;
        requestedBy?: string;
    };
    readAt?: string;
    createdAt?: string;
};

export default function CorrectionNotificationBell() {
    const params = useParams();
    const slug = (params?.slug as string) || "pusat";
    const { canEdit } = usePermission();
    const canApprove = canEdit("corrections");
    const [open, setOpen] = useState(false);
    const [items, setItems] = useState<Notif[]>([]);
    const [unread, setUnread] = useState(0);
    const [popup, setPopup] = useState<Notif | null>(null);
    const seenRef = useRef<Set<string>>(new Set());
    const boxRef = useRef<HTMLDivElement>(null);

    const load = async () => {
        if (!canApprove) return;
        try {
            const res = await fetch("/api/notifications", { headers: { "x-store-slug": slug }, cache: "no-store" });
            const data = await res.json();
            if (!res.ok || !data.success) return;
            const rows: Notif[] = data.data || [];
            setItems(rows);
            setUnread(data.unread || 0);
            const fresh = rows.find((r) => !r.readAt && !seenRef.current.has(r._id));
            if (fresh) {
                seenRef.current.add(fresh._id);
                setPopup(fresh);
            }
        } catch {
            /* ignore polling errors */
        }
    };

    useEffect(() => {
        if (!canApprove) return;
        load();
        const t = setInterval(load, 15000);
        return () => clearInterval(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canApprove, slug]);

    useEffect(() => {
        function onDoc(e: MouseEvent) {
            if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
        }
        document.addEventListener("mousedown", onDoc);
        return () => document.removeEventListener("mousedown", onDoc);
    }, []);

    const markRead = async (id: string) => {
        await fetch(`/api/notifications/${id}/read`, { method: "POST", headers: { "x-store-slug": slug } });
        load();
    };

    if (!canApprove) return null;

    return (
        <div className="relative" ref={boxRef}>
            {popup && (
                <div className="fixed right-6 top-20 z-50 w-80 rounded-xl border border-amber-200 bg-white shadow-lg p-4">
                    <div className="text-xs font-bold uppercase tracking-wide text-amber-800">Correction Request</div>
                    <div className="mt-1 text-sm font-semibold text-gray-900">{popup.payload?.customer || popup.title}</div>
                    <div className="text-xs text-gray-600 mt-1 space-y-0.5">
                        <div>WO: {popup.payload?.wo || "—"}</div>
                        <div>Lama: {popup.payload?.fromService || "—"}</div>
                        <div>Baru: {popup.payload?.toService || "—"}</div>
                        <div>Alasan: {popup.payload?.reason || popup.body}</div>
                        <div>Request oleh: {popup.payload?.requestedBy || "—"}</div>
                    </div>
                    <div className="mt-3 flex justify-end gap-2">
                        <button className="text-xs text-gray-500" onClick={() => setPopup(null)}>Tutup</button>
                        <TenantLink
                            href="/corrections"
                            className="text-xs font-semibold text-blue-900"
                            onClick={() => { if (popup._id) markRead(popup._id); setPopup(null); }}
                        >
                            Buka Correction Requests
                        </TenantLink>
                    </div>
                </div>
            )}
            <button
                onClick={() => setOpen(!open)}
                className="relative p-2 text-gray-600 rounded-lg hover:bg-gray-100"
                aria-label="Correction notifications"
            >
                <Bell className="w-5 h-5" />
                {unread > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center">
                        {unread > 9 ? "9+" : unread}
                    </span>
                )}
            </button>
            {open && (
                <div className="absolute right-0 z-20 mt-2 w-80 origin-top-right bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                    <div className="px-3 py-2 border-b text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Correction Requests
                    </div>
                    {items.length === 0 ? (
                        <div className="px-3 py-4 text-sm text-gray-500">Tidak ada notifikasi.</div>
                    ) : (
                        <div className="max-h-80 overflow-y-auto">
                            {items.map((n) => (
                                <TenantLink
                                    key={n._id}
                                    href={n.href || "/corrections"}
                                    onClick={() => { markRead(n._id); setOpen(false); }}
                                    className={`block px-3 py-2 text-sm hover:bg-gray-50 ${n.readAt ? "text-gray-500" : "text-gray-900 bg-amber-50/50"}`}
                                >
                                    <div className="font-medium">{n.payload?.customer || n.title}</div>
                                    <div className="text-xs text-gray-600">
                                        WO {n.payload?.wo || "—"} · {n.payload?.fromService || "—"} → {n.payload?.toService || "—"}
                                    </div>
                                    <div className="text-xs text-gray-500 truncate">{n.payload?.reason}</div>
                                    <div className="text-[11px] text-gray-400">oleh {n.payload?.requestedBy || "—"}</div>
                                </TenantLink>
                            ))}
                        </div>
                    )}
                    <TenantLink href="/corrections" onClick={() => setOpen(false)} className="block px-3 py-2 text-xs font-semibold text-blue-900 border-t">
                        Lihat semua Correction Requests
                    </TenantLink>
                </div>
            )}
        </div>
    );
}
