"use client";


import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Package, Clock, Pencil, Trash2 } from "lucide-react";
import SearchableSelect from "@/components/dashboard/SearchableSelect";
import Modal from "@/components/dashboard/Modal";
import { FormButton } from "@/components/dashboard/FormInput";
import ImageUpload from "@/components/dashboard/ImageUpload";
import { IconPicker } from "@/components/ui/IconPicker";
import { useSettings } from "@/components/providers/SettingsProvider";
import PermissionGate from "@/components/PermissionGate";

interface ServiceItem {
  _id: string;
  name: string;
  price: number;
}

interface ServicePackageItem {
  service: string;
  serviceName: string;
  quota: number;
}

interface ServicePackage {
  _id: string;
  name: string;
  code: string;
  description?: string;
  price: number;
  image?: string;
  icon?: string;
  commissionType?: 'percentage' | 'fixed';
  commissionValue?: number;
  sellingCommissionType?: 'percentage' | 'fixed';
  sellingCommissionValue?: number;
  validityDays?: number;
  isActive: boolean;
  items: ServicePackageItem[];
}

export default function PackagesPage() {
  const params = useParams();
  const slug = params.slug as string;
  const { settings } = useSettings();

  const [services, setServices] = useState<ServiceItem[]>([]);
  const [packages, setPackages] = useState<ServicePackage[]>([]);
  const [packageSearch, setPackageSearch] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formName, setFormName] = useState("");
  const [formCode, setFormCode] = useState("");
  const [formImage, setFormImage] = useState("");
  const [formIcon, setFormIcon] = useState("");
  const [formPrice, setFormPrice] = useState<number | string>("");
  const [formDescription, setFormDescription] = useState("");
  const [formItems, setFormItems] = useState<Array<{ serviceId: string; quota: number | string }>>([]);
  const [formCommissionType, setFormCommissionType] = useState<'percentage' | 'fixed'>('fixed');
  const [formCommissionValue, setFormCommissionValue] = useState<number | string>(0);
  const [formSellingCommissionType, setFormSellingCommissionType] = useState<'percentage' | 'fixed'>('fixed');
  const [formSellingCommissionValue, setFormSellingCommissionValue] = useState<number | string>(0);
  const [formValidityDays, setFormValidityDays] = useState<number | string>(0);
  const [editingPackage, setEditingPackage] = useState<ServicePackage | null>(null);

  const filteredPackages = useMemo(() => {
    const q = packageSearch.trim().toLowerCase();
    if (!q) return packages;
    return packages.filter(
      (pkg) =>
        pkg.name.toLowerCase().includes(q) ||
        pkg.code.toLowerCase().includes(q),
    );
  }, [packages, packageSearch]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [serviceRes, packageRes] = await Promise.all([
        fetch("/api/services/package-list", { headers: { "x-store-slug": slug } }),
        fetch("/api/service-packages", { headers: { "x-store-slug": slug } }),
      ]);

      const serviceData = await serviceRes.json();
      const packageData = await packageRes.json();

      if (serviceData.success) setServices(serviceData.data || []);
      if (packageData.success) setPackages(packageData.data || []);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const addFormItem = () => {
    setFormItems((prev) => [...prev, { serviceId: "", quota: 1 }]);
  };

  const removeFormItem = (index: number) => {
    setFormItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const updateFormItem = (index: number, patch: Partial<{ serviceId: string; quota: number | string }>) => {
    setFormItems((prev) => prev.map((item, idx) => (idx === index ? { ...item, ...patch } : item)));
  };

  const resetForm = () => {
    setFormName("");
    setFormCode("");
    setFormImage("");
    setFormIcon("");
    setFormPrice("");
    setFormDescription("");
    setFormItems([]);
    setFormCommissionType('fixed');
    setFormCommissionValue(0);
    setFormSellingCommissionType('fixed');
    setFormSellingCommissionValue(0);
    setFormValidityDays(0);
    setEditingPackage(null);
  };

  const createPackage = async () => {
    if (!formName || !formCode || Number(formPrice) <= 0 || formItems.length === 0) {
      alert("Lengkapi nama, kode, harga, dan item package");
      return;
    }

    const hasInvalidItem = formItems.some((item) => !item.serviceId || Number(item.quota) <= 0);
    if (hasInvalidItem) {
      alert("Semua item package harus punya service dan quota > 0");
      return;
    }

    setSaving(true);
    try {
      const url = editingPackage ? `/api/service-packages/${editingPackage._id}` : "/api/service-packages";
      const res = await fetch(url, {
        method: editingPackage ? "PUT" : "POST",
        headers: { "x-store-slug": slug, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName,
          code: formCode,
          description: formDescription,
          price: Number(formPrice),
          image: formImage || undefined,
          icon: formIcon || undefined,
          commissionType: formCommissionType,
          commissionValue: Number(formCommissionValue || 0),
          sellingCommissionType: formSellingCommissionType,
          sellingCommissionValue: Number(formSellingCommissionValue || 0),
          validityDays: Number(formValidityDays || 0),
          items: formItems.map((item) => ({ service: item.serviceId, quota: Number(item.quota) })),
        }),
      });

      const data = await res.json();
      if (!data.success) {
        alert(data.error || "Gagal membuat package");
        return;
      }

      resetForm();
      setIsModalOpen(false);
      await loadData();
    } catch (error) {
      console.error(error);
      alert("Gagal membuat package");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 text-gray-700">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-900 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 text-black">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Packages</h1>
          <p className="text-sm text-gray-500">Master paket kuota layanan</p>
        </div>
        <PermissionGate resource="packages" action="create">
          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-900 text-white rounded-lg hover:bg-blue-800 font-semibold text-sm"
          >
            <Plus className="w-4 h-4" />
            Buat Package
          </button>
        </PermissionGate>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
        <input
          type="text"
          placeholder="Cari nama atau kode paket..."
          className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900 text-sm"
          value={packageSearch}
          onChange={(e) => setPackageSearch(e.target.value)}
        />
      </div>

      {filteredPackages.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-500">
          <Package className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="font-semibold">
            {packages.length === 0 ? "Belum ada package" : "Tidak ada paket yang cocok"}
          </p>
          <p className="text-sm mt-1">
            {packages.length === 0
              ? "Klik Buat Package untuk menambah paket pertama."
              : "Coba kata kunci lain."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredPackages.map((pkg) => (
            <div
              key={pkg._id}
              className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col hover:shadow-sm transition-shadow"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-gray-900 truncate">{pkg.name}</p>
                  <p className="text-xs text-gray-500 font-mono mt-0.5">{pkg.code}</p>
                </div>
                <span
                  className={`shrink-0 text-[10px] uppercase tracking-wider font-black px-2 py-0.5 rounded-full ${
                    pkg.isActive
                      ? "bg-green-50 text-green-700 border border-green-200"
                      : "bg-gray-100 text-gray-500 border border-gray-200"
                  }`}
                >
                  {pkg.isActive ? "active" : "inactive"}
                </span>
              </div>

              {pkg.description ? (
                <p className="text-xs text-gray-500 mt-2 line-clamp-2">{pkg.description}</p>
              ) : null}

              <p className="text-lg font-black text-gray-900 mt-3">
                {settings.symbol}
                {pkg.price.toLocaleString("id-ID")}
              </p>

              <div className="flex flex-wrap gap-1.5 mt-2">
                {(pkg.validityDays || 0) > 0 ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-orange-700 bg-orange-50 border border-orange-100 px-2 py-0.5 rounded-full">
                    <Clock className="w-3 h-3" />
                    {pkg.validityDays} hari
                  </span>
                ) : (
                  <span className="text-[11px] font-medium text-gray-400">Tanpa batas waktu</span>
                )}
                {(pkg.commissionValue || 0) > 0 && (
                  <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full">
                    Komisi{" "}
                    {pkg.commissionType === "percentage"
                      ? `${pkg.commissionValue}%`
                      : `${settings.symbol}${(pkg.commissionValue || 0).toLocaleString("id-ID")}`}
                  </span>
                )}
              </div>

              <div className="mt-3 space-y-1 flex-1">
                {pkg.items.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between text-xs text-gray-700 bg-gray-50 rounded-md px-2 py-1"
                  >
                    <span className="truncate pr-2">
                      {item.serviceName ||
                        (typeof item.service === "object" && item.service
                          ? (item.service as any).name
                          : "Service")}
                    </span>
                    <span className="shrink-0 font-bold text-gray-900">{item.quota}x</span>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex items-center gap-2 border-t border-gray-100 pt-3">
                <PermissionGate resource="packages" action="edit">
                  <button
                    onClick={() => {
                      setEditingPackage(pkg);
                      setFormName(pkg.name);
                      setFormCode(pkg.code);
                      setFormImage(pkg.image || "");
                      setFormIcon((pkg as any).icon || "");
                      setFormPrice(pkg.price);
                      setFormDescription(pkg.description || "");
                      setFormCommissionType(pkg.commissionType || "fixed");
                      setFormCommissionValue(pkg.commissionValue || 0);
                      setFormSellingCommissionType(pkg.sellingCommissionType || "fixed");
                      setFormSellingCommissionValue(pkg.sellingCommissionValue || 0);
                      setFormValidityDays(pkg.validityDays || 0);
                      setFormItems(
                        pkg.items.map((i) => ({
                          serviceId:
                            typeof i.service === "string"
                              ? i.service
                              : (i.service as any)?._id || "",
                          quota: i.quota,
                        })),
                      );
                      setIsModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-blue-700 border border-blue-200 rounded-md bg-blue-50 hover:bg-blue-100"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Edit
                  </button>
                </PermissionGate>
                <PermissionGate resource="packages" action="delete">
                  <button
                    onClick={async () => {
                      if (!confirm(`Hapus package "${pkg.name}"?`)) return;
                      const res = await fetch(`/api/service-packages/${pkg._id}`, {
                        headers: { "x-store-slug": slug },
                        method: "DELETE",
                      });
                      const data = await res.json();
                      if (data.success) loadData();
                      else alert(data.error || "Gagal hapus");
                    }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-red-700 border border-red-200 rounded-md bg-red-50 hover:bg-red-100"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Hapus
                  </button>
                </PermissionGate>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); resetForm(); }} title={editingPackage ? "Edit Package" : "Buat Master Package"}>
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <ImageUpload 
              label="Package Image" 
              value={formImage} 
              onChange={(url) => setFormImage(url)} 
            />
            <IconPicker
              value={formIcon}
              onChange={setFormIcon}
            />
          </div>
          <input
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            placeholder="Nama package"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
          />
          <input
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            placeholder="Kode package (mis: HAIR10X)"
            value={formCode}
            onChange={(e) => setFormCode(e.target.value)}
          />
          <input
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            placeholder="Harga package"
            type="number"
            min="0"
            value={formPrice}
            onChange={(e) => setFormPrice(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">Tipe Komisi</label>
              <select
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={formCommissionType}
                onChange={(e) => setFormCommissionType(e.target.value as 'percentage' | 'fixed')}
              >
                <option value="fixed">Nominal (Rp)</option>
                <option value="percentage">Persentase (%)</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">Nilai Komisi</label>
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                placeholder={formCommissionType === 'percentage' ? 'Misal: 10' : 'Misal: 50000'}
                type="number"
                min="0"
                value={formCommissionValue}
                onChange={(e) => setFormCommissionValue(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">Tipe Komisi (Selling By)</label>
              <select
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={formSellingCommissionType}
                onChange={(e) => setFormSellingCommissionType(e.target.value as 'percentage' | 'fixed')}
              >
                <option value="fixed">Nominal (Rp)</option>
                <option value="percentage">Persentase (%)</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">Nilai Komisi (Selling By)</label>
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                placeholder={formSellingCommissionType === 'percentage' ? 'Misal: 10' : 'Misal: 50000'}
                type="number"
                min="0"
                value={formSellingCommissionValue}
                onChange={(e) => setFormSellingCommissionValue(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">Masa Berlaku (hari)</label>
            <input
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="0 = tanpa batas"
              type="number"
              min="0"
              value={formValidityDays}
              onChange={(e) => setFormValidityDays(e.target.value)}
            />
            <p className="text-[10px] text-gray-400 mt-1">Isi 0 jika paket tidak ada kedaluwarsa. Contoh: 90 = berlaku 90 hari setelah pembelian.</p>
          </div>
          <textarea
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            placeholder="Deskripsi"
            value={formDescription}
            onChange={(e) => setFormDescription(e.target.value)}
          />

          <div className="space-y-2">
            {formItems.map((item, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                <div className="col-span-8">
                  <SearchableSelect
                    placeholder="Pilih service"
                    value={item.serviceId}
                    onChange={(val) => updateFormItem(idx, { serviceId: val })}
                    options={services.map((svc) => ({ value: svc._id, label: `${svc.name} (${settings.symbol}${svc.price})` }))}
                  />
                </div>
                <input
                  className="col-span-3 border border-gray-300 rounded-lg px-2 py-2 text-sm"
                  type="number"
                  min="1"
                  value={item.quota}
                  onChange={(e) => updateFormItem(idx, { quota: e.target.value })}
                />
                <button className="col-span-1 text-xs text-red-600" onClick={() => removeFormItem(idx)}>x</button>
              </div>
            ))}
          </div>

          <button onClick={addFormItem} className="text-sm text-blue-700 font-semibold">+ tambah service kuota</button>

          <div className="pt-2">
            <FormButton onClick={createPackage} loading={saving} variant="success">{editingPackage ? "Update Package" : "Simpan Package"}</FormButton>
          </div>
        </div>
      </Modal>
    </div>
  );
}
