"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams,  } from "next/navigation";
import { useTenantRouter } from "@/hooks/useTenantRouter";
import TenantLink from '@/components/TenantLink';
import PermissionGate from "@/components/PermissionGate";
import {
  ArrowLeft,
  Star,
  Gift,
  Phone,
  Mail,
  MapPin,
  FileText,
  Package,
  Camera,
  Bell,
  BellOff,
  Edit,
  Trash2,
  Plus,
  Crown,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Wallet,
  Stethoscope,
  ClipboardList,
  Activity,
} from "lucide-react";
import { useSettings } from "@/components/providers/SettingsProvider";
import FormInput, { FormButton } from "@/components/dashboard/FormInput";
import Modal from "@/components/dashboard/Modal";
import ImageUpload from "@/components/dashboard/ImageUpload";
import { useSession } from "next-auth/react";

// ── Types ──────────────────────────────────────────────────────────────────

interface Customer {
  _id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
  preferenceNotes?: string;
  totalPurchases: number;
  loyaltyPoints: number;
  status: string;
  membershipTier: "regular" | "premium";
  membershipJoinDate?: string;
  membershipExpiry?: string;
  referralCode?: string;
  referredBy?: { _id: string; name: string };
  waNotifEnabled: boolean;
  walletBalance: number;
  createdAt: string;
}

interface InvoiceItem {
  name: string;
  price: number;
  quantity: number;
  total: number;
}

interface Invoice {
  _id: string;
  invoiceNumber: string;
  date: string;
  totalAmount: number;
  status: string;
  paymentMethod: string;
  items: InvoiceItem[];
}

interface PackageOrder {
  _id: string;
  createdAt: string;
  status: string;
  packageName?: string;
  totalAmount: number;
  invoiceNumber?: string;
}

interface PackageUsage {
  _id: string;
  createdAt: string;
  usedAt?: string;
  serviceName: string;
  quantity: number;
  invoiceNumber?: string;
}

interface BeforeAfterPhoto {
  _id: string;
  before: string;
  after: string;
  note?: string;
  date: string;
}

interface CustomerPackageItem {
  _id: string;
  packageName: string;
  status: string;
  expiresAt?: string;
  serviceQuotas: {
    service: string;
    serviceName: string;
    totalQuota: number;
    remainingQuota: number;
  }[];
}

// ── Membership config ──────────────────────────────────────────────────────

const MEMBERSHIP_TIERS = {
  regular: {
    label: "Regular",
    color: "text-gray-600",
    bg: "bg-gray-100",
    border: "border-gray-200",
    icon: "⭐",
  },
  premium: {
    label: "VIP Member",
    color: "text-yellow-700",
    bg: "bg-gradient-to-br from-yellow-50 to-amber-50",
    border: "border-yellow-400",
    icon: "👑",
  },
};

function fmt(
  n: number | undefined | null,
  symbol: string,
  fractionDigits: number = 0,
): string {
  const num = n || 0;
  return `${symbol}${num.toLocaleString("id-ID", { maximumFractionDigits: fractionDigits })}`;
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// ── Component ──────────────────────────────────────────────────────────────

export default function CustomerDashboardPage() {
  const { data: session } = useSession();
  const isAdmin = (session as any)?.user?.role === 'superadmin' || 
    (session as any)?.user?.role?.name?.toLowerCase() === 'super admin' || 
    (session as any)?.user?.role?.name?.toLowerCase() === 'superadmin' ||
    (session as any)?.user?.role?.name?.toLowerCase() === 'admin';

  const params = useParams();
  const slug = params.slug as string;
  const router = useTenantRouter();
  const { settings } = useSettings();
  const customerId = params?.id as string;

  // Data state
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [packageOrders, setPackageOrders] = useState<PackageOrder[]>([]);
  const [packageUsage, setPackageUsage] = useState<PackageUsage[]>([]);
  const [activePackages, setActivePackages] = useState<CustomerPackageItem[]>(
    [],
  );
  const [photos, setPhotos] = useState<BeforeAfterPhoto[]>([]);
  const [medicalRecords, setMedicalRecords] = useState<any[]>([]);

  // UI state
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<
    "invoices" | "packages" | "photos" | "notes" | "wallet" | "medical_records"
  >("invoices");
  const [expandedInvoice, setExpandedInvoice] = useState<string | null>(null);
  const [walletTransactions, setWalletTransactions] = useState<any[]>([]);
  const [copied, setCopied] = useState(false);

  // Edit notes modal
  const [isNotesModalOpen, setIsNotesModalOpen] = useState(false);
  const [notesForm, setNotesForm] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  // Photo modal
  const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);
  const [photoForm, setPhotoForm] = useState({
    before: "",
    after: "",
    note: "",
  });
  const [savingPhoto, setSavingPhoto] = useState(false);

  // Medical Record modal
  const [isMedicalModalOpen, setIsMedicalModalOpen] = useState(false);
  const [medicalForm, setMedicalForm] = useState({
    _id: "",
    date: new Date().toISOString().split("T")[0],
    complaint: "",
    diagnosis: "",
    treatment: "",
    prescription: "",
    handledBy: "",
  });
  const [savingMedical, setSavingMedical] = useState(false);

  // Loyalty history
  const [isLoyaltyModalOpen, setIsLoyaltyModalOpen] = useState(false);
  const [loyaltyHistory, setLoyaltyHistory] = useState<any[]>([]);
  const [loadingLoyalty, setLoadingLoyalty] = useState(false);  

  // Membership modal
  const [isMembershipModalOpen, setIsMembershipModalOpen] = useState(false);
  const [membershipForm, setMembershipForm] = useState<"regular" | "premium">("regular");
  const [savingMembership, setSavingMembership] = useState(false);

  // Edit Package Modal
  const [isEditPackageModalOpen, setIsEditPackageModalOpen] = useState(false);
  const [editingPackage, setEditingPackage] = useState<CustomerPackageItem | null>(null);
  const [packageEditForm, setPackageEditForm] = useState({
    expiresAt: "",
    serviceQuotas: [] as { _id: string, serviceName: string, remainingQuota: number }[]
  });
  const [savingPackage, setSavingPackage] = useState(false);

  // ── Fetch ────────────────────────────────────────────────────────────────

  const fetchCustomer = useCallback(async () => {
    const res = await fetch(`/api/customers/${customerId}`, { headers: { "x-store-slug": slug } });
    const data = await res.json();
    if (data.success) {
      setCustomer(data.data);
      setNotesForm(data.data.preferenceNotes || "");
      setMembershipForm(data.data.membershipTier || "regular");
    }
  }, [customerId]);

  const fetchHistory = useCallback(async () => {
    const res = await fetch(`/api/customers/${customerId}/history`, { headers: { "x-store-slug": slug } });
    const data = await res.json();
    if (data.success) {
      setInvoices(data.data.invoices || []);
      setPackageOrders(data.data.packageOrders || []);
      setPackageUsage(data.data.packageUsage || []);
    }
  }, [customerId]);

  const fetchPackages = useCallback(async () => {
    const res = await fetch(
      `/api/customer-packages?customerId=${customerId}&status=active`,
    );
    const data = await res.json();
    if (data.success) setActivePackages(data.data || []);
  }, [customerId]);

  const fetchPhotos = useCallback(async () => {
    const res = await fetch(`/api/customers/${customerId}/photos`, { headers: { "x-store-slug": slug } });
    const data = await res.json();
    if (data.success) setPhotos(data.data || []);
  }, [customerId]);

  const fetchWalletHistory = useCallback(async () => {
    const res = await fetch(`/api/customers/${customerId}/wallet`, { headers: { "x-store-slug": slug } });
    const data = await res.json();
    if (data.success) setWalletTransactions(data.data || []);
  }, [customerId]);

  const fetchMedicalRecords = useCallback(async () => {
    const res = await fetch(`/api/customers/${customerId}/medical-records`, { headers: { "x-store-slug": slug } });
    const data = await res.json();
    if (data.success) setMedicalRecords(data.data || []);
  }, [customerId]);

  const fetchLoyaltyHistory = useCallback(async () => {
    setLoadingLoyalty(true);
    try {
      const res = await fetch(`/api/customers/${customerId}/loyalty`, { headers: { "x-store-slug": slug } });
      const data = await res.json();
      if (data.success) setLoyaltyHistory(data.data || []);
    } finally {
      setLoadingLoyalty(false);
    }
  }, [customerId]);

  useEffect(() => {
    if (!customerId) return;
    setLoading(true);
    Promise.all([
      fetchCustomer(),
      fetchHistory(),
      fetchPackages(),
      fetchPhotos(),
      fetchLoyaltyHistory(),
      fetchWalletHistory(),
      fetchMedicalRecords(),
    ]).finally(() => setLoading(false));
  }, [customerId, fetchCustomer, fetchHistory, fetchPackages, fetchPhotos, fetchLoyaltyHistory, fetchWalletHistory, fetchMedicalRecords]);

  // ── Actions ──────────────────────────────────────────────────────────────

  const openEditPackage = (pkg: CustomerPackageItem) => {
    setEditingPackage(pkg);
    setPackageEditForm({
      expiresAt: pkg.expiresAt ? new Date(pkg.expiresAt).toISOString().split('T')[0] : "",
      serviceQuotas: pkg.serviceQuotas.map(q => ({
        _id: (q as any)._id,
        service: (q as any).service || (q as any)._id,
        serviceName: q.serviceName,
        remainingQuota: q.remainingQuota
      }))
    });
    setIsEditPackageModalOpen(true);
  };

  const savePackageEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPackage) return;
    setSavingPackage(true);
    try {
      const res = await fetch(`/api/customer-packages/${editingPackage._id}`, {
        method: "PUT",
        headers: { "x-store-slug": slug, "Content-Type": "application/json" },
        body: JSON.stringify(packageEditForm),
      });
      const data = await res.json();
      if (data.success) {
        await fetchPackages();
        setIsEditPackageModalOpen(false);
      } else {
        alert(data.error || "Gagal update paket");
      }
    } finally {
      setSavingPackage(false);
    }
  };

  const deletePackage = async (pkgId: string) => {
    if (!confirm("Batalkan paket ini? Sisa kuota akan hangus.")) return;
    try {
      const res = await fetch(`/api/customer-packages/${pkgId}`, {
        method: "DELETE",
        headers: { "x-store-slug": slug }
      });
      const data = await res.json();
      if (data.success) {
        await fetchPackages();
      } else {
        alert(data.error || "Gagal membatalkan paket");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const toggleWaNotif = async () => {
    if (!customer) return;
    const newVal = !customer.waNotifEnabled;
    const res = await fetch(`/api/customers/${customerId}`, {
      method: "PUT",
      headers: { "x-store-slug": slug, "Content-Type": "application/json" },
      body: JSON.stringify({ waNotifEnabled: newVal }),
    });
    const data = await res.json();
    if (data.success) setCustomer((prev) => prev ? { ...prev, waNotifEnabled: newVal } : prev);
  };

  const saveNotes = async () => {
    setSavingNotes(true);
    try {
      const res = await fetch(`/api/customers/${customerId}/notes`, {
        method: "PATCH",
        headers: { "x-store-slug": slug, "Content-Type": "application/json" },
        body: JSON.stringify({ preferenceNotes: notesForm }),
      });
      const data = await res.json();
      if (data.success) {
        setCustomer((prev) => prev ? { ...prev, preferenceNotes: notesForm } : prev);
        setIsNotesModalOpen(false);
      } else {
        alert(data.error || "Gagal menyimpan catatan");
      }
    } finally {
      setSavingNotes(false);
    }
  };

  const saveMembership = async () => {
    setSavingMembership(true);
    try {
      const res = await fetch(`/api/customers/${customerId}`, {
        method: "PUT",
        headers: { "x-store-slug": slug, "Content-Type": "application/json" },
        body: JSON.stringify({ membershipTier: membershipForm }),
      });
      const data = await res.json();
      if (data.success) {
        setCustomer((prev) => prev ? { ...prev, membershipTier: membershipForm } : prev);
        setIsMembershipModalOpen(false);
      } else {
        alert(data.error || "Gagal update membership");
      }
    } finally {
      setSavingMembership(false);
    }
  };

  const savePhoto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!photoForm.before || !photoForm.after) {
      alert("Foto before dan after wajib diisi");
      return;
    }
    setSavingPhoto(true);
    try {
      const res = await fetch(`/api/customers/${customerId}/photos`, {
        method: "POST",
        headers: { "x-store-slug": slug, "Content-Type": "application/json" },
        body: JSON.stringify(photoForm),
      });
      const data = await res.json();
      if (data.success) {
        await fetchPhotos();
        setPhotoForm({ before: "", after: "", note: "" });
        setIsPhotoModalOpen(false);
      } else {
        alert(data.error || "Gagal menyimpan foto");
      }
    } finally {
      setSavingPhoto(false);
    }
  };

  const deletePhoto = async (photoId: string) => {
    if (!confirm("Hapus foto ini?")) return;
    await fetch(`/api/customers/${customerId}/photos?photoId=${photoId}`, { headers: { "x-store-slug": slug }, method: "DELETE", });
    setPhotos((prev) => prev.filter((p) => p._id !== photoId));
  };

  const saveMedicalRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingMedical(true);
    try {
      const isEdit = !!medicalForm._id;
      const url = `/api/customers/${customerId}/medical-records${isEdit ? `/${medicalForm._id}` : ""}`;
      const res = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "x-store-slug": slug, "Content-Type": "application/json" },
        body: JSON.stringify(medicalForm),
      });
      const data = await res.json();
      if (data.success) {
        await fetchMedicalRecords();
        setIsMedicalModalOpen(false);
      } else {
        alert(data.error || "Gagal menyimpan rekam medis");
      }
    } finally {
      setSavingMedical(false);
    }
  };

  const deleteMedicalRecord = async (recordId: string) => {
    if (!confirm("Hapus rekam medis ini?")) return;
    try {
      const res = await fetch(`/api/customers/${customerId}/medical-records/${recordId}`, {
        method: "DELETE",
        headers: { "x-store-slug": slug },
      });
      const data = await res.json();
      if (data.success) {
        setMedicalRecords((prev) => prev.filter((r) => r._id !== recordId));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const copyReferral = () => {
    if (!customer?.referralCode) return;
    navigator.clipboard.writeText(customer.referralCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Derived ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-blue-900 border-t-transparent"></div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 mb-4">Customer tidak ditemukan</p>
          <button
            onClick={() => router.push("/customers")}
            className="px-4 py-2 bg-blue-900 text-white rounded-lg text-sm font-semibold"
          >
            Kembali
          </button>
        </div>
      </div>
    );
  }

  const tier = MEMBERSHIP_TIERS[customer.membershipTier] ?? MEMBERSHIP_TIERS.regular;
  const totalRemainingQuota = activePackages.reduce(
    (sum, pkg) =>
      sum +
      pkg.serviceQuotas.reduce((s, q) => s + q.remainingQuota, 0),
    0,
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">

        {/* ── Back ── */}
        <button
          onClick={() => router.push("/customers")}
          className="inline-flex items-center gap-2 text-sm font-semibold text-gray-500 hover:text-gray-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Kembali ke Customers
        </button>

        {/* ── Header Card ── */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              {/* Avatar */}
              <div className="w-14 h-14 rounded-full bg-blue-900 flex items-center justify-center text-white text-xl font-black flex-shrink-0">
                {customer.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <h1 className="text-xl font-black text-gray-900">
                  {customer.name}
                </h1>
                <div className="flex flex-wrap gap-2 mt-1">
                  {customer.email && (
                    <span className="flex items-center gap-1 text-xs text-gray-500">
                      <Mail className="w-3 h-3" />
                      {customer.email}
                    </span>
                  )}
                  {customer.phone && (
                    <span className="flex items-center gap-1 text-xs text-gray-500">
                      <Phone className="w-3 h-3" />
                      {customer.phone}
                    </span>
                  )}
                  {customer.address && (
                    <span className="flex items-center gap-1 text-xs text-gray-500">
                      <MapPin className="w-3 h-3" />
                      {customer.address}
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-gray-400 mt-1">
                  Member sejak {fmtDate(customer.createdAt)}
                </p>
              </div>
            </div>

            {/* WA Opt-in toggle */}
            <button
              onClick={toggleWaNotif}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold transition-colors ${customer.waNotifEnabled
                ? "bg-green-50 border-green-200 text-green-700 hover:bg-green-100"
                : "bg-gray-100 border-gray-200 text-gray-500 hover:bg-gray-200"
                }`}
              title="Toggle WA Notification"
            >
              {customer.waNotifEnabled ? (
                <Bell className="w-3.5 h-3.5" />
              ) : (
                <BellOff className="w-3.5 h-3.5" />
              )}
              WA Notif {customer.waNotifEnabled ? "ON" : "OFF"}
            </button>
          </div>

          {/* ── Stats Row ── */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-5">
            {/* Membership */}
            <button
              onClick={() => setIsMembershipModalOpen(true)}
              className={`rounded-lg border p-3 text-left hover:opacity-80 transition-opacity ${tier.bg} ${tier.border}`}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <Crown className={`w-3.5 h-3.5 ${tier.color}`} />
                <span className={`text-[10px] font-bold uppercase ${tier.color}`}>
                  Membership
                </span>
              </div>
              <p className={`text-base font-black ${tier.color}`}>
                {tier.icon} {tier.label}
              </p>
              {customer.membershipTier === "premium" && customer.membershipExpiry && (
                <p className="text-[9px] text-yellow-600 mt-0.5 font-semibold">
                  s/d {new Date(customer.membershipExpiry).toLocaleDateString("id-ID")}
                </p>
              )}
            </button>

            {/* Loyalty Points */}
            <button
              onClick={() => setIsLoyaltyModalOpen(true)}
              className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-left hover:opacity-80 transition-opacity"
            >
              <div className="flex items-center gap-1.5 mb-1">
                <Star className="w-3.5 h-3.5 text-amber-600" />
                <span className="text-[10px] font-bold uppercase text-amber-700">
                  Loyalty Points
                </span>
              </div>
              <p className="text-base font-black text-amber-800">
                {customer.loyaltyPoints.toLocaleString("id-ID")} pts
              </p>
            </button>

            {/* Total Spending */}
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <FileText className="w-3.5 h-3.5 text-blue-700" />
                <span className="text-[10px] font-bold uppercase text-blue-700">
                  Total Belanja
                </span>
              </div>
              <p className="text-sm font-black text-blue-900">
                {fmt(customer.totalPurchases, settings.symbol)}
              </p>
            </div>

            {/* Paket Sisa */}
            <div className="rounded-lg border border-purple-200 bg-purple-50 p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Package className="w-3.5 h-3.5 text-purple-700" />
                <span className="text-[10px] font-bold uppercase text-purple-700">
                  Sisa Paket
                </span>
              </div>
              <p className="text-base font-black text-purple-900">
                {totalRemainingQuota} sesi
              </p>
              <p className="text-[9px] text-purple-500 mt-0.5">
                {activePackages.length} paket aktif
              </p>
            </div>

            {/* Wallet Balance */}
            <div className="rounded-lg border border-green-200 bg-green-50 p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Wallet className="w-3.5 h-3.5 text-green-700" />
                <span className="text-[10px] font-bold uppercase text-green-700">
                  Saldo Wallet
                </span>
              </div>
              <p className="text-sm font-black text-green-900">
                {fmt(customer.walletBalance || 0, settings.symbol)}
              </p>
            </div>
          </div>

          {/* Referral Code */}
          {customer.referralCode && (
            <div className="mt-3">
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                <Gift className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <span className="text-xs text-gray-500">Kode Referral:</span>
                <span className="text-sm font-black text-gray-900 tracking-widest">
                  {customer.referralCode}
                </span>
                <button
                  onClick={copyReferral}
                  className="ml-auto p-1 text-gray-400 hover:text-gray-700 transition-colors"
                  title="Copy kode"
                >
                  {copied ? (
                    <Check className="w-3.5 h-3.5 text-green-600" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
              {/* [U04 FIX] Info VIP-only referral reward — cegah customer bingung reward tidak datang */}
              {customer.membershipTier !== "premium" && (
                <p className="mt-1 text-xs text-amber-600 flex items-center gap-1">
                  <span>⚠️</span>
                  <span>Reward referral hanya diberikan jika customer ini adalah <strong>Member VIP</strong>. Upgrade tier untuk mengaktifkan reward.</span>
                </p>
              )}
            </div>
          )}

          {/* Referred By */}
          {customer.referredBy && (
            <div className="mt-3 flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
              <Gift className="w-4 h-4 text-blue-400 flex-shrink-0" />
              <span className="text-xs text-blue-500">Referred by:</span>
              <span className="text-sm font-black text-blue-900">
                {customer.referredBy.name}
              </span>
            </div>
          )}
        </div>

        {/* ── Active Packages ── */}
        {activePackages.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h2 className="text-sm font-black text-gray-900 mb-3 flex items-center gap-2">
              <Package className="w-4 h-4 text-purple-600" />
              Paket Aktif ({activePackages.length})
            </h2>
            <div className="space-y-2">
              {activePackages.map((pkg) => (
                <div
                  key={pkg._id}
                  className="rounded-lg border border-purple-100 bg-purple-50 px-3 py-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-purple-900">
                      {pkg.packageName}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] text-purple-500">
                          Exp: {pkg.expiresAt ? fmtDate(pkg.expiresAt) : "Seumur Hidup"}
                      </span>
                      <PermissionGate resource="pos" action="edit">
                        <div className="flex items-center gap-1">
                          <button onClick={() => openEditPackage(pkg)} className="p-1 text-purple-500 hover:text-purple-700 bg-white rounded-md border border-purple-200" title="Edit Paket">
                            <Edit className="w-3 h-3" />
                          </button>
                          <PermissionGate resource="pos" action="delete">
                            <button onClick={() => deletePackage(pkg._id)} className="p-1 text-red-500 hover:text-red-700 bg-white rounded-md border border-red-200" title="Batalkan Paket">
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </PermissionGate>
                        </div>
                      </PermissionGate>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-1.5">
                    {pkg.serviceQuotas.map((q, i) => (
                      <span
                        key={i}
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${q.remainingQuota > 0
                          ? "bg-white border-purple-200 text-purple-700"
                          : "bg-gray-100 border-gray-200 text-gray-400 line-through"
                          }`}
                      >
                        {q.serviceName}: {q.remainingQuota}/{q.totalQuota}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Tab Content ── */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          {/* Tabs */}
          <div className="flex border-b border-gray-200 px-4 pt-1 overflow-x-auto whitespace-nowrap hide-scrollbar">
            {(
              [
                { id: "invoices", label: "Riwayat Invoice", count: invoices.length },
                { id: "packages", label: "Riwayat Paket", count: packageOrders.length },
                { id: "wallet", label: "Riwayat Wallet", count: walletTransactions.length },
                { id: "photos", label: "Before & After", count: photos.length },
                { id: "notes", label: "Catatan Preferensi", count: null },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`pb-3 pt-2 px-3 text-xs font-bold transition-colors border-b-2 mr-2 ${activeTab === tab.id
                  ? "border-blue-900 text-blue-900"
                  : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
              >
                {tab.label}
                {tab.count !== null && (
                  <span
                    className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[9px] font-black ${activeTab === tab.id
                      ? "bg-blue-900 text-white"
                      : "bg-gray-100 text-gray-500"
                      }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="p-4">

            {/* ── Invoices Tab ── */}
            {activeTab === "invoices" && (
              <div className="space-y-2">
                {invoices.length === 0 ? (
                  <div className="text-center py-10 text-gray-400">
                    <FileText className="w-10 h-10 mx-auto mb-2 opacity-20" />
                    <p className="text-sm">Belum ada transaksi</p>
                  </div>
                ) : (
                  invoices.map((inv) => (
                    <div
                      key={inv._id}
                      className="border border-gray-200 rounded-lg overflow-hidden"
                    >
                      <button
                        onClick={() =>
                          setExpandedInvoice(
                            expandedInvoice === inv._id ? null : inv._id,
                          )
                        }
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors text-left"
                      >
                        <div>
                          <p className="text-sm font-bold text-gray-900">
                            {inv.invoiceNumber}
                          </p>
                          <p className="text-xs text-gray-500">
                            {fmtDate(inv.date)} · {inv.paymentMethod}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className="text-sm font-black text-blue-900">
                              {fmt(inv.totalAmount, settings.symbol)}
                            </p>
                            <span
                              className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full ${inv.status === "paid"
                                ? "bg-green-100 text-green-700"
                                : inv.status === "pending"
                                  ? "bg-amber-100 text-amber-700"
                                  : "bg-gray-100 text-gray-600"
                                }`}
                            >
                              {inv.status}
                            </span>
                          </div>
                          {expandedInvoice === inv._id ? (
                            <ChevronUp className="w-4 h-4 text-gray-400" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-gray-400" />
                          )}
                        </div>
                      </button>
                      {expandedInvoice === inv._id && (
                        <div className="border-t border-gray-100 px-4 py-3 bg-gray-50 space-y-2">
                          <div className="space-y-1">
                            {(inv.items || []).map((item, i) => (
                              <div
                                key={i}
                                className="flex justify-between text-xs text-gray-600"
                              >
                                <span className="truncate flex-1">
                                  {item.name}{" "}
                                  {item.quantity > 1 && (
                                    <span className="text-gray-400">
                                      ×{item.quantity}
                                    </span>
                                  )}
                                </span>
                                <span className="font-semibold ml-2 flex-shrink-0">
                                  {fmt(item.total, settings.symbol)}
                                </span>
                              </div>
                            ))}
                          </div>

                          {/* Action Button */}
                          <div className="pt-2 border-t border-gray-200 flex justify-end">
                            <TenantLink href={`/invoices/print/${inv._id}`} className="text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 px-3 py-1.5 rounded-md font-semibold transition-colors flex items-center gap-1.5 border border-blue-100">
                              <FileText className="w-3 h-3" />
                              Lihat Receipt
                            </TenantLink>
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            {/* ── Packages Tab ── */}
            {activeTab === "packages" && (
              <div className="space-y-3">
                {packageOrders.length === 0 && packageUsage.length === 0 ? (
                  <div className="text-center py-10 text-gray-400">
                    <Package className="w-10 h-10 mx-auto mb-2 opacity-20" />
                    <p className="text-sm">Belum ada pembelian atau penggunaan paket</p>
                  </div>
                ) : (
                  <>
                    {packageOrders.length > 0 && (
                      <div>
                        <h3 className="text-xs font-black text-gray-500 uppercase tracking-wider mb-2">
                          Pembelian Paket
                        </h3>
                        <div className="space-y-1.5">
                          {packageOrders.map((po) => (
                            <div
                              key={po._id}
                              className="flex items-center justify-between border border-gray-200 rounded-lg px-3 py-2"
                            >
                              <div>
                                <p className="text-sm font-semibold text-gray-800">
                                  {po.packageName || "Paket"}
                                </p>
                                <p className="text-xs text-gray-500">
                                  {fmtDate(po.createdAt)} {po.invoiceNumber && po.invoiceNumber !== '-' ? `• Inv: ${po.invoiceNumber}` : ''}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-sm font-bold text-blue-900">
                                  {fmt(po.totalAmount, settings.symbol)}
                                </p>
                                <span
                                  className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full ${po.status === "paid"
                                    ? "bg-green-100 text-green-700"
                                    : "bg-amber-100 text-amber-700"
                                    }`}
                                >
                                  {po.status}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {packageUsage.length > 0 && (
                      <div>
                        <h3 className="text-xs font-black text-gray-500 uppercase tracking-wider mb-2 mt-4">
                          Riwayat Penggunaan
                        </h3>
                        <div className="space-y-1.5">
                          {packageUsage.map((u) => (
                            <div
                              key={u._id}
                              className="flex items-center justify-between border border-gray-100 rounded-lg px-3 py-2 bg-gray-50"
                            >
                              <div>
                                <p className="text-sm font-semibold text-gray-800">
                                  {u.serviceName}
                                </p>
                                <p className="text-xs text-gray-500">
                                  {fmtDate(u.createdAt || u.usedAt || "")} {u.invoiceNumber && u.invoiceNumber !== '-' ? `• Inv: ${u.invoiceNumber}` : ''}
                                </p>
                              </div>
                              <span className="text-xs font-bold text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-full">
                                ×{u.quantity}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ── Before & After Tab ── */}
            {activeTab === "photos" && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs text-gray-500">
                    {photos.length} foto tersimpan
                  </p>
                  <button
                    onClick={() => setIsPhotoModalOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-900 text-white text-xs font-bold rounded-lg hover:bg-blue-800 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> Tambah Foto
                  </button>
                </div>

                {photos.length === 0 ? (
                  <div className="text-center py-10 text-gray-400">
                    <Camera className="w-10 h-10 mx-auto mb-2 opacity-20" />
                    <p className="text-sm">Belum ada foto before & after</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {photos.map((photo) => (
                      <div
                        key={photo._id}
                        className="border border-gray-200 rounded-xl overflow-hidden"
                      >
                        <div className="grid grid-cols-2">
                          <div className="relative">
                            <img
                              src={photo.before?.startsWith('/uploads/') ? `/api${photo.before}` : photo.before}
                              alt="Before"
                              className="w-full aspect-square object-cover"
                            />
                            <span className="absolute bottom-1 left-1 text-[9px] font-black bg-black/50 text-white px-1.5 py-0.5 rounded">
                              BEFORE
                            </span>
                          </div>
                          <div className="relative">
                            <img
                              src={photo.after?.startsWith('/uploads/') ? `/api${photo.after}` : photo.after}
                              alt="After"
                              className="w-full aspect-square object-cover"
                            />
                            <span className="absolute bottom-1 right-1 text-[9px] font-black bg-blue-900/80 text-white px-1.5 py-0.5 rounded">
                              AFTER
                            </span>
                          </div>
                        </div>
                        <div className="px-3 py-2 flex items-center justify-between">
                          <div>
                            <p className="text-[10px] text-gray-500">
                              {fmtDate(photo.date)}
                            </p>
                            {photo.note && (
                              <p className="text-xs text-gray-700 font-medium">
                                {photo.note}
                              </p>
                            )}
                          </div>
                          <button
                            onClick={() => deletePhoto(photo._id)}
                            className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Medical Records Tab ── */}
            {activeTab === "medical_records" && (
              <div>
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h3 className="text-sm font-black text-gray-900 flex items-center gap-2">
                      <Stethoscope className="w-4 h-4 text-blue-600" /> Rekam Medis & History Treatment
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">Catatan lengkap keluhan, diagnosa, dan tindakan</p>
                  </div>
                  <button
                    onClick={() => {
                      setMedicalForm({
                        _id: "",
                        date: new Date().toISOString().split("T")[0],
                        complaint: "",
                        diagnosis: "",
                        treatment: "",
                        prescription: "",
                        handledBy: "",
                      });
                      setIsMedicalModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-900 text-white text-xs font-bold rounded-lg hover:bg-blue-800 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> Tambah Rekam Medis
                  </button>
                </div>

                {medicalRecords.length === 0 ? (
                  <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-xl">
                    <ClipboardList className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                    <p className="text-sm font-semibold text-gray-600">Belum ada rekam medis</p>
                    <p className="text-xs text-gray-400 mt-1">Tambahkan catatan setelah customer selesai treatment</p>
                  </div>
                ) : (
                  <div className="relative pl-4 sm:pl-6 border-l-2 border-blue-100 space-y-8 py-4">
                    {medicalRecords.map((record) => (
                      <div key={record._id} className="relative">
                        {/* Timeline Dot */}
                        <div className="absolute -left-[21px] sm:-left-[29px] top-1 w-3.5 h-3.5 bg-blue-500 rounded-full border-[3px] border-white shadow-sm ring-1 ring-blue-100"></div>
                        
                        <div className="bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-shadow overflow-hidden">
                          <div className="bg-gray-50/50 border-b border-gray-100 px-4 py-3 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-black text-gray-900 bg-white px-2.5 py-1 rounded-md border border-gray-200 shadow-sm">
                                {fmtDate(record.date)}
                              </span>
                              {record.handledBy && (
                                <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-md border border-blue-100">
                                  Terapis: {record.handledBy}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => {
                                  setMedicalForm({
                                    _id: record._id,
                                    date: new Date(record.date).toISOString().split("T")[0],
                                    complaint: record.complaint || "",
                                    diagnosis: record.diagnosis || "",
                                    treatment: record.treatment || "",
                                    prescription: record.prescription || "",
                                    handledBy: record.handledBy || "",
                                  });
                                  setIsMedicalModalOpen(true);
                                }}
                                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => deleteMedicalRecord(record._id)}
                                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                          
                          <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                            {record.complaint && (
                              <div>
                                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Keluhan / Masalah</p>
                                <p className="text-sm text-gray-800 bg-gray-50 p-2.5 rounded-lg border border-gray-100">{record.complaint}</p>
                              </div>
                            )}
                            {record.diagnosis && (
                              <div>
                                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Analisa / Diagnosa</p>
                                <p className="text-sm text-gray-800 bg-blue-50/30 p-2.5 rounded-lg border border-blue-50">{record.diagnosis}</p>
                              </div>
                            )}
                            {record.treatment && (
                              <div className="md:col-span-2">
                                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Tindakan / Treatment</p>
                                <p className="text-sm text-gray-800 bg-green-50/30 p-2.5 rounded-lg border border-green-50">{record.treatment}</p>
                              </div>
                            )}
                            {record.prescription && (
                              <div className="md:col-span-2">
                                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Resep / Saran Homecare</p>
                                <p className="text-sm text-gray-800 bg-amber-50/30 p-2.5 rounded-lg border border-amber-50">{record.prescription}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Notes Tab ── */}
            {activeTab === "notes" && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs text-gray-500 font-semibold">
                    Catatan preferensi & kebiasaan customer
                  </p>
                  <button
                    onClick={() => {
                      setNotesForm(customer.preferenceNotes || "");
                      setIsNotesModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-700 text-xs font-bold rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <Edit className="w-3.5 h-3.5" /> Edit Catatan
                  </button>
                </div>
                {customer.preferenceNotes ? (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                    <p className="text-sm text-amber-900 whitespace-pre-wrap leading-relaxed">
                      {customer.preferenceNotes}
                    </p>
                  </div>
                ) : (
                  <div className="text-center py-10 text-gray-400">
                    <FileText className="w-10 h-10 mx-auto mb-2 opacity-20" />
                    <p className="text-sm">Belum ada catatan preferensi</p>
                    <button
                      onClick={() => setIsNotesModalOpen(true)}
                      className="mt-2 text-xs font-semibold text-blue-900 hover:underline"
                    >
                      + Tambah catatan
                    </button>
                  </div>
                )}

                {/* General notes */}
                {customer.notes && (
                  <div className="mt-3 border border-gray-200 rounded-lg p-3">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1">
                      Catatan Umum
                    </p>
                    <p className="text-sm text-gray-700">{customer.notes}</p>
                  </div>
                )}
              </div>
            )}

            {/* ── Wallet Tab ── */}
            {activeTab === "wallet" && (
              <div className="space-y-3">
                {walletTransactions.length === 0 ? (
                  <div className="text-center py-10 text-gray-400">
                    <Wallet className="w-10 h-10 mx-auto mb-2 opacity-20" />
                    <p className="text-sm">Belum ada riwayat wallet</p>
                  </div>
                ) : (
                  walletTransactions.map((trx) => (
                    <div
                      key={trx._id}
                      className="border border-gray-200 rounded-lg p-3 bg-white flex justify-between items-center"
                    >
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${trx.type === "topup"
                              ? "bg-green-100 text-green-700"
                              : trx.type === "payment"
                                ? "bg-red-100 text-red-700"
                                : "bg-blue-100 text-blue-700"
                              }`}
                          >
                            {trx.type}
                          </span>
                          <span className="text-xs text-gray-500">
                            {fmtDate(trx.createdAt)}
                          </span>
                        </div>
                        <p className="text-sm font-bold text-gray-900">
                          {trx.description}
                        </p>
                        {trx.invoice?.invoiceNumber && (
                          <p className="text-xs text-gray-500 mt-0.5">
                            Invoice: {trx.invoice.invoiceNumber}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <p
                          className={`text-sm font-black ${trx.type === "topup" || trx.type === "bonus" || trx.type === "refund"
                            ? "text-green-600"
                            : "text-red-600"
                            }`}
                        >
                          {trx.type === "topup" || trx.type === "bonus" || trx.type === "refund" ? "+" : "-"}
                          {fmt(trx.amount, settings.symbol)}
                        </p>
                        <p className="text-[10px] text-gray-500 mt-0.5 font-semibold">
                          Saldo: {fmt(trx.balanceAfter, settings.symbol)}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Notes Modal ── */}
      <Modal
        isOpen={isNotesModalOpen}
        onClose={() => setIsNotesModalOpen(false)}
        title="Edit Catatan Preferensi"
      >
        <div className="space-y-4">
          <textarea
            value={notesForm}
            onChange={(e) => setNotesForm(e.target.value)}
            rows={6}
            placeholder="Contoh: Suka warna natural, alergi bahan kimia tertentu, prefer stylist A, dll..."
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900 resize-none"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setIsNotesModalOpen(false)}
              className="px-4 py-2 text-sm font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              Batal
            </button>
            <FormButton
              onClick={saveNotes}
              loading={savingNotes}
              variant="primary"
            >
              Simpan
            </FormButton>
          </div>
        </div>
      </Modal>

      {/* ── Membership Modal ── */}
      <Modal
        isOpen={isMembershipModalOpen}
        onClose={() => setIsMembershipModalOpen(false)}
        title="Update Membership"
      >
        <div className="space-y-3">
          <p className="text-xs text-gray-500">
            Pilih status membership untuk customer ini.
          </p>
          <div className="space-y-2">
            {(["regular", "premium"] as const).map((t) => {
              const info = MEMBERSHIP_TIERS[t];
              return (
                <button
                  key={t}
                  onClick={() => setMembershipForm(t)}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-colors ${membershipForm === t
                    ? `${info.bg} ${info.border} ring-2 ring-blue-900`
                    : `${info.bg} ${info.border} hover:opacity-80`
                    }`}
                >
                  <span className="text-xl">{info.icon}</span>
                  <p className={`text-sm font-black ${info.color}`}>
                    {info.label}
                  </p>
                </button>
              );
            })}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => setIsMembershipModalOpen(false)}
              className="px-4 py-2 text-sm font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              Batal
            </button>
            <FormButton
              onClick={saveMembership}
              loading={savingMembership}
              variant="primary"
            >
              Simpan
            </FormButton>
          </div>
        </div>
      </Modal>

      {/* ── Photo Modal ── */}
      <Modal
        isOpen={isPhotoModalOpen}
        onClose={() => setIsPhotoModalOpen(false)}
        title="Tambah Foto Before & After"
        size="lg"
      >
        <form onSubmit={savePhoto} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Foto Before <span className="text-red-500">*</span>
              </label>
              <ImageUpload
                label=""
                value={photoForm.before}
                onChange={(url) =>
                  setPhotoForm((prev) => ({ ...prev, before: url }))
                }
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Foto After <span className="text-red-500">*</span>
              </label>
              <ImageUpload
                label=""
                value={photoForm.after}
                onChange={(url) =>
                  setPhotoForm((prev) => ({ ...prev, after: url }))
                }
              />
            </div>
          </div>
          <FormInput
            label="Keterangan (opsional)"
            value={photoForm.note}
            onChange={(e) =>
              setPhotoForm((prev) => ({ ...prev, note: e.target.value }))
            }
            placeholder="Contoh: Haircut + Color session"
          />
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsPhotoModalOpen(false)}
              className="px-4 py-2 text-sm font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              Batal
            </button>
            <FormButton type="submit" loading={savingPhoto} variant="primary">
              Simpan Foto
            </FormButton>
          </div>
        </form>
      </Modal>
      <Modal
        isOpen={isLoyaltyModalOpen}
        onClose={() => setIsLoyaltyModalOpen(false)}
        title="Loyalty Points History"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-amber-50 rounded-lg border border-amber-200">
            <div>
              <p className="text-xs font-bold text-amber-700 uppercase">Current Balance</p>
              <p className="text-2xl font-black text-amber-900">{customer.loyaltyPoints.toLocaleString("id-ID")} <span className="text-base">pts</span></p>
            </div>
            <Star className="w-10 h-10 text-amber-300 opacity-50" />
          </div>

          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
              <h3 className="text-xs font-bold text-gray-700 uppercase">Transaction History</h3>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {loadingLoyalty ? (
                <div className="p-8 text-center text-gray-500">
                  <div className="animate-spin rounded-full h-8 w-8 border-2 border-amber-600 border-t-transparent mx-auto mb-2"></div>
                  <p className="text-sm">Loading history...</p>
                </div>
              ) : loyaltyHistory.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <p className="text-sm">Belum ada riwayat poin loyalty</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {loyaltyHistory.map((item) => (
                    <div key={item._id} className="p-4 hover:bg-gray-50 transition-colors">
                      <div className="flex justify-between items-start mb-1">
                        <div>
                          <p className="text-sm font-bold text-gray-900">{item.description}</p>
                          <p className="text-[10px] text-gray-500">{fmtDate(item.date)}</p>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-[11px] font-black ${
                          item.type === 'earned' ? 'bg-green-100 text-green-700' :
                          item.type === 'redeemed' ? 'bg-red-100 text-red-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {item.type === 'earned' ? '+' : item.type === 'redeemed' ? '-' : ''}
                          {item.points.toLocaleString("id-ID")}
                        </span>
                      </div>
                      {item.invoice && (
                        <p className="text-[10px] text-gray-400 mt-1">
                          Invoice: {item.invoice.invoiceNumber}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </Modal>

      {/* ── Medical Record Modal ── */}
      <Modal
        isOpen={isMedicalModalOpen}
        onClose={() => !savingMedical && setIsMedicalModalOpen(false)}
        title={medicalForm._id ? "Edit Rekam Medis" : "Tambah Rekam Medis Baru"}
      >
        <form onSubmit={saveMedicalRecord} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormInput
              label="Tanggal Kunjungan"
              type="date"
              value={medicalForm.date}
              onChange={(e) => setMedicalForm({ ...medicalForm, date: e.target.value })}
              required
            />
            <FormInput
              label="Staff / Terapis yang Menangani"
              type="text"
              placeholder="Contoh: dr. Sarah / Kapster Budi"
              value={medicalForm.handledBy}
              onChange={(e) => setMedicalForm({ ...medicalForm, handledBy: e.target.value })}
            />
          </div>
          
          <div className="space-y-1">
            <label className="text-sm font-bold text-gray-700">Keluhan / Masalah</label>
            <textarea
              value={medicalForm.complaint}
              onChange={(e) => setMedicalForm({ ...medicalForm, complaint: e.target.value })}
              className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[80px]"
              placeholder="Contoh: Rambut rontok parah sejak 2 minggu lalu..."
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-bold text-gray-700">Analisa / Diagnosa</label>
            <textarea
              value={medicalForm.diagnosis}
              onChange={(e) => setMedicalForm({ ...medicalForm, diagnosis: e.target.value })}
              className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[80px]"
              placeholder="Contoh: Alopecia areata, kulit kepala sensitif..."
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-bold text-gray-700">Tindakan / Treatment yang Dilakukan</label>
            <textarea
              value={medicalForm.treatment}
              onChange={(e) => setMedicalForm({ ...medicalForm, treatment: e.target.value })}
              className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[80px]"
              placeholder="Contoh: Scalp peeling, injeksi serum DHT blocker..."
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-bold text-gray-700">Resep / Saran Homecare</label>
            <textarea
              value={medicalForm.prescription}
              onChange={(e) => setMedicalForm({ ...medicalForm, prescription: e.target.value })}
              className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[80px]"
              placeholder="Contoh: Shampoo anti-hairfall 3x seminggu, Hair tonic setiap habis keramas..."
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <button
              type="button"
              onClick={() => setIsMedicalModalOpen(false)}
              className="px-4 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 font-semibold"
              disabled={savingMedical}
            >
              Batal
            </button>
            <FormButton loading={savingMedical} type="submit">
              Simpan Rekam Medis
            </FormButton>
          </div>
        </form>
      </Modal>
      <Modal
        isOpen={isEditPackageModalOpen}
        onClose={() => setIsEditPackageModalOpen(false)}
        title="Edit Paket Aktif (Super Admin)"
      >
        <form onSubmit={savePackageEdit} className="space-y-4">
          <FormInput
            label="Tanggal Kadaluarsa (Kosongkan jika seumur hidup)"
            type="date"
            value={packageEditForm.expiresAt}
            onChange={(e) => setPackageEditForm({ ...packageEditForm, expiresAt: e.target.value })}
          />

          <div className="space-y-3 mt-4">
            <h4 className="text-sm font-bold text-gray-700">Sisa Kuota Service</h4>
            {packageEditForm.serviceQuotas.map((q, idx) => (
              <div key={idx} className="flex items-center gap-3">
                <span className="text-sm text-gray-600 flex-1 truncate">{q.serviceName}</span>
                <input
                  type="number"
                  min="0"
                  value={q.remainingQuota}
                  onChange={(e) => {
                    const newQuotas = [...packageEditForm.serviceQuotas];
                    newQuotas[idx].remainingQuota = parseInt(e.target.value) || 0;
                    setPackageEditForm({ ...packageEditForm, serviceQuotas: newQuotas });
                  }}
                  className="w-24 text-center border-gray-300 rounded-lg shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                />
                <span className="text-xs text-gray-400">sesi</span>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <button
              type="button"
              onClick={() => setIsEditPackageModalOpen(false)}
              className="px-4 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 font-semibold"
              disabled={savingPackage}
            >
              Batal
            </button>
            <FormButton loading={savingPackage} type="submit">
              Simpan Perubahan
            </FormButton>
          </div>
        </form>
      </Modal>
    </div>
  );
}