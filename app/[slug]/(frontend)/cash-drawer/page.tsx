"use client";


import { useParams } from "next/navigation";
import { useState, useEffect } from "react";
import { format } from "date-fns";
import { 
    Wallet, Lock, Unlock, ArrowRightLeft, 
    Landmark, CircleDollarSign, History, Shield,
    CheckCircle2, XCircle, Pencil
} from "lucide-react";
import { useSession } from "next-auth/react";
import { useSettings } from "@/components/providers/SettingsProvider";

export default function CashDrawerPage() {
  const params = useParams();
  const slug = params.slug as string;
    const { data: session } = useSession();
    const { settings } = useSettings();
    const [loading, setLoading] = useState(true);
    
    const [balance, setBalance] = useState({ kasirBalance: 0, brankasBalance: 0, bankBalance: 0 });
    const [activeSession, setActiveSession] = useState<any>(null);
    const [logs, setLogs] = useState<any[]>([]);
    const [logLimit, setLogLimit] = useState(20);

    const [openModal, setOpenModal] = useState<'open' | 'close' | 'transfer' | 'adjust' | null>(null);
    const [adjustTarget, setAdjustTarget] = useState<'bank' | 'owner'>('bank');
    const [adjustNewBalance, setAdjustNewBalance] = useState("");
    const [actionLoading, setActionLoading] = useState(false);

    // Form states
    const [startingCash, setStartingCash] = useState("");
    const [actualEndingCash, setActualEndingCash] = useState("");
    const [transferAmount, setTransferAmount] = useState("");
    const [transferSource, setTransferSource] = useState("kasir");
    const [transferDestination, setTransferDestination] = useState("brankas");
    const [notes, setNotes] = useState("");
    const [ownerPassword, setOwnerPassword] = useState("");

    const formatCurrency = (val: number) => {
        return `${settings?.symbol || 'Rp'}${val.toLocaleString('id-ID')}`;
    };

    const fetchData = async () => {
        try {
            setLoading(true);
            const res = await fetch('/api/cash-drawer', { headers: { "x-store-slug": slug } });
            const data = await res.json();
            if (data.success) {
                setBalance(data.data.balance);
                setActiveSession(data.data.activeSession);
            }

            const logsRes = await fetch(`/api/cash-drawer/logs?limit=${logLimit}`, { headers: { "x-store-slug": slug } });
            const logsData = await logsRes.json();
            if (logsData.success) {
                setLogs(logsData.data);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [logLimit]);

    const handleSessionAction = async (action: 'open' | 'close') => {
        setActionLoading(true);
        try {
            const body = action === 'open' 
                ? { action, startingCash: Number(startingCash), notes }
                : { action, actualEndingCash: Number(actualEndingCash), notes };
                
            const res = await fetch('/api/cash-drawer/session', {
                method: 'POST',
                headers: { "x-store-slug": slug, 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const data = await res.json();
            
            if (data.success) {
                setOpenModal(null);
                setStartingCash("");
                setActualEndingCash("");
                setNotes("");
                fetchData();
            } else {
                alert(data.error || "Gagal memproses sesi");
            }
        } catch (error) {
            alert("Terjadi kesalahan sistem");
        } finally {
            setActionLoading(false);
        }
    };

    const handleTransfer = async () => {
        setActionLoading(true);
        try {
            const res = await fetch('/api/cash-drawer/transfer', {
                method: 'POST',
                headers: { "x-store-slug": slug, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    source: transferSource,
                    destination: transferDestination,
                    amount: Number(transferAmount),
                    notes,
                    ownerPassword
                })
            });
            const data = await res.json();
            
            if (data.success) {
                setOpenModal(null);
                setTransferAmount("");
                setNotes("");
                setOwnerPassword("");
                fetchData();
            } else {
                alert(data.error || "Gagal mentransfer uang");
            }
        } catch (error) {
            alert("Terjadi kesalahan sistem");
        } finally {
            setActionLoading(false);
        }
    };

    const handleAdjust = async () => {
        setActionLoading(true);
        try {
            const res = await fetch('/api/cash-drawer/adjust', {
                method: 'POST',
                headers: { "x-store-slug": slug, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    target: adjustTarget,
                    newBalance: Number(adjustNewBalance),
                    notes,
                    ownerPassword
                })
            });
            const data = await res.json();
            
            if (data.success) {
                setOpenModal(null);
                setAdjustNewBalance("");
                setNotes("");
                setOwnerPassword("");
                fetchData();
            } else {
                alert(data.error || "Gagal menyesuaikan saldo");
            }
        } catch (error) {
            alert("Terjadi kesalahan sistem");
        } finally {
            setActionLoading(false);
        }
    };

    const getAmountColor = (log: any) => {
        const isOut = ['bank', 'owner'].includes(log.destinationLocation) || 
                      log.type === 'expense' || 
                      log.type === 'void' ||
                      (log.sourceLocation === 'kasir' && log.destinationLocation === 'system');
        const isIn = log.type === 'sale' || log.type === 'deposit' || 
                     (log.sourceLocation === 'system' && log.destinationLocation === 'kasir');
        
        if (isOut) return 'text-red-600';
        if (isIn) return 'text-green-600';
        return 'text-gray-900';
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-900 border-t-transparent shadow-sm"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#F8FAFC]">
            <div className="bg-white border-b border-gray-200 sticky top-0 z-30">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between py-6 gap-6">
                        <div>
                            <h1 className="text-2xl font-black text-gray-900 tracking-tight">Manajemen Kasir & Brankas</h1>
                            <p className="text-sm text-gray-500 font-medium mt-1">Audit uang fisik dan pergerakan kas harian</p>
                        </div>
                        <div className="flex items-center gap-3">
                            {!activeSession ? (
                                <button onClick={() => { setStartingCash(balance.kasirBalance.toString()); setOpenModal('open'); }} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold shadow-md transition-all">
                                    <Unlock className="w-5 h-5" /> Buka Laci Kasir
                                </button>
                            ) : (
                                <button onClick={() => { setActualEndingCash(balance.kasirBalance.toString()); setOpenModal('close'); }} className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-xl font-bold shadow-md transition-all">
                                    <Lock className="w-5 h-5" /> Tutup Laci Kasir
                                </button>
                            )}
                            <button onClick={() => setOpenModal('transfer')} className="flex items-center gap-2 bg-white hover:bg-gray-50 text-gray-900 border border-gray-200 px-5 py-2.5 rounded-xl font-bold shadow-sm transition-all">
                                <ArrowRightLeft className="w-5 h-5" /> Pindah Uang
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
                {/* 4 Posisi Uang */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-white p-5 rounded-2xl shadow-sm border border-blue-100 flex items-center gap-4">
                        <div className="p-3 bg-blue-50 text-blue-600 rounded-xl shrink-0"><Wallet className="w-7 h-7" /></div>
                        <div className="min-w-0">
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Saldo Laci Kasir</p>
                            <p className="text-xl lg:text-2xl font-black text-gray-900 truncate">{formatCurrency(balance.kasirBalance)}</p>
                        </div>
                    </div>
                    <div className="bg-white p-5 rounded-2xl shadow-sm border border-purple-100 flex items-center gap-4">
                        <div className="p-3 bg-purple-50 text-purple-600 rounded-xl shrink-0"><Shield className="w-7 h-7" /></div>
                        <div className="min-w-0">
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Saldo Brankas</p>
                            <p className="text-xl lg:text-2xl font-black text-gray-900 truncate">{formatCurrency(balance.brankasBalance)}</p>
                        </div>
                    </div>
                    <div 
                        onClick={() => { setAdjustTarget('bank'); setAdjustNewBalance(String(balance.bankBalance)); setOpenModal('adjust'); }}
                        className="bg-white p-5 rounded-2xl shadow-sm border border-green-100 flex items-center gap-4 cursor-pointer hover:border-green-300 hover:shadow-md transition-all group"
                    >
                        <div className="p-3 bg-green-50 text-green-600 rounded-xl shrink-0"><Landmark className="w-7 h-7" /></div>
                        <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1 flex items-center gap-1">Disetor Ke Bank <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" /></p>
                            <p className="text-xl lg:text-2xl font-black text-gray-900 truncate">{formatCurrency(balance.bankBalance)}</p>
                        </div>
                    </div>
                    <div 
                        onClick={() => { setAdjustTarget('owner'); setAdjustNewBalance(String((balance as any).ownerBalance || 0)); setOpenModal('adjust'); }}
                        className="bg-white p-5 rounded-2xl shadow-sm border border-orange-100 flex items-center gap-4 cursor-pointer hover:border-orange-300 hover:shadow-md transition-all group"
                    >
                        <div className="p-3 bg-orange-50 text-orange-600 rounded-xl shrink-0"><Lock className="w-7 h-7" /></div>
                        <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1 flex items-center gap-1">Diambil Owner <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" /></p>
                            <p className="text-xl lg:text-2xl font-black text-gray-900 truncate">{formatCurrency((balance as any).ownerBalance || 0)}</p>
                        </div>
                    </div>
                </div>

                {/* Sesi Saat Ini */}
                {activeSession && (
                    <div className="bg-blue-900 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden">
                        <div className="absolute -right-10 -top-10 opacity-10"><CircleDollarSign className="w-64 h-64" /></div>
                        <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><Unlock className="w-5 h-5 text-green-400" /> Sesi Kasir Sedang Terbuka</h2>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 relative z-10">
                            <div>
                                <p className="text-blue-300 text-xs font-semibold uppercase mb-1">Dibuka Oleh</p>
                                <p className="font-bold">{activeSession.openedBy?.name || 'Unknown'}</p>
                            </div>
                            <div>
                                <p className="text-blue-300 text-xs font-semibold uppercase mb-1">Waktu Buka</p>
                                <p className="font-bold">{format(new Date(activeSession.openedAt), 'dd MMM yyyy, HH:mm')}</p>
                            </div>
                            <div>
                                <p className="text-blue-300 text-xs font-semibold uppercase mb-1">Modal Awal Kasir</p>
                                <p className="font-bold text-lg text-green-400">{formatCurrency(activeSession.startingCash)}</p>
                            </div>
                            <div>
                                <p className="text-blue-300 text-xs font-semibold uppercase mb-1">Estimasi Kasir Saat Ini</p>
                                <p className="font-bold text-lg">{formatCurrency(balance.kasirBalance)}</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Immutable Logs */}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                        <h3 className="font-bold text-gray-900 flex items-center gap-2">
                            <History className="w-5 h-5 text-gray-500" /> Histori Pergerakan Kas (Immutable)
                        </h3>
                        <select 
                            value={logLimit} 
                            onChange={e => setLogLimit(Number(e.target.value))}
                            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:border-blue-600 focus:outline-none"
                        >
                            <option value="10">10 Entri</option>
                            <option value="20">20 Entri</option>
                            <option value="50">50 Entri</option>
                            <option value="100">100 Entri</option>
                        </select>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-left whitespace-nowrap">
                            <thead>
                                <tr className="bg-gray-50 border-b border-gray-100">
                                    <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">Waktu</th>
                                    <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">Tipe</th>
                                    <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">Deskripsi</th>
                                    <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">Alur</th>
                                    <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">Nominal</th>
                                    <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">Oleh</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {logs.map((log: any) => (
                                    <tr key={log._id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4 text-sm text-gray-600">{format(new Date(log.date), 'dd MMM HH:mm')}</td>
                                        <td className="px-6 py-4 text-sm">
                                            <span className={`px-2 py-1 rounded text-xs font-bold uppercase
                                                ${log.type === 'sale' ? 'bg-green-100 text-green-700' : 
                                                log.type === 'expense' ? 'bg-red-100 text-red-700' :
                                                log.type === 'void' ? 'bg-red-100 text-red-700' :
                                                log.type === 'transfer' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'}`}>
                                                {log.type}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-sm font-medium text-gray-900 max-w-xs truncate">{log.description}</td>
                                        <td className="px-6 py-4 text-sm text-gray-600 capitalize">
                                            {log.sourceLocation} <ArrowRightLeft className="w-3 h-3 inline mx-1 text-gray-400" /> {log.destinationLocation}
                                        </td>
                                        <td className={`px-6 py-4 text-sm font-bold ${getAmountColor(log)}`}>
                                            {formatCurrency(log.amount)}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-600">{log.performedBy?.name || 'Sistem'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Modals */}
            {openModal && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                        <div className="bg-gray-50 px-6 py-4 border-b border-gray-100 flex justify-between items-center">
                            <h3 className="font-bold text-gray-900">
                                {openModal === 'open' ? 'Buka Laci Kasir' : openModal === 'close' ? 'Tutup Laci Kasir' : openModal === 'adjust' ? `Adjust Saldo: ${adjustTarget === 'bank' ? 'Disetor Ke Bank' : 'Diambil Owner'}` : 'Transfer Uang'}
                            </h3>
                            <button onClick={() => setOpenModal(null)} className="text-gray-400 hover:text-gray-600"><XCircle className="w-6 h-6" /></button>
                        </div>
                        <div className="p-6 space-y-5">
                            {openModal === 'open' && (
                                <>
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-1">Modal Awal Fisik (Rp)</label>
                                        <input type="number" value={startingCash} onChange={e => setStartingCash(e.target.value)} className="w-full border-2 border-gray-300 rounded-xl px-4 py-3 font-bold focus:border-blue-600 focus:ring-0 transition-colors" placeholder="Contoh: 500000" />
                                        <p className="text-xs text-gray-500 mt-2">Uang fisik yang ada di laci sebelum transaksi pertama hari ini.</p>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-1">Catatan Tambahan (Opsional)</label>
                                        <textarea value={notes} onChange={e => setNotes(e.target.value)} className="w-full border-2 border-gray-300 rounded-xl px-4 py-3 focus:border-blue-600" rows={2}></textarea>
                                    </div>
                                    <button onClick={() => handleSessionAction('open')} disabled={actionLoading || !startingCash} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl disabled:opacity-50">
                                        {actionLoading ? 'Memproses...' : 'Buka Laci Sekarang'}
                                    </button>
                                </>
                            )}

                            {openModal === 'close' && (
                                <>
                                    <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 mb-4">
                                        <p className="text-xs text-blue-800 font-bold uppercase mb-1">Estimasi Sistem</p>
                                        <p className="text-2xl font-black text-blue-900">{formatCurrency(balance.kasirBalance)}</p>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-1">Uang Fisik Aktual di Laci (Rp)</label>
                                        <input type="number" value={actualEndingCash} onChange={e => setActualEndingCash(e.target.value)} className="w-full border-2 border-gray-300 rounded-xl px-4 py-3 font-bold text-red-600 focus:border-red-600 focus:ring-0 transition-colors" placeholder="Hitung dan masukkan total fisik" />
                                    </div>
                                    {actualEndingCash && Number(actualEndingCash) !== balance.kasirBalance && (
                                        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm font-bold flex items-start gap-2">
                                            <Shield className="w-5 h-5 shrink-0" />
                                            Terdapat selisih {formatCurrency(Number(actualEndingCash) - balance.kasirBalance)}. Sistem akan mencatat discrepancy ini ke dalam audit log.
                                        </div>
                                    )}
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-1">Catatan (Wajib jika ada selisih)</label>
                                        <textarea value={notes} onChange={e => setNotes(e.target.value)} className="w-full border-2 border-gray-300 rounded-xl px-4 py-3 focus:border-blue-600" rows={2}></textarea>
                                    </div>
                                    <button onClick={() => handleSessionAction('close')} disabled={actionLoading || !actualEndingCash} className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl disabled:opacity-50">
                                        {actionLoading ? 'Memproses...' : 'Tutup Laci Sekarang'}
                                    </button>
                                </>
                            )}

                            {openModal === 'transfer' && (
                                <>
                                    <div className="flex items-center gap-4">
                                        <div className="flex-1">
                                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Dari</label>
                                            <select value={transferSource} onChange={e => {setTransferSource(e.target.value); if(e.target.value === 'kasir') setTransferDestination('brankas'); else setTransferDestination('bank');}} className="w-full border-2 border-gray-300 rounded-xl px-3 py-2.5 font-bold focus:border-blue-600">
                                                <option value="kasir">Laci Kasir</option>
                                                <option value="brankas">Brankas</option>
                                            </select>
                                        </div>
                                        <ArrowRightLeft className="w-5 h-5 text-gray-300 mt-4" />
                                        <div className="flex-1">
                                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Ke</label>
                                            <select value={transferDestination} onChange={e => setTransferDestination(e.target.value)} className="w-full border-2 border-gray-300 rounded-xl px-3 py-2.5 font-bold focus:border-blue-600">
                                                <option value="kasir" disabled={transferSource === 'kasir'}>Laci Kasir</option>
                                                <option value="brankas" disabled={transferSource === 'brankas'}>Brankas</option>
                                                <option value="bank">Setor Bank</option>
                                                <option value="owner">Diambil Owner</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-1">Nominal Transfer (Rp)</label>
                                        <input type="number" value={transferAmount} onChange={e => setTransferAmount(e.target.value)} className="w-full border-2 border-gray-300 rounded-xl px-4 py-3 font-bold focus:border-blue-600" />
                                    </div>
                                    {transferSource === 'brankas' && (transferDestination === 'bank' || transferDestination === 'owner') && (
                                        <div className="p-4 bg-orange-50 border border-orange-200 rounded-xl">
                                            <label className="block text-sm font-bold text-orange-900 mb-1 flex items-center gap-2"><Lock className="w-4 h-4"/> {transferDestination === 'bank' ? 'Password Setor Bank' : 'Password Ambil Cash Owner'}</label>
                                            <input type="password" value={ownerPassword} onChange={e => setOwnerPassword(e.target.value)} className="w-full border-2 border-orange-200 rounded-lg px-4 py-2 mt-1 focus:border-orange-500" placeholder="Masukkan password otoritas" />
                                        </div>
                                    )}
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-1">Catatan</label>
                                        <input type="text" value={notes} onChange={e => setNotes(e.target.value)} className="w-full border-2 border-gray-300 rounded-xl px-4 py-3 focus:border-blue-600" placeholder="Cth: Setoran harian Bank BCA" />
                                    </div>
                                    <button onClick={handleTransfer} disabled={actionLoading || !transferAmount || (transferSource === 'brankas' && (transferDestination === 'bank' || transferDestination === 'owner') && !ownerPassword)} className="w-full bg-gray-900 hover:bg-black text-white font-bold py-3 rounded-xl disabled:opacity-50">
                                        {actionLoading ? 'Memproses...' : 'Proses Pindah Uang'}
                                    </button>
                                </>
                            )}

                            {openModal === 'adjust' && (
                                <>
                                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                                        <p className="text-xs text-gray-500 font-bold uppercase mb-1">Saldo Saat Ini</p>
                                        <p className="text-2xl font-black text-gray-900">{formatCurrency(adjustTarget === 'bank' ? balance.bankBalance : ((balance as any).ownerBalance || 0))}</p>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-1">Saldo Baru (Rp)</label>
                                        <input type="number" value={adjustNewBalance} onChange={e => setAdjustNewBalance(e.target.value)} className="w-full border-2 border-gray-300 rounded-xl px-4 py-3 font-bold focus:border-blue-600 focus:ring-0 transition-colors" placeholder="Masukkan angka saldo yang benar" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-1">Alasan Penyesuaian <span className="text-red-500">*</span></label>
                                        <input type="text" value={notes} onChange={e => setNotes(e.target.value)} className="w-full border-2 border-gray-300 rounded-xl px-4 py-3 focus:border-blue-600" placeholder="Cth: Koreksi data karena salah input sebelumnya" />
                                    </div>
                                    <div className="p-4 bg-orange-50 border border-orange-200 rounded-xl">
                                        <label className="block text-sm font-bold text-orange-900 mb-1 flex items-center gap-2"><Lock className="w-4 h-4"/> Password Owner</label>
                                        <input type="password" value={ownerPassword} onChange={e => setOwnerPassword(e.target.value)} className="w-full border-2 border-orange-200 rounded-lg px-4 py-2 mt-1 focus:border-orange-500" placeholder="Masukkan password otoritas" />
                                    </div>
                                    <button onClick={handleAdjust} disabled={actionLoading || adjustNewBalance === '' || !notes.trim() || !ownerPassword} className="w-full bg-gray-900 hover:bg-black text-white font-bold py-3 rounded-xl disabled:opacity-50">
                                        {actionLoading ? 'Memproses...' : 'Simpan Penyesuaian'}
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
