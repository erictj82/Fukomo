"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { User, FileText, Package, Wallet, Award, Calendar, AlertCircle, Phone, ArrowLeft } from "lucide-react";

export default function CustomerPortalPage() {
    const params = useParams();
    const token = params.token as string;
    const slug = params.slug as string;

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [data, setData] = useState<any>(null);

    useEffect(() => {
        const fetchPortalData = async () => {
            try {
                const res = await fetch(`/api/customers/portal/${token}`, {
                    headers: {
                        'x-store-slug': slug
                    }
                });
                const result = await res.json();

                if (result.success) {
                    setData(result.data);
                } else {
                    setError(result.error || "Data tidak ditemukan");
                }
            } catch (err: any) {
                setError("Terjadi kesalahan saat memuat data");
            } finally {
                setLoading(false);
            }
        };

        if (token && slug) {
            fetchPortalData();
        }
    }, [token, slug]);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                    <p className="text-gray-500 font-medium">Memuat data riwayat Anda...</p>
                </div>
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
                <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center">
                    <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                        <AlertCircle className="w-8 h-8" />
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Oops!</h2>
                    <p className="text-gray-600 mb-6">{error}</p>
                    <button 
                        onClick={() => window.location.reload()}
                        className="w-full bg-blue-600 text-white font-semibold py-3 px-4 rounded-xl hover:bg-blue-700 transition-colors"
                    >
                        Coba Lagi
                    </button>
                </div>
            </div>
        );
    }

    const { customer, invoices, activePackages, settings, walletTransactions } = data;

    const formatRupiah = (amount: number) => {
        return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);
    };

    const formatDate = (dateStr: string) => {
        if (!dateStr) return "-";
        return new Intl.DateTimeFormat('id-ID', { 
            day: 'numeric', month: 'short', year: 'numeric' 
        }).format(new Date(dateStr));
    };

    return (
        <div className="min-h-screen bg-gray-100 text-gray-900">
            {/* Header */}
            <div className="bg-blue-900 text-white pt-12 pb-24 px-6 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
                    <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-repeat"></div>
                </div>
                <div className="max-w-4xl mx-auto relative z-10 text-center">
                    <h1 className="text-2xl font-bold mb-1 opacity-90">{settings.storeName}</h1>
                    <h2 className="text-4xl font-extrabold mb-4">Customer Portal</h2>
                    <p className="text-blue-200">Lihat riwayat transaksi, paket, dan saldo Anda.</p>
                </div>
            </div>

            <div className="max-w-4xl mx-auto px-4 sm:px-6 -mt-16 pb-20 relative z-20">
                {/* Profile Card */}
                <div className="bg-white rounded-2xl shadow-lg p-6 mb-8 border border-gray-100 flex flex-col md:flex-row gap-6 items-center md:items-start">
                    <div className="w-20 h-20 bg-gradient-to-tr from-blue-600 to-indigo-500 rounded-full flex items-center justify-center text-white text-3xl font-bold shadow-md shrink-0">
                        {customer.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 text-center md:text-left">
                        <h3 className="text-2xl font-bold text-gray-900 mb-1">{customer.name}</h3>
                        <p className="text-gray-500 font-medium text-sm flex items-center justify-center md:justify-start gap-1">
                            <Phone className="w-4 h-4" /> {customer.customerNumber ? `ID: ${customer.customerNumber}` : 'Customer'}
                        </p>
                    </div>
                    <div className="flex gap-4 border-t md:border-t-0 md:border-l border-gray-100 pt-4 md:pt-0 md:pl-6 w-full md:w-auto justify-around">
                        <div className="text-center">
                            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">Loyalty Poin</span>
                            <span className="text-2xl font-extrabold text-blue-600 flex items-center justify-center gap-1">
                                <Award className="w-5 h-5 text-amber-500 inline" /> {customer.loyaltyPoints || 0}
                            </span>
                        </div>
                        <div className="text-center">
                            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">Saldo Wallet</span>
                            <span className="text-2xl font-extrabold text-emerald-600 flex items-center justify-center gap-1">
                                <Wallet className="w-5 h-5 text-emerald-500 inline" /> {formatRupiah(customer.walletBalance || 0)}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Main Content - History */}
                    <div className="lg:col-span-2 space-y-8">
                        {/* Riwayat Transaksi */}
                        <div className="bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden">
                            <div className="p-5 border-b border-gray-100 bg-gray-50 flex items-center gap-3">
                                <FileText className="w-5 h-5 text-blue-600" />
                                <h3 className="font-bold text-lg text-gray-900">Riwayat Transaksi</h3>
                            </div>
                            <div className="divide-y divide-gray-100">
                                {invoices && invoices.length > 0 ? (
                                    invoices.map((inv: any) => (
                                        <div key={inv._id} className="p-5 hover:bg-gray-50 transition-colors flex justify-between items-center">
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="font-bold text-gray-900">{inv.invoiceNumber}</span>
                                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                                                        inv.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : 
                                                        inv.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-700'
                                                    }`}>
                                                        {inv.status}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-gray-500">{formatDate(inv.date)}</p>
                                                <p className="text-sm font-medium text-gray-700 mt-2">
                                                    {inv.items?.map((i: any) => i.name).join(", ")}
                                                </p>
                                            </div>
                                            <div className="text-right font-bold text-gray-900">
                                                {formatRupiah(inv.totalAmount)}
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="p-8 text-center text-gray-500">
                                        <FileText className="w-10 h-10 mx-auto text-gray-300 mb-2" />
                                        <p>Belum ada riwayat transaksi.</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Riwayat Saldo Wallet */}
                        <div className="bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden">
                            <div className="p-5 border-b border-gray-100 bg-gray-50 flex items-center gap-3">
                                <Wallet className="w-5 h-5 text-emerald-600" />
                                <h3 className="font-bold text-lg text-gray-900">Riwayat Saldo Wallet</h3>
                            </div>
                            <div className="divide-y divide-gray-100">
                                {walletTransactions && walletTransactions.length > 0 ? (
                                    walletTransactions.map((wt: any, idx: number) => {
                                        const isCredit = wt.type === 'topup' || wt.type === 'bonus' || wt.type === 'refund' || (wt.amount > 0 && wt.type !== 'payment');
                                        return (
                                            <div key={wt._id || idx} className="p-5 hover:bg-gray-50 transition-colors flex justify-between items-center">
                                                <div>
                                                    <span className="text-xs font-bold text-gray-400 uppercase">{formatDate(wt.createdAt)}</span>
                                                    <h4 className="font-semibold text-gray-900 mt-1 capitalize">{wt.description || (wt.type === 'topup' ? 'Top-Up Saldo' : wt.type === 'payment' ? 'Pembayaran Transaksi' : wt.type)}</h4>
                                                </div>
                                                <div className="text-right">
                                                    <div className={`font-bold ${isCredit ? 'text-emerald-600' : 'text-red-600'}`}>
                                                        {isCredit ? '+' : '-'}{formatRupiah(Math.abs(wt.amount || 0))}
                                                    </div>
                                                    <div className="text-xs text-gray-400 mt-0.5">
                                                        Sisa: {formatRupiah(wt.balanceAfter || 0)}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                ) : (
                                    <div className="p-8 text-center text-gray-500">
                                        <Wallet className="w-10 h-10 mx-auto text-gray-300 mb-2" />
                                        <p>Belum ada riwayat saldo wallet.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Sidebar - Packages */}
                    <div className="space-y-8">
                        <div className="bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden">
                            <div className="p-5 border-b border-gray-100 bg-gray-50 flex items-center gap-3">
                                <Package className="w-5 h-5 text-indigo-600" />
                                <h3 className="font-bold text-lg text-gray-900">Paket Aktif</h3>
                            </div>
                            <div className="p-5 space-y-4">
                                {activePackages && activePackages.length > 0 ? (
                                    activePackages.map((pkg: any) => (
                                        <div key={pkg._id} className="border border-indigo-100 bg-indigo-50/30 rounded-xl p-4 relative overflow-hidden">
                                            <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500"></div>
                                            <h4 className="font-bold text-indigo-900 mb-1">{pkg.packageName}</h4>
                                            <p className="text-xs font-semibold text-gray-500 mb-3 flex items-center gap-1">
                                                <Calendar className="w-3 h-3" /> Exp: {formatDate(pkg.expiresAt)}
                                            </p>
                                            
                                            <div className="space-y-2 mt-2 pt-2 border-t border-indigo-100/50">
                                                {pkg.serviceQuotas?.map((quota: any, idx: number) => (
                                                    <div key={idx} className="flex justify-between items-center text-sm">
                                                        <span className="text-gray-700 truncate pr-2" title={quota.serviceName}>{quota.serviceName}</span>
                                                        <span className="font-bold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-md text-xs whitespace-nowrap">
                                                            {quota.remainingQuota} / {quota.totalQuota}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-center py-6 text-gray-500">
                                        <Package className="w-10 h-10 mx-auto text-gray-300 mb-2" />
                                        <p className="text-sm">Anda tidak memiliki paket aktif.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
                
                <div className="mt-12 text-center text-sm text-gray-400">
                    <p>&copy; {new Date().getFullYear()} {settings.storeName}. All rights reserved.</p>
                </div>
            </div>
        </div>
    );
}
