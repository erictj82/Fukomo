"use client";


import { useParams } from "next/navigation";
import { useState, useEffect } from "react";
import {
  Plus,
  Edit,
  Trash2,
  Search,
  Scissors,
  Tag,
  Clock,
  DollarSign,
  ChevronLeft,
  ChevronRight,
  Filter,
  FileText,
  Layers,
} from "lucide-react";
import Modal from "@/components/dashboard/Modal";
import FormInput, {
  FormSelect,
  FormButton,
} from "@/components/dashboard/FormInput";
import SearchableSelect from "@/components/dashboard/SearchableSelect";
import PermissionGate from "@/components/PermissionGate";
import { useSettings } from "@/components/providers/SettingsProvider";
import ImageUpload from "@/components/dashboard/ImageUpload";
import { IconPicker } from "@/components/ui/IconPicker";

interface Category {
  _id: string;
  name: string;
  status: string;
}

interface Service {
  _id: string;
  name: string;
  category: Category;
  duration: number;
  price: number;
  memberPrice?: number;
  commissionValue?: number;
  sellingCommissionType?: string;
  sellingCommissionValue?: number;
  gender: string;
  image?: string;
  icon?: string;
  status: string;
  createdAt: string;
  parentService?: string;
  isFavorite?: boolean;
  materialsUsed?: {
    product: string;
    productName: string;
    quantityPerService: number;
  }[];
  waFollowUp?: {
    enabled: boolean;
    firstDays: number;
    secondDays: number;
    firstDelayValue?: number;
    firstDelayUnit?: "minute" | "hour" | "day";
    secondDelayValue?: number;
    secondDelayUnit?: "minute" | "hour" | "day";
    firstTemplateId?: string;
    secondTemplateId?: string;
  };
}

interface WaTemplate {
  _id: string;
  name: string;
  metaStatus?: 'LOCAL' | 'PENDING' | 'APPROVED' | 'REJECTED';
}

interface ServiceBundleItem {
  service:
    | string
    | {
        _id: string;
        name: string;
        commissionType?: string;
        commissionValue?: number;
      };
  serviceName: string;
  servicePrice: number;
  duration: number;
  commissionType?: string;
  commissionValue?: number;
}

interface ServiceBundle {
  _id: string;
  name: string;
  description?: string;
  price: number;
  image?: string;
  isActive: boolean;
  services: ServiceBundleItem[];
}

export default function ServicesPage() {
  const params = useParams();
  const slug = params.slug as string;
  const { settings } = useSettings();
  const [services, setServices] = useState<Service[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [waTemplates, setWaTemplates] = useState<WaTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  // Service Modal State
  const [isServiceModalOpen, setIsServiceModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [serviceFormData, setServiceFormData] = useState({
    name: "",
    category: "",
    duration: 30,
    price: 0,
    memberPrice: 0,
    gender: "unisex",
    status: "active",
    commissionType: "fixed",
    commissionValue: 0,
    sellingCommissionType: "fixed",
    sellingCommissionValue: 0,
    image: "",
    icon: "",
    parentService: "",
    isFavorite: false,
    materialsUsed: [] as { product: string; productName: string; quantityPerService: number }[],
    waFollowUp: {
      enabled: false,
      firstDays: 0,
      secondDays: 0,
      firstDelayValue: 0,
      firstDelayUnit: "day",
      secondDelayValue: 0,
      secondDelayUnit: "day",
      firstTemplateId: "",
      secondTemplateId: "",
    },
  });

  // Category Modal State
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [categoryName, setCategoryName] = useState("");
  const [activeTab, setActiveTab] = useState<
    "services" | "categories" | "bundles"
  >("services");

  // Bundle State
  const [bundles, setBundles] = useState<ServiceBundle[]>([]);
  const [isBundleModalOpen, setIsBundleModalOpen] = useState(false);
  const [editingBundle, setEditingBundle] = useState<ServiceBundle | null>(
    null,
  );
  const [bundleSubmitting, setBundleSubmitting] = useState(false);
  const [bundleFormData, setBundleFormData] = useState<{
    name: string;
    description: string;
    price: number;
    sellingCommissionType?: string;
    sellingCommissionValue?: number;
    image: string;
    icon: string;
    services: {
      service: string;
      serviceName: string;
      servicePrice: number;
      duration: number;
      commissionType: string;
      commissionValue: number;
    }[];
  }>({
    name: "",
    description: "",
    price: 0,
    sellingCommissionType: "fixed",
    sellingCommissionValue: 0,
    image: "",
    icon: "",
    services: [],
  });
  const [bundleSelectedService, setBundleSelectedService] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [categorySubmitting, setCategorySubmitting] = useState(false);
  const [splitCommissionEnabled, setSplitCommissionEnabled] = useState(true);
  const [includeProductInCommission, setIncludeProductInCommission] =
    useState(false);

  // Filters & Pagination
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<any>({
    total: 0,
    page: 1,
    limit: 10,
    pages: 0,
  });

  useEffect(() => {
    fetchCategories();
    fetchWaTemplates();
    fetchBundles();
    fetchProducts();
  }, []);

  useEffect(() => {
    fetchServices();
  }, [selectedCategory, page]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      fetchServices();
    }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchCategories = async () => {
    const res = await fetch("/api/service-categories", { headers: { "x-store-slug": slug } });
    const data = await res.json();
    if (data.success) setCategories(data.data);
  };

  const fetchProducts = async () => {
    try {
      const res = await fetch("/api/products?limit=1000", { headers: { "x-store-slug": slug } });
      const data = await res.json();
      if (data.success) setProducts(data.data || []);
    } catch (error) {
      console.error(error);
    }
  };

  const fetchServices = async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams();
      query.append("page", page.toString());
      query.append("limit", "10");
      if (search) query.append("search", search);
      if (selectedCategory) query.append("category", selectedCategory);

      const res = await fetch(`/api/services?${query.toString()}`);
      const data = await res.json();
      if (data.success) {
        setServices(data.data);
        if (data.pagination) setPagination(data.pagination);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const fetchWaTemplates = async () => {
    try {
      const res = await fetch("/api/wa/templates?type=follow_up", { headers: { "x-store-slug": slug } });
      const data = await res.json();
      if (data.success) {
        setWaTemplates(data.data || []);
      }
    } catch (error) {
      console.error(error);
    }
  };

  const fetchBundles = async () => {
    try {
      const res = await fetch("/api/service-bundles", { headers: { "x-store-slug": slug } });
      const data = await res.json();
      if (data.success) setBundles(data.data || []);
    } catch (error) {
      console.error(error);
    }
  };

  const handleServiceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (serviceFormData.waFollowUp.enabled) {
      if ((serviceFormData.waFollowUp.firstDelayValue || 0) <= 0) {
        alert("First follow-up delay must be greater than 0");
        return;
      }

      if (!serviceFormData.waFollowUp.firstTemplateId) {
        alert("Please select first follow-up template");
        return;
      }

      if (
        (serviceFormData.waFollowUp.secondDelayValue || 0) > 0 &&
        !serviceFormData.waFollowUp.secondTemplateId
      ) {
        alert(
          "Please select second follow-up template or set second follow-up delay to 0",
        );
        return;
      }
    }

    setSubmitting(true);
    try {
      const url = editingService
        ? `/api/services/${editingService._id}`
        : "/api/services";
      const res = await fetch(url, {
        method: editingService ? "PUT" : "POST",
        headers: { "x-store-slug": slug, "Content-Type": "application/json" },
        body: JSON.stringify({
          ...serviceFormData,
          parentService: serviceFormData.parentService || null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        fetchServices();
        closeServiceModal();
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

  const handleCategorySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCategorySubmitting(true);
    try {
      const url = editingCategory
        ? `/api/service-categories/${editingCategory._id}`
        : "/api/service-categories";
      const res = await fetch(url, {
        method: editingCategory ? "PUT" : "POST",
        headers: { "x-store-slug": slug, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: categoryName,
          slug: categoryName.toLowerCase().replace(/\s+/g, "-"),
        }),
      });
      const data = await res.json();
      if (data.success) {
        fetchCategories();
        setCategoryName("");
        setIsCategoryModalOpen(false);
      } else {
        alert(data.error || "Failed to save category");
      }
    } catch (error) {
      console.error(error);
      alert("An error occurred");
    } finally {
      setCategorySubmitting(false);
    }
  };

  const handleCategoryDelete = async (id: string) => {
    if (
      !confirm(
        "Are you sure you want to delete this category? Services belonging to it may no longer be listed under it.",
      )
    )
      return;
    const res = await fetch(`/api/service-categories/${id}`, { headers: { "x-store-slug": slug }, method: "DELETE", });
    if ((await res.json()).success) fetchCategories();
  };

  const openCategoryModal = (cat?: Category) => {
    if (cat) {
      setEditingCategory(cat);
      setCategoryName(cat.name);
    } else {
      setEditingCategory(null);
      setCategoryName("");
    }
    setIsCategoryModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this service?")) return;
    const res = await fetch(`/api/services/${id}`, { headers: { "x-store-slug": slug }, method: "DELETE" });
    if ((await res.json()).success) fetchServices();
  };

  const openServiceModal = (service?: Service) => {
    if (service) {
      setEditingService(service);
      setSplitCommissionEnabled(true);
      setIncludeProductInCommission(false);
      setServiceFormData({
        name: service.name,
        category: service.category._id,
        duration: service.duration,
        price: service.price,
        memberPrice: (service as any).memberPrice || 0,
        gender: service.gender,
        status: service.status,
        commissionType: "fixed",
        commissionValue: Number(service.commissionValue || 0),
        sellingCommissionType: (service as any).sellingCommissionType || "fixed",
        sellingCommissionValue: Number((service as any).sellingCommissionValue || 0),
        image: service.image || "",
        icon: service.icon || "",
        parentService: service.parentService || "",
        isFavorite: service.isFavorite || false,
        materialsUsed: service.materialsUsed || [],
        waFollowUp: {
          enabled: service.waFollowUp?.enabled || false,
          firstDays: service.waFollowUp?.firstDays || 0,
          secondDays: service.waFollowUp?.secondDays || 0,
          firstDelayValue:
            service.waFollowUp?.firstDelayValue ??
            service.waFollowUp?.firstDays ??
            0,
          firstDelayUnit: service.waFollowUp?.firstDelayUnit || "day",
          secondDelayValue:
            service.waFollowUp?.secondDelayValue ??
            service.waFollowUp?.secondDays ??
            0,
          secondDelayUnit: service.waFollowUp?.secondDelayUnit || "day",
          firstTemplateId: service.waFollowUp?.firstTemplateId || "",
          secondTemplateId: service.waFollowUp?.secondTemplateId || "",
        },
      });
    } else {
      setEditingService(null);
      setSplitCommissionEnabled(true);
      setIncludeProductInCommission(false);
      setServiceFormData({
        name: "",
        category: categories[0]?._id || "",
        duration: 30,
        price: 0,
        memberPrice: 0,
        gender: "unisex",
        status: "active",
        commissionType: "fixed",
        commissionValue: 0,
        sellingCommissionType: "fixed",
        sellingCommissionValue: 0,
        image: "",
        icon: "",
        parentService: "",
        isFavorite: false,
        materialsUsed: [],
        waFollowUp: {
          enabled: false,
          firstDays: 0,
          secondDays: 0,
          firstDelayValue: 0,
          firstDelayUnit: "day",
          secondDelayValue: 0,
          secondDelayUnit: "day",
          firstTemplateId: "",
          secondTemplateId: "",
        },
      });
    }
    setIsServiceModalOpen(true);
  };

  const closeServiceModal = () => {
    setIsServiceModalOpen(false);
    setEditingService(null);
  };

  // Bundle handlers
  const openBundleModal = (bundle?: ServiceBundle) => {
    if (bundle) {
      setEditingBundle(bundle);
      setBundleFormData({
        name: bundle.name,
        description: bundle.description || "",
        price: bundle.price,
        sellingCommissionType: (bundle as any).sellingCommissionType || "fixed",
        sellingCommissionValue: (bundle as any).sellingCommissionValue || 0,
        image: bundle.image || "",
        icon: (bundle as any).icon || "",
        services: bundle.services.map((s) => ({
          service: typeof s.service === "string" ? s.service : s.service._id,
          serviceName: s.serviceName,
          servicePrice: s.servicePrice,
          duration: s.duration,
          commissionType: s.commissionType || "fixed",
          commissionValue: s.commissionValue || 0,
        })),
      });
    } else {
      setEditingBundle(null);
      setBundleFormData({
        name: "",
        description: "",
        price: 0,
        sellingCommissionType: "fixed",
        sellingCommissionValue: 0,
        image: "",
        icon: "",
        services: [],
      });
    }
    setBundleSelectedService("");
    setIsBundleModalOpen(true);
  };

  const closeBundleModal = () => {
    setIsBundleModalOpen(false);
    setEditingBundle(null);
    setBundleSelectedService("");
  };

  const addServiceToBundle = (serviceId: string) => {
    if (!serviceId) return;
    const svc = services.find((s) => s._id === serviceId);
    if (!svc) return;
    if (bundleFormData.services.some((s) => s.service === serviceId)) {
      alert("Jasa ini sudah ada di bundle");
      return;
    }
    setBundleFormData((prev) => ({
      ...prev,
      services: [
        ...prev.services,
        {
          service: svc._id,
          serviceName: svc.name,
          servicePrice: svc.price,
          duration: svc.duration,
          commissionType: "fixed",
          commissionValue: Number(svc.commissionValue || 0),
        },
      ],
    }));
    setBundleSelectedService("");
  };

  const removeServiceFromBundle = (index: number) => {
    setBundleFormData((prev) => ({
      ...prev,
      services: prev.services.filter((_, i) => i !== index),
    }));
  };

  const handleBundleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bundleFormData.name.trim()) {
      alert("Nama bundle wajib diisi");
      return;
    }
    if (bundleFormData.services.length < 1) {
      alert("Bundle harus memiliki minimal 1 jasa");
      return;
    }
    setBundleSubmitting(true);
    try {
      const url = editingBundle
        ? `/api/service-bundles/${editingBundle._id}`
        : "/api/service-bundles";
      const res = await fetch(url, {
        method: editingBundle ? "PUT" : "POST",
        headers: { "x-store-slug": slug, "Content-Type": "application/json" },
        body: JSON.stringify(bundleFormData),
      });
      const data = await res.json();
      if (data.success) {
        fetchBundles();
        closeBundleModal();
      } else {
        alert(data.error || "Gagal menyimpan bundle");
      }
    } catch (error) {
      console.error(error);
      alert("Terjadi kesalahan");
    } finally {
      setBundleSubmitting(false);
    }
  };

  const handleBundleDelete = async (id: string) => {
    if (!confirm("Hapus bundle ini?")) return;
    const res = await fetch(`/api/service-bundles/${id}`, { headers: { "x-store-slug": slug }, method: "DELETE" });
    if ((await res.json()).success) fetchBundles();
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header Section */}
        <div className="flex flex-col mb-4 gap-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Services & Categories
              </h1>
              <p className="text-sm text-gray-500">
                Manage your salon service catalog and categories
              </p>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
              <PermissionGate resource="services" action="create">
                {activeTab === "bundles" ? (
                  <button
                    onClick={() => openBundleModal()}
                    className="px-4 py-2 bg-blue-900 text-white rounded-lg hover:bg-blue-800 transition-all flex justify-center items-center gap-2 shadow-sm font-semibold text-sm w-full sm:w-auto"
                  >
                    <Plus className="w-4 h-4" />
                    New Bundle
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => openCategoryModal()}
                      className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-all flex justify-center items-center gap-2 shadow-sm font-semibold text-sm w-full sm:w-auto"
                    >
                      <Tag className="w-4 h-4" />
                      New Category
                    </button>
                    <button
                      onClick={() => openServiceModal()}
                      className="px-4 py-2 bg-blue-900 text-white rounded-lg hover:bg-blue-800 transition-all flex justify-center items-center gap-2 shadow-sm font-semibold text-sm w-full sm:w-auto"
                    >
                      <Plus className="w-4 h-4" />
                      New Service
                    </button>
                  </>
                )}
              </PermissionGate>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex space-x-6 border-b border-gray-200">
            <button
              onClick={() => setActiveTab("services")}
              className={`pb-3 text-sm font-bold transition-colors border-b-2 ${activeTab === "services" ? "border-blue-900 text-blue-900" : "border-transparent text-gray-500 hover:text-gray-700"}`}
            >
              Services
            </button>
            <button
              onClick={() => setActiveTab("categories")}
              className={`pb-3 text-sm font-bold transition-colors border-b-2 ${activeTab === "categories" ? "border-blue-900 text-blue-900" : "border-transparent text-gray-500 hover:text-gray-700"}`}
            >
              Categories
            </button>
            <button
              onClick={() => setActiveTab("bundles")}
              className={`pb-3 text-sm font-bold transition-colors border-b-2 flex items-center gap-1.5 ${activeTab === "bundles" ? "border-blue-900 text-blue-900" : "border-transparent text-gray-500 hover:text-gray-700"}`}
            >
              <Layers className="w-3.5 h-3.5" />
              Bundles
            </button>
          </div>
        </div>

        {/* Main Card */}
        {activeTab === "services" ? (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-visible text-black">
            {/* Filters Bar */}
            <div className="p-4 border-b border-gray-200 flex flex-col md:flex-row gap-4 items-center justify-between bg-gray-50/50">
              <div className="relative w-full md:w-96">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search by service name..."
                  className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900 transition-all text-sm"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
                <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-1.5 shadow-sm w-full sm:w-auto">
                  <Filter className="w-4 h-4 text-gray-400 shrink-0" />
                  <select
                    className="bg-transparent border-none focus:ring-0 text-sm font-medium text-gray-700 w-full sm:w-auto text-center sm:text-left"
                    value={selectedCategory}
                    onChange={(e) => {
                      setSelectedCategory(e.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="">All Categories</option>
                    {categories.map((cat) => (
                      <option key={cat._id} value={cat._id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={() => {
                    setSearch("");
                    setSelectedCategory("");
                    setPage(1);
                  }}
                  className="text-gray-500 hover:text-gray-700 font-medium text-sm px-2 w-full sm:w-auto text-center"
                >
                  Reset
                </button>
              </div>
            </div>

            <div className="overflow-x-auto overflow-y-visible">
              <table className="min-w-full divide-y divide-gray-200 hidden md:table">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Service
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Category
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Duration
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Price
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Gender
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {loading && services.length === 0 ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="animate-pulse">
                        <td colSpan={6} className="px-6 py-4">
                          <div className="h-4 bg-gray-100 rounded"></div>
                        </td>
                      </tr>
                    ))
                  ) : services.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-6 py-12 text-center text-gray-500"
                      >
                        <Scissors className="w-12 h-12 mx-auto mb-3 opacity-20" />
                        <p>No services found</p>
                      </td>
                    </tr>
                  ) : (
                    services.map((service) => (
                      <tr
                        key={service._id}
                        className="hover:bg-gray-50/50 transition-colors"
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-50 rounded-lg">
                              <Scissors className="w-4 h-4 text-blue-900" />
                            </div>
                            <div>
                              <span className="text-sm font-bold text-gray-900">
                                {service.name}
                              </span>
                              <div className="text-[10px] text-gray-400 font-medium uppercase">
                                Internal ID: {service._id.slice(-6)}
                              </div>
                              <div className="mt-2 flex items-center gap-2">
                                <PermissionGate
                                  resource="services"
                                  action="edit"
                                >
                                  <button
                                    onClick={() => openServiceModal(service)}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-blue-700 border border-blue-200 rounded-md bg-blue-50 hover:bg-blue-100 transition-colors"
                                  >
                                    <Edit className="w-3.5 h-3.5" />
                                    Edit
                                  </button>
                                </PermissionGate>
                                <PermissionGate
                                  resource="services"
                                  action="delete"
                                >
                                  <button
                                    onClick={() => handleDelete(service._id)}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-red-700 border border-red-200 rounded-md bg-red-50 hover:bg-red-100 transition-colors"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    Delete
                                  </button>
                                </PermissionGate>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-gray-50 text-gray-700 border border-gray-200">
                            {service.category?.name || "Uncategorized"}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-1.5 text-sm text-gray-600">
                            <Clock className="w-3.5 h-3.5 text-gray-400" />
                            {service.duration} min
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm font-bold text-gray-900">
                            {settings.symbol}
                            {service.price.toLocaleString("id-ID", {
                              maximumFractionDigits: 0,
                            })}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-xs text-gray-600 capitalize font-medium">
                            {service.gender}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`text-[10px] uppercase tracking-widest font-black px-2.5 py-1 rounded-full border ${service.status === "active" ? "bg-green-50 text-green-700 border-green-200" : "bg-gray-100 text-gray-700 border-gray-200"}`}
                          >
                            {service.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>

              {/* Mobile Card View (Services) */}
              <div className="md:hidden flex flex-col divide-y divide-gray-100 border-t border-gray-100">
                {loading && services.length === 0 ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="p-4 animate-pulse space-y-3">
                      <div className="h-4 bg-gray-100 rounded w-1/2"></div>
                      <div className="h-4 bg-gray-100 rounded w-1/3"></div>
                    </div>
                  ))
                ) : services.length === 0 ? (
                  <div className="p-12 text-center text-gray-500">
                    <Scissors className="w-12 h-12 mx-auto mb-3 opacity-20" />
                    <p>No services found</p>
                  </div>
                ) : (
                  services.map((service) => (
                    <div
                      key={service._id}
                      className="p-4 hover:bg-gray-50/50 transition-colors flex flex-col gap-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-50 rounded-lg">
                          <Scissors className="w-4 h-4 text-blue-900" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-gray-900">
                            {service.name}
                          </h3>
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-gray-50 text-gray-700 border border-gray-200 mt-1">
                            {service.category?.name || "Uncategorized"}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <PermissionGate resource="services" action="edit">
                          <button
                            onClick={() => openServiceModal(service)}
                            className="inline-flex justify-center items-center gap-2 px-3 py-2 text-xs font-bold text-blue-700 border border-blue-200 rounded-lg bg-blue-50 hover:bg-blue-100 transition-colors"
                          >
                            <Edit className="w-3.5 h-3.5" />
                            Edit Service
                          </button>
                        </PermissionGate>
                        <PermissionGate resource="services" action="delete">
                          <button
                            onClick={() => handleDelete(service._id)}
                            className="inline-flex justify-center items-center gap-2 px-3 py-2 text-xs font-bold text-red-700 border border-red-200 rounded-lg bg-red-50 hover:bg-red-100 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete Service
                          </button>
                        </PermissionGate>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-sm pt-1 border-t border-gray-50 mt-1">
                        <div>
                          <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-1">
                            Duration
                          </p>
                          <p className="font-semibold text-gray-900 flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-blue-400" />{" "}
                            {service.duration} min
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-1">
                            Gender
                          </p>
                          <p className="font-semibold text-gray-900 capitalize">
                            {service.gender}
                          </p>
                        </div>
                      </div>

                      <div className="flex justify-between items-end pt-2 mt-1">
                        <div>
                          <span
                            className={`text-[10px] uppercase tracking-widest font-black px-2.5 py-1 rounded-full border ${service.status === "active" ? "bg-green-50 text-green-700 border-green-200" : "bg-gray-100 text-gray-700 border-gray-200"}`}
                          >
                            {service.status}
                          </span>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-0.5">
                            Price
                          </p>
                          <span className="text-lg font-black text-gray-900">
                            {settings.symbol}
                            {service.price.toLocaleString("id-ID", {
                              maximumFractionDigits: 0,
                            })}
                          </span>
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
                Showing <span className="text-gray-900">{services.length}</span>{" "}
                of <span className="text-gray-900">{pagination.total}</span>{" "}
                services
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => page > 1 && setPage(page - 1)}
                  disabled={page <= 1}
                  className="p-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="flex items-center gap-1">
                  {Array.from(
                    { length: Math.min(5, pagination.pages) },
                    (_, i) => {
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
                          className={`w-8 h-8 rounded-lg text-sm font-semibold transition-all ${
                            page === pageNum
                              ? "bg-blue-900 text-white"
                              : "text-gray-600 hover:bg-gray-100"
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    },
                  )}
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
        ) : activeTab === "bundles" ? (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden text-black">
            {bundles.length === 0 ? (
              <div className="p-12 text-center text-gray-500">
                <Layers className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p className="font-semibold">Belum ada bundle jasa</p>
                <p className="text-sm mt-1">
                  Klik &quot;New Bundle&quot; untuk membuat bundle pertama.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {bundles.map((bundle) => (
                  <div
                    key={bundle._id}
                    className="p-4 hover:bg-gray-50/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        {bundle.image ? (
                          <img
                            src={bundle.image}
                            alt={bundle.name}
                            className="w-12 h-12 rounded-lg object-cover flex-shrink-0 border border-gray-200"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                            <Layers className="w-5 h-5 text-blue-900" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-sm font-bold text-gray-900">
                              {bundle.name}
                            </h3>
                            <span className="text-[10px] uppercase tracking-widest font-black px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">
                              Aktif
                            </span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                              {bundle.services.length} jasa
                            </span>
                          </div>
                          {bundle.description && (
                            <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">
                              {bundle.description}
                            </p>
                          )}
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {bundle.services.map((s, i) => (
                              <span
                                key={i}
                                className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-medium"
                              >
                                {s.serviceName}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <p className="text-base font-black text-blue-900">
                          {settings.symbol}
                          {bundle.price.toLocaleString("id-ID", {
                            maximumFractionDigits: 0,
                          })}
                        </p>
                        <div className="flex items-center gap-1.5 mt-2">
                          <PermissionGate resource="services" action="edit">
                            <button
                              onClick={() => openBundleModal(bundle)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-blue-700 border border-blue-200 rounded-md bg-blue-50 hover:bg-blue-100 transition-colors"
                            >
                              <Edit className="w-3.5 h-3.5" /> Edit
                            </button>
                          </PermissionGate>
                          <PermissionGate resource="services" action="delete">
                            <button
                              onClick={() => handleBundleDelete(bundle._id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-red-700 border border-red-200 rounded-md bg-red-50 hover:bg-red-100 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Delete
                            </button>
                          </PermissionGate>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden text-black">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 hidden md:table">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Category Name
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {categories.length === 0 ? (
                    <tr>
                      <td
                        colSpan={3}
                        className="px-6 py-12 text-center text-gray-500"
                      >
                        <Tag className="w-12 h-12 mx-auto mb-3 opacity-20" />
                        <p>No categories found</p>
                      </td>
                    </tr>
                  ) : (
                    categories.map((cat) => (
                      <tr
                        key={cat._id}
                        className="hover:bg-gray-50/50 transition-colors"
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-50 rounded-lg text-blue-900">
                              <Tag className="w-4 h-4" />
                            </div>
                            <span className="text-sm font-bold text-gray-900">
                              {cat.name}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`text-[10px] uppercase tracking-widest font-black px-2.5 py-1 rounded-full border ${cat.status === "active" ? "bg-green-50 text-green-700 border-green-200" : "bg-gray-100 text-gray-700 border-gray-200"}`}
                          >
                            {cat.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                          <div className="flex items-center justify-end gap-2">
                            <PermissionGate resource="services" action="edit">
                              <button
                                onClick={() => openCategoryModal(cat)}
                                className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                title="Edit"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                            </PermissionGate>
                            <PermissionGate resource="services" action="delete">
                              <button
                                onClick={() => handleCategoryDelete(cat._id)}
                                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                title="Delete"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </PermissionGate>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>

              {/* Mobile Card View (Categories) */}
              <div className="md:hidden flex flex-col divide-y divide-gray-100 border-t border-gray-100">
                {categories.length === 0 ? (
                  <div className="p-12 text-center text-gray-500">
                    <Tag className="w-12 h-12 mx-auto mb-3 opacity-20" />
                    <p>No categories found</p>
                  </div>
                ) : (
                  categories.map((cat) => (
                    <div
                      key={cat._id}
                      className="p-4 hover:bg-gray-50/50 transition-colors flex flex-col gap-3"
                    >
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-blue-50 rounded-lg">
                            <Tag className="w-4 h-4 text-blue-900" />
                          </div>
                          <h3 className="text-sm font-bold text-gray-900">
                            {cat.name}
                          </h3>
                        </div>
                        <span
                          className={`text-[10px] uppercase tracking-widest font-black px-2.5 py-1 rounded-full border ${cat.status === "active" ? "bg-green-50 text-green-700 border-green-200" : "bg-gray-100 text-gray-700 border-gray-200"}`}
                        >
                          {cat.status}
                        </span>
                      </div>

                      <div className="flex justify-end gap-2 pt-3 border-t border-gray-50 mt-1">
                        <PermissionGate resource="services" action="edit">
                          <button
                            onClick={() => openCategoryModal(cat)}
                            className="px-4 py-2 border border-gray-200 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors text-xs font-bold flex items-center gap-2 w-full sm:w-auto justify-center"
                          >
                            <Edit className="w-3.5 h-3.5" /> Edit
                          </button>
                        </PermissionGate>
                        <PermissionGate resource="services" action="delete">
                          <button
                            onClick={() => handleCategoryDelete(cat._id)}
                            className="px-4 py-2 border border-gray-200 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors text-xs font-bold flex items-center gap-2 w-full sm:w-auto justify-center"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Delete
                          </button>
                        </PermissionGate>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bundle Modal */}
      <Modal
        isOpen={isBundleModalOpen}
        onClose={closeBundleModal}
        title={editingBundle ? "Edit Bundle Jasa" : "Tambah Bundle Jasa"}
        size="lg"
      >
        <form onSubmit={handleBundleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <ImageUpload
              label="Gambar Bundle"
              value={bundleFormData.image}
              onChange={(url) =>
                setBundleFormData((prev) => ({ ...prev, image: url }))
              }
            />
            <IconPicker
              value={bundleFormData.icon}
              onChange={(val) =>
                setBundleFormData((prev) => ({ ...prev, icon: val }))
              }
            />
          </div>
          <FormInput
            label="Nama Bundle"
            required
            value={bundleFormData.name}
            onChange={(e) =>
              setBundleFormData((prev) => ({ ...prev, name: e.target.value }))
            }
            placeholder="Contoh: Paket Bridal, Premium Package"
          />
          <FormInput
            label="Deskripsi (opsional)"
            value={bundleFormData.description}
            onChange={(e) =>
              setBundleFormData((prev) => ({
                ...prev,
                description: e.target.value,
              }))
            }
            placeholder="Deskripsi singkat bundle..."
          />
          <FormInput
            label={`Harga Bundle (${settings.symbol})`}
            type="number"
            required
            value={bundleFormData.price}
            onChange={(e) =>
              setBundleFormData((prev) => ({
                ...prev,
                price: parseFloat(e.target.value) || 0,
              }))
            }
            min="0"
          />
          <FormInput
            label={`Komisi Selling By (opsi) (${settings.symbol})`}
            type="number"
            value={bundleFormData.sellingCommissionValue || 0}
            onChange={(e) =>
              setBundleFormData((prev) => ({
                ...prev,
                sellingCommissionValue: parseFloat(e.target.value) || 0,
              }))
            }
            min="0"
          />

          {/* Service Picker */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-700">
              Jasa dalam Bundle <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2">
              <div className="flex-1">
                <SearchableSelect
                  placeholder="Pilih jasa untuk ditambahkan..."
                  value={bundleSelectedService}
                  onChange={(val) => setBundleSelectedService(val)}
                  options={services
                    .filter(
                      (s) =>
                        !bundleFormData.services.some(
                          (b) => b.service === s._id,
                        ),
                    )
                    .map((s) => ({
                      value: s._id,
                      label: `${s.name} — ${settings.symbol}${s.price.toLocaleString("id-ID")}`,
                    }))}
                />
              </div>
              <button
                type="button"
                onClick={() => addServiceToBundle(bundleSelectedService)}
                disabled={!bundleSelectedService}
                className="px-3 py-2 bg-blue-900 text-white rounded-lg text-sm font-bold hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            {bundleFormData.services.length === 0 ? (
              <p className="text-xs text-gray-400 italic">
                Belum ada jasa dipilih. Tambahkan minimal 1 jasa.
              </p>
            ) : (
              <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
                {bundleFormData.services.map((item, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between px-3 py-2 gap-2"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">
                        {item.serviceName}
                      </p>
                      <p className="text-xs text-gray-500">
                        {settings.symbol}
                        {item.servicePrice.toLocaleString("id-ID")} ·{" "}
                        {item.duration} min
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeServiceFromBundle(index)}
                      className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors flex-shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                <div className="px-3 py-1.5 bg-gray-50 text-xs text-gray-500 flex justify-between">
                  <span>Harga satuan total</span>
                  <span className="font-bold text-gray-700">
                    {settings.symbol}
                    {bundleFormData.services
                      .reduce((s, i) => s + i.servicePrice, 0)
                      .toLocaleString("id-ID")}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={closeBundleModal}
              className="px-4 py-2 text-sm font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              Batal
            </button>
            <FormButton
              type="submit"
              loading={bundleSubmitting}
              variant="primary"
            >
              {editingBundle ? "Simpan Perubahan" : "Buat Bundle"}
            </FormButton>
          </div>
        </form>
      </Modal>

      {/* Service Modal */}
      <Modal
        isOpen={isServiceModalOpen}
        onClose={closeServiceModal}
        title={editingService ? "Edit Service" : "Add New Service"}
        size="xl"
      >
        <form onSubmit={handleServiceSubmit}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <ImageUpload
              label="Service Image"
              value={serviceFormData.image || ""}
              onChange={(url) =>
                setServiceFormData((prev) => ({ ...prev, image: url }))
              }
            />
            <IconPicker
              value={serviceFormData.icon || ""}
              onChange={(val) =>
                setServiceFormData((prev) => ({ ...prev, icon: val }))
              }
            />
          </div>
          <FormInput
            label="Service Name"
            required
            value={serviceFormData.name}
            onChange={(e) =>
              setServiceFormData({ ...serviceFormData, name: e.target.value })
            }
            placeholder="e.g. Hair Cut"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SearchableSelect
              label="Category"
              required
              value={serviceFormData.category}
              onChange={(val) =>
                setServiceFormData({ ...serviceFormData, category: val })
              }
              placeholder="Select Category"
              options={categories.map((cat) => ({
                value: cat._id,
                label: cat.name,
              }))}
            />
            <FormInput
              label={`Price (${settings.symbol})`}
              type="number"
              required
              value={serviceFormData.price}
              onChange={(e) =>
                setServiceFormData({
                  ...serviceFormData,
                  price: parseFloat(e.target.value),
                })
              }
              min="0"
            />
          </div>
          <FormInput
            label={`Harga Member (${settings.symbol})`}
            type="number"
            value={serviceFormData.memberPrice}
            onChange={(e) =>
              setServiceFormData({
                ...serviceFormData,
                memberPrice: parseFloat(e.target.value) || 0,
              })
            }
            min="0"
            placeholder="Kosongkan jika tidak ada harga member"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <FormInput
                label={`Komisi Nominal (opsi) (${settings.symbol})`}
                type="number"
                value={serviceFormData.commissionValue}
                onChange={(e) =>
                  setServiceFormData({
                    ...serviceFormData,
                    commissionValue: parseFloat(e.target.value) || 0,
                  })
                }
                min="0"
              />
              <p className="text-xs text-gray-500 -mt-2 mb-4">
                Nilai ini adalah rupiah tetap per layanan untuk komisi pengerjaan.
              </p>
              
              <FormInput
                label={`Komisi Selling By (opsi) (${settings.symbol})`}
                type="number"
                value={serviceFormData.sellingCommissionValue}
                onChange={(e) =>
                  setServiceFormData({
                    ...serviceFormData,
                    sellingCommissionValue: parseFloat(e.target.value) || 0,
                  })
                }
                min="0"
              />
              <p className="text-xs text-gray-500 -mt-2">
                Nominal komisi tetap bagi staff yang berhasil menjual layanan ini (kasir / CS).
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-gray-700">
                  Opsi Komisi POS
                </span>
                <span className="text-xs font-bold px-2 py-1 rounded-full bg-blue-100 text-blue-700">
                  Ringkas
                </span>
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={splitCommissionEnabled}
                  onChange={(e) => setSplitCommissionEnabled(e.target.checked)}
                />
                Split komisi aktif di POS
              </label>

              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={includeProductInCommission}
                  onChange={(e) =>
                    setIncludeProductInCommission(e.target.checked)
                  }
                />
                Komisi juga untuk produk
              </label>

              <p className="text-xs text-gray-500">
                Saat ini perhitungan komisi utama tetap dari nominal layanan.
                Produk belum dihitung otomatis sebagai komisi.
              </p>
            </div>
          </div>

          <div className="border-t border-gray-200 pt-4 mt-6">
            <h4 className="text-sm font-bold text-gray-700 mb-3">Bahan Baku & Material (Opsional)</h4>
            <p className="text-xs text-gray-500 mb-3">
              Pilih produk yang akan otomatis terpotong stoknya saat layanan ini terjual di kasir.
            </p>

            {serviceFormData.materialsUsed.map((mat, index) => (
              <div key={index} className="flex gap-2 mb-2 items-center bg-gray-50 p-2 rounded-lg border border-gray-200">
                <div className="flex-1">
                  <select
                    value={mat.product}
                    onChange={(e) => {
                      const selectedProduct = products.find(p => p._id === e.target.value);
                      const newMaterials = [...serviceFormData.materialsUsed];
                      newMaterials[index] = {
                        ...newMaterials[index],
                        product: e.target.value,
                        productName: selectedProduct ? selectedProduct.name : ""
                      };
                      setServiceFormData({...serviceFormData, materialsUsed: newMaterials});
                    }}
                    className="w-full h-10 px-3 text-sm border border-gray-300 rounded-lg bg-white"
                  >
                    <option value="">-- Pilih Produk --</option>
                    {products.map(p => (
                      <option key={p._id} value={p._id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div className="w-24">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={mat.quantityPerService}
                    onChange={(e) => {
                      const newMaterials = [...serviceFormData.materialsUsed];
                      newMaterials[index].quantityPerService = parseFloat(e.target.value) || 0;
                      setServiceFormData({...serviceFormData, materialsUsed: newMaterials});
                    }}
                    className="w-full h-10 px-3 text-sm border border-gray-300 rounded-lg"
                    placeholder="Qty"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const newMaterials = serviceFormData.materialsUsed.filter((_, i) => i !== index);
                    setServiceFormData({...serviceFormData, materialsUsed: newMaterials});
                  }}
                  className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}

            <button
              type="button"
              onClick={() => {
                setServiceFormData({
                  ...serviceFormData,
                  materialsUsed: [
                    ...serviceFormData.materialsUsed, 
                    { product: "", productName: "", quantityPerService: 1 }
                  ]
                });
              }}
              className="mt-2 flex items-center gap-2 text-sm text-blue-600 font-semibold hover:text-blue-700"
            >
              <Plus className="w-4 h-4" />
              Tambah Produk Bahan Baku
            </button>
          </div>

          <div className="space-y-1 mt-6">
            <label className="text-sm font-bold text-gray-700">Parent Service (Opsional — untuk varian S/M/L/XL)</label>
            <select
              value={serviceFormData.parentService || ""}
              onChange={(e) => setServiceFormData({...serviceFormData, parentService: e.target.value || ""})}
              className="w-full h-10 px-3 text-sm border-2 border-gray-200 rounded-lg bg-white"
            >
              <option value="">— Tidak ada (Top-level) —</option>
              {services.filter(s => s._id !== editingService?._id && !s.parentService).map(s => (
                <option key={s._id} value={s._id}>{s.name}</option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700 font-bold bg-amber-50 p-3 rounded-lg border border-amber-200">
            <input
              type="checkbox"
              checked={serviceFormData.isFavorite || false}
              onChange={(e) => setServiceFormData({...serviceFormData, isFavorite: e.target.checked})}
              className="w-4 h-4 text-amber-600 rounded"
            />
            ⭐ Tandai sebagai Favorit di POS
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormInput
              label="Duration (min)"
              type="number"
              required
              value={serviceFormData.duration}
              onChange={(e) =>
                setServiceFormData({
                  ...serviceFormData,
                  duration: parseInt(e.target.value),
                })
              }
              min="0"
            />
            <FormSelect
              label="Gender"
              value={serviceFormData.gender}
              onChange={(e: any) =>
                setServiceFormData({
                  ...serviceFormData,
                  gender: e.target.value,
                })
              }
              options={[
                { value: "unisex", label: "Unisex" },
                { value: "female", label: "Female" },
                { value: "male", label: "Male" },
              ]}
            />
          </div>

          <FormSelect
            label="Status"
            value={serviceFormData.status}
            onChange={(e: any) =>
              setServiceFormData({ ...serviceFormData, status: e.target.value })
            }
            options={[
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
            ]}
          />

          <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 mt-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-emerald-900">
                  WhatsApp Follow Up
                </h3>
                <p className="text-xs text-emerald-700 mt-1">
                  Atur follow-up WA per service: waktu kirim fleksibel
                  (menit/jam/hari) dan template.
                </p>
              </div>
              <label className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-900">
                <input
                  type="checkbox"
                  checked={serviceFormData.waFollowUp.enabled}
                  onChange={(e) =>
                    setServiceFormData({
                      ...serviceFormData,
                      waFollowUp: {
                        ...serviceFormData.waFollowUp,
                        enabled: e.target.checked,
                      },
                    })
                  }
                />
                Enable
              </label>
            </div>

            {serviceFormData.waFollowUp.enabled && (
              <div className="space-y-3 mt-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <FormInput
                    label="Follow-up 1 (delay)"
                    type="number"
                    required
                    min="1"
                    value={serviceFormData.waFollowUp.firstDelayValue || 0}
                    onChange={(e) =>
                      setServiceFormData({
                        ...serviceFormData,
                        waFollowUp: {
                          ...serviceFormData.waFollowUp,
                          firstDelayValue: parseInt(e.target.value) || 0,
                        },
                      })
                    }
                  />
                  <FormSelect
                    label="Unit Follow-up 1"
                    value={serviceFormData.waFollowUp.firstDelayUnit || "day"}
                    onChange={(e: any) =>
                      setServiceFormData({
                        ...serviceFormData,
                        waFollowUp: {
                          ...serviceFormData.waFollowUp,
                          firstDelayUnit: e.target.value,
                        },
                      })
                    }
                    options={[
                      { value: "minute", label: "Menit" },
                      { value: "hour", label: "Jam" },
                      { value: "day", label: "Hari" },
                    ]}
                  />
                  <SearchableSelect
                    label="Template Follow-up 1"
                    required
                    value={serviceFormData.waFollowUp.firstTemplateId}
                    onChange={(val) =>
                      setServiceFormData({
                        ...serviceFormData,
                        waFollowUp: {
                          ...serviceFormData.waFollowUp,
                          firstTemplateId: val,
                        },
                      })
                    }
                    placeholder="Select template"
                    options={waTemplates.map((template) => ({
                      value: template._id,
                      label: template.metaStatus === 'APPROVED' ? `🟢 ${template.name} [Meta Approved]` : template.metaStatus === 'PENDING' ? `🟡 ${template.name} [Pending Review]` : template.name,
                    }))}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <FormInput
                    label="Follow-up 2 (optional)"
                    type="number"
                    min="0"
                    value={serviceFormData.waFollowUp.secondDelayValue || 0}
                    onChange={(e) =>
                      setServiceFormData({
                        ...serviceFormData,
                        waFollowUp: {
                          ...serviceFormData.waFollowUp,
                          secondDelayValue: parseInt(e.target.value) || 0,
                        },
                      })
                    }
                  />
                  <FormSelect
                    label="Unit Follow-up 2"
                    value={serviceFormData.waFollowUp.secondDelayUnit || "day"}
                    onChange={(e: any) =>
                      setServiceFormData({
                        ...serviceFormData,
                        waFollowUp: {
                          ...serviceFormData.waFollowUp,
                          secondDelayUnit: e.target.value,
                        },
                      })
                    }
                    options={[
                      { value: "minute", label: "Menit" },
                      { value: "hour", label: "Jam" },
                      { value: "day", label: "Hari" },
                    ]}
                  />
                  <SearchableSelect
                    label="Template Follow-up 2"
                    value={serviceFormData.waFollowUp.secondTemplateId}
                    onChange={(val) =>
                      setServiceFormData({
                        ...serviceFormData,
                        waFollowUp: {
                          ...serviceFormData.waFollowUp,
                          secondTemplateId: val,
                        },
                      })
                    }
                    placeholder="Optional template"
                    options={waTemplates.map((template) => ({
                      value: template._id,
                      label: template.metaStatus === 'APPROVED' ? `🟢 ${template.name} [Meta Approved]` : template.metaStatus === 'PENDING' ? `🟡 ${template.name} [Pending Review]` : template.name,
                    }))}
                  />
                </div>
                {waTemplates.length === 0 && (
                  <p className="text-xs text-amber-700">
                    WA template belum ada. Buat dulu template di menu WhatsApp
                    template.
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={closeServiceModal}
              className="w-full sm:w-auto px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium transition-colors text-center"
            >
              Cancel
            </button>
            <FormButton
              type="submit"
              loading={submitting}
              className="w-full sm:w-auto"
            >
              {editingService ? "Update Service" : "Create Service"}
            </FormButton>
          </div>
        </form>
      </Modal>

      {/* Category Modal */}
      <Modal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        title={editingCategory ? "Edit Category" : "Add New Category"}
      >
        <form onSubmit={handleCategorySubmit}>
          <FormInput
            label="Category Name"
            required
            value={categoryName}
            onChange={(e) => setCategoryName(e.target.value)}
            placeholder="e.g. Hair Treatment"
          />
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={() => setIsCategoryModalOpen(false)}
              className="w-full sm:w-auto px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium transition-colors text-center"
            >
              Cancel
            </button>
            <FormButton
              type="submit"
              loading={categorySubmitting}
              className="w-full sm:w-auto"
            >
              {editingCategory ? "Update Category" : "Create Category"}
            </FormButton>
          </div>
        </form>
      </Modal>
    </div>
  );
}
