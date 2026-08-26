"use client";

import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useTenantRouter } from "@/hooks/useTenantRouter";
import { format } from "date-fns";
import { Printer, ArrowLeft, Scissors, Lock } from "lucide-react";
import { FormButton } from "@/components/dashboard/FormInput";
import { getCurrencySymbol } from "@/lib/currency";
import { QRCodeSVG } from "qrcode.react";

import { MessageSquare } from "lucide-react";

export default function PrintInvoicePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = params.slug as string;
  const id = params.id as string;
    const router = useTenantRouter();
    const [invoice, setInvoice] = useState<any>(null);
    const [settings, setSettings] = useState<any>(null);
    const [deposits, setDeposits] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [sendingWa, setSendingWa] = useState(false);
    const [sendingWaManual, setSendingWaManual] = useState(false);
    const [printing, setPrinting] = useState(false);
    // Reprint gate state (anti-kecurangan cetak ulang nota)
    const [reprintLocked, setReprintLocked] = useState(false);
    const [printRecorded, setPrintRecorded] = useState(false);
    const [pwInput, setPwInput] = useState("");
    const [unlocking, setUnlocking] = useState(false);
    const [pwError, setPwError] = useState("");

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [invRes, settingsRes, depositsRes, reprintRes] = await Promise.all([
                    fetch(`/api/invoices/${id}`, { headers: { "x-store-slug": slug } }),
                    fetch("/api/settings", { headers: { "x-store-slug": slug } }),
                    fetch(`/api/deposits?invoiceId=${id}`, { headers: { "x-store-slug": slug } }),
                    fetch(`/api/invoices/${id}/reprint`, { headers: { "x-store-slug": slug } })
                ]);
                const invData = await invRes.json();
                const settingsData = await settingsRes.json();
                const depositsData = await depositsRes.json();
                const reprintData = await reprintRes.json().catch(() => ({}));

                if (invData.success) setInvoice(invData.data);
                if (settingsData.success) setSettings(settingsData.data);
                if (depositsData.success) setDeposits(depositsData.data);

                // Reprint gate: nota yang sudah pernah dicetak + password di-set → kunci di balik overlay.
                // printRecorded=true kalau sudah pernah dicetak (biar tombol Print gak nge-POST catatan lagi).
                if (reprintData?.success) {
                    setReprintLocked(!!reprintData.requiresPassword);
                    setPrintRecorded((reprintData.printCount || 0) > 0);
                }
            } catch (error) {
                console.error("Error fetching print data:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [id]);

    // Catat cetak PERTAMA (fire-and-forget, jangan blok window.print biar struk langsung keluar).
    // Kalau nota sudah pernah dicetak (printRecorded) atau lagi terkunci, jangan kirim apa-apa —
    // pencatatan cetak ulang ditangani lewat handleUnlock.
    const recordPrintIfNeeded = (method: string) => {
        if (printRecorded || reprintLocked) return;
        setPrintRecorded(true);
        fetch(`/api/invoices/${id}/reprint`, {
            method: "POST",
            headers: { "x-store-slug": slug, "Content-Type": "application/json" },
            body: JSON.stringify({ password: "", method }),
        }).catch((e) => console.error("Gagal mencatat cetak:", e));
    };

    const handlePrint = () => {
        recordPrintIfNeeded("browser");
        window.print();
    };

    const handleUnlock = async (e: React.FormEvent) => {
        e.preventDefault();
        setUnlocking(true);
        setPwError("");
        try {
            const res = await fetch(`/api/invoices/${id}/reprint`, {
                method: "POST",
                headers: { "x-store-slug": slug, "Content-Type": "application/json" },
                body: JSON.stringify({ password: pwInput, method: "reprint" }),
            });
            const data = await res.json();
            if (data.success) {
                setReprintLocked(false);
                setPrintRecorded(true);
                setPwInput("");
            } else {
                setPwError(data.error || "Password cetak ulang salah.");
            }
        } catch (err) {
            console.error(err);
            setPwError("Terjadi kesalahan. Coba lagi.");
        } finally {
            setUnlocking(false);
        }
    };

    const handleSendWaManual = async () => {
        setSendingWaManual(true);
        try {
            const res = await fetch(`/api/invoices/${id}/wa-nota`, {
                method: 'GET',
                headers: { "x-store-slug": slug }
            });
            const data = await res.json();
            if (data.success && data.waUrl) {
                window.open(data.waUrl, '_blank');
            } else {
                alert(data.error || "Gagal menyiapkan pesan WA.");
            }
        } catch (e) {
            console.error(e);
            alert("Terjadi kesalahan saat menyiapkan pesan WA.");
        } finally {
            setSendingWaManual(false);
        }
    };

    const handleSendWaNota = async () => {
        setSendingWa(true);
        try {
            const res = await fetch(`/api/invoices/${id}/wa-nota`, {
                method: 'POST',
                headers: { "x-store-slug": slug }
            });
            const data = await res.json();
            if (data.success) {
                alert(data.message || "Nota WA berhasil dikirim!");
            } else {
                alert(data.error || "Gagal mengirim Nota WA.");
            }
        } catch (e) {
            console.error(e);
            alert("Terjadi kesalahan saat mengirim Nota WA.");
        } finally {
            setSendingWa(false);
        }
    };

    const handleBluetoothPrint = async () => {
        try {
            if (!(navigator as any).bluetooth) {
                alert("Web Bluetooth API tidak didukung di browser ini. Gunakan Chrome untuk Android/Desktop.");
                return;
            }

            setPrinting(true);
            recordPrintIfNeeded("bluetooth");

            // 1. Fetch formatted receipt binary from server thermal API
            const thermalRes = await fetch(`/api/invoices/${id}/thermal?width=80`, {
                headers: { "x-store-slug": slug },
            });
            if (!thermalRes.ok) {
                const errData = await thermalRes.json().catch(() => ({}));
                throw new Error(errData.error || 'Gagal mengambil data struk dari server');
            }
            const receiptArrayBuffer = await thermalRes.arrayBuffer();
            const receiptBytes = new Uint8Array(receiptArrayBuffer);

            // 2. Connect to Bluetooth printer
            const device = await (navigator as any).bluetooth.requestDevice({
                acceptAllDevices: true,
                optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb', 'e7810a71-73ae-499d-8c15-faa9aef0c3f2', '49535343-fe7d-4ae5-8fa9-9fafd205e455']
            });

            if (!device.gatt) throw new Error("Perangkat tidak memiliki GATT server.");
            const server = await device.gatt.connect();

            // 3. Find writable characteristic
            const servicesToTry = ['000018f0-0000-1000-8000-00805f9b34fb', 'e7810a71-73ae-499d-8c15-faa9aef0c3f2', '49535343-fe7d-4ae5-8fa9-9fafd205e455'];
            let characteristic: any = null;

            for (const uuid of servicesToTry) {
                try {
                    const svc = await server.getPrimaryService(uuid);
                    const chars = await svc.getCharacteristics();
                    characteristic = chars.find((c: any) => c.properties.write || c.properties.writeWithoutResponse);
                    if (characteristic) break;
                } catch (_) {
                    continue;
                }
            }

            if (!characteristic) throw new Error("Gagal mendapatkan layanan write untuk printer ini.");

            // 4. Send receipt bytes in chunks
            const BATCH_SIZE = 256;
            for (let i = 0; i < receiptBytes.length; i += BATCH_SIZE) {
                const chunk = receiptBytes.slice(i, i + BATCH_SIZE);
                if (characteristic.properties.write) {
                    await characteristic.writeValue(chunk);
                } else {
                    await characteristic.writeValueWithoutResponse(chunk);
                }
                await new Promise(r => setTimeout(r, 20));
            }

            alert("Struk berhasil dikirim ke printer bluetooth!");

        } catch (error: any) {
            console.error("Bluetooth print error:", error);
            if (error.message?.includes('cancelled') || error.message?.includes('User cancelled')) {
                return;
            }
            alert("Error Bluetooth: " + error.message);
        } finally {
            setPrinting(false);
        }
    };

    if (loading) return <div className="p-8 text-center">Loading receipt...</div>;
    if (!invoice) return <div className="p-8 text-center text-red-500">Invoice not found</div>;

    // Nota sudah pernah dicetak & password cetak ulang di-set → sembunyikan struk di balik overlay.
    // Struk TIDAK di-render sama sekali di sini, jadi Ctrl+P pun cuma dapat overlay ini (bukan nota).
    if (reprintLocked) {
        return (
            <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4 text-black">
                <div className="max-w-sm w-full bg-white rounded-2xl shadow-xl p-6 border-t-8 border-amber-500">
                    <div className="flex flex-col items-center text-center gap-2 mb-5">
                        <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center">
                            <Lock className="w-7 h-7 text-amber-500" />
                        </div>
                        <h1 className="text-lg font-bold text-gray-900">Nota Sudah Pernah Dicetak</h1>
                        <p className="text-sm text-gray-500">
                            Nota <span className="font-bold">{invoice.invoiceNumber}</span> sudah pernah dicetak.
                            Untuk mencetak ulang, masukkan password. Aktivitas ini akan dicatat (siapa &amp; kapan).
                        </p>
                    </div>
                    <form onSubmit={handleUnlock} className="space-y-3">
                        <input
                            type="password"
                            value={pwInput}
                            onChange={(e) => setPwInput(e.target.value)}
                            placeholder="Password cetak ulang..."
                            autoFocus
                            className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                        />
                        {pwError && <p className="text-xs text-red-600 font-medium">{pwError}</p>}
                        <div className="flex gap-2 pt-1">
                            <button
                                type="button"
                                onClick={() => router.back()}
                                className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                            >
                                Batal
                            </button>
                            <button
                                type="submit"
                                disabled={unlocking}
                                className="flex-1 px-4 py-2.5 text-sm font-bold text-white bg-amber-500 hover:bg-amber-600 rounded-lg transition-colors disabled:opacity-60"
                            >
                                {unlocking ? "Memeriksa..." : "Buka Nota"}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        );
    }

    const currencySymbol = getCurrencySymbol(settings?.currency || 'IDR');

    return (
        <div className="min-h-screen bg-gray-100 p-4 md:p-8 print:p-0 print:m-0 print:bg-white print:min-h-0 text-black">
            {/* Header / Controls */}
            <div className="max-w-[480px] mx-auto flex justify-between items-center mb-6 print:hidden">
                <button
                    onClick={() => router.back()}
                    className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Back
                </button>
                <div className="flex gap-1.5 flex-wrap justify-end">
                    <FormButton
                        onClick={handleSendWaManual}
                        icon={<MessageSquare className="w-4 h-4" />}
                        className="bg-emerald-600 hover:bg-emerald-700 whitespace-nowrap text-xs px-2.5 py-1.5"
                        disabled={sendingWaManual}
                    >
                        {sendingWaManual ? "Membuka..." : "WA Web/App"}
                    </FormButton>
                    <FormButton
                        onClick={handleSendWaNota}
                        icon={<MessageSquare className="w-4 h-4" />}
                        className="bg-green-700 hover:bg-green-800 whitespace-nowrap text-xs px-2.5 py-1.5"
                        disabled={sendingWa}
                        title="Kirim background via API (WABA / Fonnte)"
                    >
                        {sendingWa ? "Mengirim..." : "WA API"}
                    </FormButton>
                    <FormButton
                        onClick={handleBluetoothPrint}
                        disabled={printing}
                        icon={<Printer className="w-4 h-4" />}
                        className="bg-indigo-600 hover:bg-indigo-700 whitespace-nowrap text-xs px-2.5 py-1.5"
                    >
                        {printing ? "Printing..." : "Bluetooth"}
                    </FormButton>
                    <FormButton
                        onClick={handlePrint}
                        icon={<Printer className="w-4 h-4" />}
                        className="whitespace-nowrap text-xs px-2.5 py-1.5"
                    >
                        Print
                    </FormButton>
                </div>
            </div>

            {/* Thermal Receipt Content */}
            <div className="max-w-[380px] mx-auto bg-white p-6 shadow-xl print:shadow-none print:max-w-none print:w-full print:p-2 print:m-0 font-mono text-sm border-t-8 border-blue-900 print:border-t-0">
                {/* Store Header */}
                <div className="text-center mb-6">
                    <h1 className="text-2xl font-bold uppercase tracking-tighter mb-1">{settings?.storeName || "SALON POS"}</h1>
                    <p className="text-[11px] text-gray-500 uppercase">{settings?.address || "123 Beauty Lane, Salon City"}</p>
                    <p className="text-[11px] text-gray-500">TEL: {settings?.phone || "000-000-0000"}</p>
                    <div className="mt-4 border-y border-dashed border-gray-300 py-2">
                        <p className="font-bold text-lg">TAX RECEIPT</p>
                    </div>
                </div>

                {/* Info Block */}
                <div className="space-y-1 mb-6 text-[12px]">
                    <div className="flex justify-between">
                        <span className="text-gray-500">Receipt No:</span>
                        <span className="font-bold">{invoice.invoiceNumber}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-gray-500">Date:</span>
                        <span>{format(new Date(invoice.date), "dd/MM/yyyy HH:mm")}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-gray-500">Customer:</span>
                        <span className="font-bold">{invoice.customer?.name || "Walk-in"}</span>
                    </div>

                    {invoice.referralCode && (
                        <div className="flex justify-between items-start text-xs border-dashed border border-gray-300 p-1 mt-1 bg-gray-50/50">
                            <span className="text-gray-500">Referred By:</span>
                            <span className="font-bold text-right ml-2 break-all">{invoice.customer?.referredBy?.name || "Member VIP"}</span>
                        </div>
                    )}
                    {invoice.appointment && (
                        <div className="flex justify-between">
                            <span className="text-gray-500">Type:</span>
                            <span className="text-indigo-600 font-bold uppercase">Appointment</span>
                        </div>
                    )}
                </div>

                {/* Items Table */}
                <table className="w-full mb-8 border-collapse">
                    <thead>
                        <tr className="border-b-2 border-gray-900 text-xs text-left text-gray-800 uppercase tracking-wider">
                            <th className="py-3 font-bold" style={{ width: '45%' }}>Item Description</th>
                            <th className="py-3 font-bold text-center" style={{ width: '10%' }}>Qty</th>
                            <th className="py-3 font-bold text-right pr-2" style={{ width: '22%' }}>Unit Price</th>
                            <th className="py-3 font-bold text-right" style={{ width: '23%' }}>Subtotal</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {(() => {
                            const renderRows: React.ReactNode[] = [];
                            const bundleGroups: Record<string, { children: any[]; totalPrice: number; totalAmount: number; totalDiscount: number }> = {};
                            const renderOrder: { type: 'normal' | 'bundle'; key: string; item?: any }[] = [];
                            const seenBundles = new Set<string>();

                            invoice.items.forEach((item: any) => {
                                const bundleMatch = item.name?.match(/\(Bundle:\s*(.+)\)$/);
                                if (bundleMatch) {
                                    const bundleName = bundleMatch[1].trim();
                                    if (!bundleGroups[bundleName]) {
                                        bundleGroups[bundleName] = { children: [], totalPrice: 0, totalAmount: 0, totalDiscount: 0 };
                                    }
                                    bundleGroups[bundleName].children.push(item);
                                    bundleGroups[bundleName].totalPrice += (item.price || 0);
                                    bundleGroups[bundleName].totalAmount += (item.total || 0);
                                    bundleGroups[bundleName].totalDiscount += (item.discount || 0);
                                    if (!seenBundles.has(bundleName)) {
                                        seenBundles.add(bundleName);
                                        renderOrder.push({ type: 'bundle', key: bundleName });
                                    }
                                } else {
                                    renderOrder.push({ type: 'normal', key: 'normal', item });
                                }
                            });

                            let globalIdx = 0;
                            renderOrder.forEach((entry) => {
                                if (entry.type === 'normal' && entry.item) {
                                    const item = entry.item;
                                    const rIdx = globalIdx++;
                                    renderRows.push(
                                        <tr key={`n-${rIdx}`} className="text-sm">
                                            <td className="py-4 align-top">
                                                <p className="font-bold text-gray-900">{item.name}</p>
                                                <div className="mt-1 space-y-0.5">
                                                    {item.itemModel === 'Service' && (
                                                        <span className="inline-block px-1.5 py-0.5 bg-purple-50 text-purple-600 text-[9px] font-bold uppercase rounded">Service</span>
                                                    )}
                                                    {item.itemModel === 'Product' && (
                                                        <span className="inline-block px-1.5 py-0.5 bg-green-50 text-green-600 text-[9px] font-bold uppercase rounded">Product</span>
                                                    )}
                                                    {item.itemModel === 'ServicePackage' && (
                                                        <span className="inline-block px-1.5 py-0.5 bg-amber-50 text-amber-600 text-[9px] font-bold uppercase rounded">Package</span>
                                                    )}
                                                    {item.discount > 0 && (
                                                        <p className="text-[10px] text-red-600 font-medium italic">
                                                            * Includes discount of -{currencySymbol}{item.discount.toLocaleString('id-ID', { maximumFractionDigits: 0 })}
                                                        </p>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="py-4 text-center align-top font-medium">{item.quantity}</td>
                                            <td className="py-4 text-right align-top pr-2">{`${currencySymbol}${(item.price || 0).toLocaleString('id-ID', { maximumFractionDigits: 0 })}`}</td>
                                            <td className="py-4 text-right align-top font-black text-gray-900">{`${currencySymbol}${(item.total || 0).toLocaleString('id-ID', { maximumFractionDigits: 0 })}`}</td>
                                        </tr>
                                    );
                                } else if (entry.type === 'bundle') {
                                    const group = bundleGroups[entry.key];
                                    const bIdx = globalIdx++;
                                    renderRows.push(
                                        <tr key={`bh-${bIdx}`} className="text-sm">
                                            <td className="py-4 align-top">
                                                <p className="font-black text-gray-900">Bundle: {entry.key}</p>
                                                <div className="mt-1 space-y-0.5">
                                                    <span className="inline-block px-1.5 py-0.5 bg-blue-50 text-blue-600 text-[9px] font-bold uppercase rounded">Bundle</span>
                                                    {group.totalDiscount > 0 && (
                                                        <p className="text-[10px] text-red-600 font-medium italic">
                                                            * Includes discount of -{currencySymbol}{group.totalDiscount.toLocaleString('id-ID', { maximumFractionDigits: 0 })}
                                                        </p>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="py-4 text-center align-top font-medium">1</td>
                                            <td className="py-4 text-right align-top pr-2">{`${currencySymbol}${group.totalPrice.toLocaleString('id-ID', { maximumFractionDigits: 0 })}`}</td>
                                            <td className="py-4 text-right align-top font-black text-gray-900">{`${currencySymbol}${group.totalAmount.toLocaleString('id-ID', { maximumFractionDigits: 0 })}`}</td>
                                        </tr>
                                    );
                                    group.children.forEach((child: any, cIdx: number) => {
                                        const serviceName = child.name.replace(/\s*\(Bundle:.*\)$/, '');
                                        renderRows.push(
                                            <tr key={`bc-${bIdx}-${cIdx}`} className="text-xs text-gray-500 border-0">
                                                <td className="py-1.5 pl-6 align-top">
                                                    <span className="text-gray-400 mr-1">↳</span>
                                                    <span className="font-medium text-gray-700">{serviceName}</span>
                                                    <div className="mt-0.5">
                                                        <span className="inline-block px-1 py-0.5 bg-purple-50 text-purple-500 text-[8px] font-bold uppercase rounded">Service</span>
                                                    </div>
                                                </td>
                                                <td className="py-1.5 text-center align-top">{child.quantity}</td>
                                                <td className="py-1.5 text-right align-top pr-2">{`${currencySymbol}${(child.price || 0).toLocaleString('id-ID', { maximumFractionDigits: 0 })}`}</td>
                                                <td className="py-1.5 text-right align-top text-gray-400"></td>
                                            </tr>
                                        );
                                    });
                                }
                            });

                            return renderRows;
                        })()}
                    </tbody>
                </table>

                {/* Package Usage Section */}
                {invoice.packageUsage && invoice.packageUsage.length > 0 && (
                    <div className="border-t border-dashed border-gray-400 py-3 mt-4 space-y-2">
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Package Usage Detail</p>
                        {invoice.packageUsage.map((pkg: any, idx: number) => (
                            <div key={idx} className="bg-gray-50 p-2 rounded text-[11px] text-gray-700">
                                <div className="flex justify-between font-bold mb-0.5 text-[12px] text-gray-900">
                                    <span>{pkg.itemName}</span>
                                    <span className="text-blue-700 bg-blue-100 px-1 rounded">{pkg.usedQuantity}x Dipakai</span>
                                </div>
                                <div className="flex justify-between text-[10px] text-gray-500">
                                    <span>Paket: {pkg.packageName}</span>
                                    <span>Sisa Kuota: <strong className="text-emerald-700 font-bold bg-emerald-100 px-1 rounded">{pkg.remainingQuota}</strong></span>
                                </div>
                                {pkg.expiryDate && (
                                    <div className="text-[9px] text-gray-400 mt-1">
                                        Berlaku s/d: {new Date(pkg.expiryDate).toLocaleDateString('id-ID')}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* Summary Section */}
                <div className="border-t-2 border-gray-900 pt-6 space-y-3 text-sm">
                    <div className="flex justify-between items-center text-gray-600">
                        <span className="font-medium">Gross Subtotal</span>
                        <span className="font-bold">{currencySymbol}{invoice.subtotal.toLocaleString('id-ID', { maximumFractionDigits: 0 })}</span>
                    </div>
                    {invoice.discount > 0 && (
                        <div className="flex flex-col text-red-600">
                            <div className="flex justify-between items-center">
                                <span className="font-medium">Total Discount</span>
                                <span className="font-bold">-{currencySymbol}{invoice.discount.toLocaleString('id-ID', { maximumFractionDigits: 0 })}</span>
                            </div>
                            {invoice.discountBreakdown && (
                                <div className="ml-2 mt-1 space-y-0.5 border-l border-red-200 pl-2">
                                    {invoice.discountBreakdown.manual > 0 && (
                                        <div className="flex justify-between text-[11px] text-red-500">
                                            <span>Manual ({invoice.discountBreakdown.manualReason || 'Discount'})</span>
                                            <span>-{currencySymbol}{invoice.discountBreakdown.manual.toLocaleString('id-ID', { maximumFractionDigits: 0 })}</span>
                                        </div>
                                    )}
                                    {invoice.discountBreakdown.loyalty > 0 && (
                                        <div className="flex justify-between text-[11px] text-red-500">
                                            <span>Loyalty Points</span>
                                            <span>-{currencySymbol}{invoice.discountBreakdown.loyalty.toLocaleString('id-ID', { maximumFractionDigits: 0 })}</span>
                                        </div>
                                    )}
                                    {invoice.discountBreakdown.referral > 0 && (
                                        <div className="flex justify-between text-[11px] text-red-500">
                                            <span>Referral Promo</span>
                                            <span>-{currencySymbol}{invoice.discountBreakdown.referral.toLocaleString('id-ID', { maximumFractionDigits: 0 })}</span>
                                        </div>
                                    )}
                                    {invoice.discountBreakdown.voucher > 0 && (
                                        <div className="flex justify-between text-[11px] text-red-500">
                                            <span>Voucher</span>
                                            <span>-{currencySymbol}{invoice.discountBreakdown.voucher.toLocaleString('id-ID', { maximumFractionDigits: 0 })}</span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                    {settings?.showTaxAndTaxableAmountOnReceipt !== false && (
                        <>
                            <div className="flex justify-between items-center text-gray-800 border-t border-gray-100 pt-2">
                                <span className="font-medium text-[12px] uppercase tracking-tight">Taxable Amount</span>
                                <span className="font-bold">{currencySymbol}{(invoice.subtotal - invoice.discount).toLocaleString('id-ID', { maximumFractionDigits: 0 })}</span>
                            </div>
                            <div className="flex justify-between items-center text-gray-700">
                                <span className="font-medium">GST / Tax ({(invoice.subtotal - invoice.discount) > 0 ? ((invoice.tax / (invoice.subtotal - invoice.discount)) * 100).toFixed(0) : 0}%)</span>
                                <span className="font-bold">{currencySymbol}{invoice.tax.toLocaleString('id-ID', { maximumFractionDigits: 0 })}</span>
                            </div>
                        </>
                    )}
                    {invoice.tips > 0 && (
                        <div className="flex justify-between text-indigo-600 font-bold border-t border-indigo-100 pt-1">
                            <span>Tips</span>
                            <span>{currencySymbol}{invoice.tips.toLocaleString('id-ID', { maximumFractionDigits: 0 })}</span>
                        </div>
                    )}
                    <div className="flex justify-between pt-4 border-t-2 border-double border-gray-900 text-xl font-black uppercase text-gray-900">
                        <span>Grand Total</span>
                        <span>{currencySymbol}{invoice.totalAmount.toLocaleString('id-ID', { maximumFractionDigits: 0 })}</span>
                    </div>

                    {/* Staff Recognition */}
                    {settings?.showStaffOnReceipt !== false && invoice.staffAssignments && invoice.staffAssignments.length > 0 && (
                        <div className="mt-8 pt-6 border-t border-gray-100">
                            <p className="mb-3 uppercase font-black tracking-widest text-[9px] text-gray-400 border-l-2 border-gray-200 pl-2">Served By</p>
                            <div className="space-y-1.5 px-1 py-1">
                                {invoice.staffAssignments.map((a: any, i: number) => (
                                    <div key={i} className="flex items-center justify-between text-[11px] bg-gray-50/50 p-2 rounded border border-gray-100/50">
                                        <div className="flex items-center gap-1.5">
                                            <div className="w-1.5 h-1.5 bg-gray-300 rounded-full"></div>
                                            <span className="font-bold text-gray-800 uppercase tracking-tight">{a.staff?.name || 'Staff Member'}</span>
                                        </div>
                                        {a.tip > 0 && (
                                            <span className="px-2 text-indigo-600 font-black italic underline decoration-indigo-200 underline-offset-2">Tip: {currencySymbol}{a.tip.toLocaleString('id-ID', { maximumFractionDigits: 0 })}</span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    <div className="flex justify-between text-green-700 font-bold">
                        <span>Net Paid</span>
                        <span>{currencySymbol}{Math.min(invoice.amountPaid, invoice.totalAmount).toLocaleString('id-ID', { maximumFractionDigits: 0 })}</span>
                    </div>
                    {invoice.totalAmount - invoice.amountPaid > 0 && (
                        <div className="flex justify-between text-red-600 font-bold border-t border-dashed border-red-100 mt-1 pt-1">
                            <span>Balance Due</span>
                            <span>{currencySymbol}{Math.max(0, invoice.totalAmount - invoice.amountPaid).toLocaleString('id-ID', { maximumFractionDigits: 0 })}</span>
                        </div>
                    )}
                </div>

                {/* Payment History */}
                {deposits.length > 0 && (
                    <div className="mt-6 border-t border-gray-100 pt-4">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Payment History</p>
                        <div className="space-y-2">
                            {deposits.map((dep, idx) => (
                                <div key={idx} className="flex justify-between text-[11px]">
                                    <div className="text-gray-500">
                                        <span>{format(new Date(dep.date), "dd/MM/yy HH:mm")}</span>
                                        <span className="mx-2">•</span>
                                        <span className="uppercase">{dep.paymentMethod}</span>
                                    </div>
                                    <span className="font-bold">{currencySymbol}{dep.amount.toLocaleString('id-ID', { maximumFractionDigits: 0 })}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Footer Section */}
                <div className="mt-10 text-center space-y-4">
                    <div className="flex flex-col items-center gap-1">
                        <p className="text-[10px] text-gray-500 uppercase tracking-widest">Payment Method</p>
                        {invoice.paymentMethods && invoice.paymentMethods.length > 1 ? (
                            <div className="flex flex-col items-center gap-1">
                                {invoice.paymentMethods.map((pm: any, i: number) => (
                                    <p key={i} className="font-bold text-sm bg-gray-100 px-3 py-1 rounded-full uppercase">
                                        {pm.method}: {currencySymbol}{pm.amount.toLocaleString('id-ID', { maximumFractionDigits: 0 })}
                                    </p>
                                ))}
                            </div>
                        ) : (
                            <p className="font-bold text-sm bg-gray-100 px-3 py-1 rounded-full uppercase">{invoice.paymentMethod || 'Cash'}</p>
                        )}
                    </div>

                    <div className="pt-6 relative">
                        <div className="absolute top-0 left-0 w-full border-t border-dashed border-gray-300"></div>
                        <Scissors className="w-4 h-4 text-gray-300 absolute -top-2 left-1/2 -translate-x-1/2 bg-white px-1" />
                        <p className="text-[11px] font-bold text-gray-900 mt-4 leading-relaxed">
                            THANK YOU FOR CHOOSING {settings?.storeName || "US"}!<br />
                            PLEASE VISIT AGAIN.
                        </p>
                        {settings?.receiptFooter && (
                            <p className="text-[10px] text-gray-500 whitespace-pre-wrap mt-2">{settings.receiptFooter}</p>
                        )}
                        <p className="text-[9px] text-gray-400 mt-2 italic">Prices inclusive of taxes where applicable</p>
                    </div>

                    {invoice.customer?.publicToken && (
                        <div className="pt-6 flex flex-col items-center gap-2">
                            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Scan for Digital Receipt</p>
                            <QRCodeSVG 
                                value={`${typeof window !== 'undefined' ? window.location.origin : ''}/${slug}/portal/${invoice.customer.publicToken}/invoice/${invoice._id}`} 
                                size={96} 
                                level={"L"} 
                                includeMargin={false} 
                            />
                        </div>
                    )}
                    <p className="text-[8px] text-gray-300 tracking-[4px] uppercase mt-4">{invoice.invoiceNumber}</p>
                </div>
            </div>

            <style jsx global>{`
                @media print {
                    html, body {
                        background: white !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        min-height: 0 !important;
                        height: auto !important;
                        width: 80mm !important;
                        overflow: visible !important;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                        color-adjust: exact !important;
                    }
                    * {
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                        color-adjust: exact !important;
                    }
                    .print\\:hidden {
                        display: none !important;
                    }
                    * {
                        page-break-inside: avoid;
                    }
                    table, tr, td, th {
                        page-break-inside: auto;
                    }
                    @page {
                        margin: 0;
                        padding: 0;
                        size: 80mm auto;
                    }
                }
            `}</style>
        </div>
    );
}