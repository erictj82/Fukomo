// app/[slug]/(frontend)/pos/page.tsx

"use client";

import React, { useState, useEffect } from "react";
import { useSearchParams, useParams } from "next/navigation";
import { useTenantRouter } from "@/hooks/useTenantRouter";
import {
  Search,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  CreditCard,
  User,
  Scissors as ScissorsIcon,
  Package,
  LayoutDashboard,
  ChevronRight,
  Zap,
  X,
  Wallet,
  Save,
  Menu,
  Calendar,
  Clock,
  LogOut,
  FileText,
  Store,
  Sparkles,
  Stethoscope,
  Star,
  Award,
} from "lucide-react";
import { FormButton } from "@/components/dashboard/FormInput";
import SearchableSelect from "@/components/dashboard/SearchableSelect";
import Modal from "@/components/dashboard/Modal";
import CustomerForm from "@/components/dashboard/CustomerForm";
import { useSettings } from "@/components/providers/SettingsProvider";
import { ICONS } from "@/components/ui/IconPicker";
import {
  calculateSplitCommission,
  type SplitMode,
} from "@/lib/splitCommission";

interface Item {
  _id: string;
  name: string;
  price: number;
  memberPrice?: number;
  image?: string;
  icon?: string;
  category?: { _id: string; name: string };
  type: "Service" | "Product" | "Package" | "Bundle" | "TopUp";
  duration?: number; // Service only
  stock?: number; // Product only
  commissionType?: "percentage" | "fixed";
  commissionValue?: number;
  sellingCommissionType?: "percentage" | "fixed";
  sellingCommissionValue?: number;
  waFollowUp?: {
    enabled?: boolean;
    firstDays?: number;
    secondDays?: number;
    firstTemplateId?: string;
    secondTemplateId?: string;
  };
  // Bundle only — services contained in this bundle
  bundleServices?: {
    service: string;
    serviceName: string;
    servicePrice: number;
    duration: number;
    commissionType?: string;
    commissionValue?: number;
    sellingCommissionType?: string;
    sellingCommissionValue?: number;
  }[];
}

interface Staff {
  _id: string;
  name: string;
  commissionRate: number;
}

interface CartItem extends Item {
  quantity: number;
  discountType?: string;
  discountValue?: number;
  discountAmount?: number;
  discountNote?: string;
  sellingBy?: string;
  sellingCommission?: number;
}

interface Customer {
  _id: string;
  name: string;
  phone?: string;
  membershipTier?: string;
  membershipExpiry?: string;
  loyaltyPoints?: number;
  walletBalance?: number;
  referredBy?: string | object;
  packageSummary?: {
    activePackages?: number;
  };
}

interface StaffAssignment {
  staffId: string;
  percentage: number;
}

interface CustomerPackageQuota {
  service: string;
  serviceName: string;
  totalQuota: number;
  usedQuota: number;
  remainingQuota: number;
}

interface CustomerPackageItem {
  _id: string;
  packageName: string;
  status: "active" | "depleted" | "expired" | "cancelled";
  expiresAt?: string;
  package?: {
    _id?: string;
    name?: string;
    code?: string;
  };
  serviceQuotas: CustomerPackageQuota[];
}

interface CustomerDealOption {
  customerPackageId: string;
  packageName: string;
  packageCode?: string;
  serviceId: string;
  serviceName: string;
  remainingQuota: number;
  totalQuota: number;
  expiresAt?: string;
  isUsable: boolean;
  statusReason: string;
}

interface PackageClaim {
  enabled: boolean;
  customerPackageId: string;
}

interface PaymentEntry {
  method: string;
  amount: number | string;
}

interface ParkedBill {
  id: string;
  name: string;
  date: string;
  cart: CartItem[];
  selectedCustomer: string;
  serviceStaffAssignments: Record<string, { staffId: string; percentage: number; porsiPersen?: number }[]>;
  serviceSplitModes: Record<string, "auto" | "manual">;
  cartDiscounts: Record<string, { type: "percentage" | "nominal"; value: number; originalValue?: number; reason?: string }>;
  appointmentId: string | null;
  medicalNotes?: string;
}


const DebouncedNumberInput = ({ value, onChange, className, min, placeholder, max }: any) => {
  const [localVal, setLocalVal] = useState(value);

  useEffect(() => {
    setLocalVal(value);
  }, [value]);

  useEffect(() => {
    const handler = setTimeout(() => {
      const parsed = parseFloat(localVal);
      if (!isNaN(parsed) && parsed !== value) {
        onChange(parsed);
      } else if (localVal === "") {
        onChange(0);
      }
    }, 300);
    return () => clearTimeout(handler);
  }, [localVal, onChange, value]);

  return (
    <input
      type="number"
      value={localVal}
      onChange={(e) => setLocalVal(e.target.value)}
      onBlur={(e) => {
        const parsed = parseFloat(e.target.value);
        onChange(isNaN(parsed) ? 0 : parsed);
      }}
      className={className}
      min={min}
      max={max}
      placeholder={placeholder}
    />
  );
};

export default function POSPage() {
  const router = useTenantRouter();
  const searchParams = useSearchParams();
  const params = useParams();
  const slug = (params?.slug as string) || "pusat";
  const storeHeaders = { "x-store-slug": slug };
  const { settings } = useSettings();
  const [activeTab, setActiveTab] = useState<
    "favorites" | "all" | "services" | "products" | "packages" | "bundles" | "topup"
  >("all");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [expandedParent, setExpandedParent] = useState<string | null>(null);
  // Top-Up Wallet state
  const [topupAmount, setTopupAmount] = useState<number | string>("");
  const [services, setServices] = useState<Item[]>([]);
  const [products, setProducts] = useState<Item[]>([]);
  const [packages, setPackages] = useState<Item[]>([]);
  const [serviceBundles, setServiceBundles] = useState<Item[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(24);

  useEffect(() => {
    setVisibleCount(24);
  }, [activeTab, activeCategory, search]);

  // Cart State
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState("");
  const [serviceStaffAssignments, setServiceStaffAssignments] = useState<
    Record<string, StaffAssignment[]>
  >({});
  const [serviceSplitModes, setServiceSplitModes] = useState<
    Record<string, SplitMode>
  >({});
  const [customerPackages, setCustomerPackages] = useState<
    CustomerPackageItem[]
  >([]);
  const [packageClaims, setPackageClaims] = useState<
    Record<string, PackageClaim>
  >({});
  const [discount, setDiscount] = useState(0);
  const [discountType, setDiscountType] = useState<"nominal" | "percentage">("percentage");
  const [discountReason, setDiscountReason] = useState("");
  const [staffTips, setStaffTips] = useState<Record<string, number>>({});
  const [splitPayments, setSplitPayments] = useState<PaymentEntry[]>([
    { method: "", amount: "" },
  ]);
  const [followUpPhoneNumber, setFollowUpPhoneNumber] = useState("");
  // Voucher redemption
  const [voucherCode, setVoucherCode] = useState("");
  const [voucherApplied, setVoucherApplied] = useState<{
    voucherId: string;
    code: string;
    discountType: string;
    discountValue: number;
    discountAmount: number;
    description?: string;
  } | null>(null);
  const [voucherLoading, setVoucherLoading] = useState(false);
  // Loyalty point redemption
  const [loyaltyPointsToRedeem, setLoyaltyPointsToRedeem] = useState(0);
  const [customerLoyaltyPoints, setCustomerLoyaltyPoints] = useState(0);
  const [customerWalletBalance, setCustomerWalletBalance] = useState(0);

  const [submitting, setSubmitting] = useState(false);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [isDealsModalOpen, setIsDealsModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<"success" | "warning">("success");

  const showToast = (message: string, type: "success" | "warning" = "success") => {
    setToastType(type);
    setToastMessage(message);
  };
  const [isStaffEarningsHidden, setIsStaffEarningsHidden] = useState(false);
  const [expandedStaffKey, setExpandedStaffKey] = useState<string | null>(null);
  const [showVoucherInput, setShowVoucherInput] = useState(false);
  const [showLoyaltySlider, setShowLoyaltySlider] = useState(false);
  const [referralCode, setReferralCode] = useState("");
  const [referralValidating, setReferralValidating] = useState(false);
  const [referralInfoModal, setReferralInfoModal] = useState<{ name: string, phone: string } | null>(null);
  const [mobileTab, setMobileTab] = useState<"catalog" | "cart">("catalog");
  const [isParkModalOpen, setIsParkModalOpen] = useState(false);
  const [isParkedListOpen, setIsParkedListOpen] = useState(false);
  const [parkBillName, setParkBillName] = useState("");
  const [parkedBills, setParkedBills] = useState<ParkedBill[]>([]);
  const [referralValidated, setReferralValidated] = useState<{
    referrerName: string;
    discountAmount: number;
  } | null>(null);
  const [isFirstTimer, setIsFirstTimer] = useState(false);
  
  // New States for Redesign
  const [medicalNotes, setMedicalNotes] = useState("");
  // "Mengetahui dari" (acquisition source / marketing funnel). Wajib diisi kalau
  // owner sudah mengonfigurasi daftar di Settings.acquisitionSources; kalau daftar
  // kosong, field ini disembunyikan & tidak diwajibkan (fitur opt-in per tenant).
  const [acquisitionSource, setAcquisitionSource] = useState("");
  const [isMedicalNotesModalOpen, setIsMedicalNotesModalOpen] = useState(false);
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false);
  const [isManualServiceModalOpen, setIsManualServiceModalOpen] = useState(false);
  const [manualServiceName, setManualServiceName] = useState("");
  const [manualServicePrice, setManualServicePrice] = useState("");
  // Appointments Modal State
  const [isAppointmentsModalOpen, setIsAppointmentsModalOpen] = useState(false);
  const [todayAppointments, setTodayAppointments] = useState<any[]>([]);
  const [loadingAppointments, setLoadingAppointments] = useState(false);

  // Reports Modal State
  const [isReportsModalOpen, setIsReportsModalOpen] = useState(false);
  const [todayReport, setTodayReport] = useState<any>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  // Derived from splitPayments (backward compat with checkout logic)
  const paymentMethod = splitPayments[0]?.method || "Cash";


  // Split payment helpers
  const totalSplitPaidComputed = splitPayments.reduce((sum, p) => {
    const v = parseFloat(String(p.amount || "0"));
    return sum + (Number.isFinite(v) ? v : 0);
  }, 0);

  const addSplitPayment = () => {
    const remainder = Math.max(0, total - totalSplitPaidComputed);
    setSplitPayments((prev) => [...prev, { method: "Cash", amount: remainder > 0 ? remainder.toString() : "" }]);
  };

  const removeSplitPayment = (index: number) => {
    if (splitPayments.length <= 1) return;
    setSplitPayments((prev) => prev.filter((_, i) => i !== index));
  };

  const updateSplitMethod = (index: number, method: string) => {
    setSplitPayments((prev) => {
      if (method === "QRIS") return [{ method: "QRIS", amount: "" }];
      const next = [...prev];
      next[index] = { ...next[index], method };
      return next;
    });
  };

  const updateSplitAmount = (index: number, amount: string) => {
    setSplitPayments((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], amount };
      return next;
    });
  };

  useEffect(() => {
    if (selectedCustomer && selectedCustomer !== "walking-customer") {
      const cust = customers.find((c) => c._id === selectedCustomer);
      if (cust) {
        setCustomerLoyaltyPoints(cust.loyaltyPoints || 0);
        setCustomerWalletBalance((cust as any).walletBalance || 0);
      } else {
        setCustomerLoyaltyPoints(0);
        setCustomerWalletBalance(0);
      }
    } else {
      setCustomerLoyaltyPoints(0);
      setCustomerWalletBalance(0);
    }
  }, [selectedCustomer, customers]);

  useEffect(() => {
    fetchResources();
  }, []);

  const appointmentId = searchParams.get("appointmentId");
  const [appointmentLoaded, setAppointmentLoaded] = useState(false);

  const handleLoadAppointment = async (aptId: string) => {
    try {
      const res = await fetch(`/api/appointments/${aptId}`, { headers: storeHeaders });
      const data = await res.json();

      if (data.success && data.data) {
        const apt = data.data;

        // Set Customer
        const customerId = apt.customer?._id || apt.customer;
        if (customerId) {
          setSelectedCustomer(customerId);
        }

        // Add items to cart
        const tempCart: CartItem[] = [];
        const tempAssignments: Record<string, StaffAssignment[]> = {};
        const tempSplitModes: Record<string, SplitMode> = {};

        // Appointment services
        apt.services.forEach((s: any) => {
          const sId = s.service?._id || s.service;
          const matchedService = services.find((svc) => svc._id === sId);
          if (matchedService) {
            const cartKey = getCartItemKey(matchedService._id, "Service");
            tempCart.push({ ...matchedService, quantity: 1, price: s.price }); // use appointment price

            // Assign staff from appointment
            const staffId = apt.staff?._id || apt.staff;
            if (staffId) {
              tempAssignments[cartKey] = [{ staffId, percentage: 100 }];
              tempSplitModes[cartKey] = "auto";
            }
          }
        });

        if (tempCart.length > 0) {
          setCart(tempCart);
          setServiceStaffAssignments(tempAssignments);
          setServiceSplitModes((prev) => ({ ...prev, ...tempSplitModes }));
          setDiscount(apt.discount || 0);
        }

        // Attach appointmentId to the POS state so we can complete it later
        // Note: The UI doesn't seem to store the appointmentId in state for checkout directly,
        // Wait, yes it does in ParkedBill, but for checkout let's see. 
        // Oh wait, there is no appointmentId state? Wait, let's check.
        // Actually, there's `appointmentId` from searchParams. We should update the URL so that onCheckout it uses it.
        router.replace(`/pos?appointmentId=${aptId}`);

        showToast("Appointment loaded to POS successfully");
        setAppointmentLoaded(true);
        setIsAppointmentsModalOpen(false);
      }
    } catch (err) {
      console.error("Failed to load appointment", err);
    }
  };

  // Auto-load appointment data to cart if appointmentId is present
  useEffect(() => {
    if (!appointmentId || loading || services.length === 0 || appointmentLoaded)
      return;
    handleLoadAppointment(appointmentId);
  }, [appointmentId, loading, services, appointmentLoaded]);

  useEffect(() => {
    if (!toastMessage) return;
    const timeout = window.setTimeout(() => setToastMessage(null), 2200);
    return () => window.clearTimeout(timeout);
  }, [toastMessage]);

  useEffect(() => {
    const loadCustomerPackages = async () => {
      if (!selectedCustomer || selectedCustomer === "walking-customer") {
        setCustomerPackages([]);
        return;
      }

      try {
        const res = await fetch(
          `/api/customer-packages?customerId=${selectedCustomer}`,
          { headers: storeHeaders },
        );
        const data = await res.json();
        if (data.success) {
          setCustomerPackages(data.data || []);
        } else {
          setCustomerPackages([]);
        }
      } catch {
        setCustomerPackages([]);
      }
    };

    loadCustomerPackages();
  }, [selectedCustomer]);

  useEffect(() => {
    if (!selectedCustomer || selectedCustomer === "walking-customer") {
      setFollowUpPhoneNumber("");
      setCustomerLoyaltyPoints(0);
      setLoyaltyPointsToRedeem(0);
      setIsFirstTimer(false);
      setReferralCode("");
      setReferralValidated(null);
      return;
    }

    const customer = customers.find((entry) => entry._id === selectedCustomer);
    setFollowUpPhoneNumber(String(customer?.phone || "").trim());

    // Fetch customer loyalty points & wallet balance
    fetch(`/api/customers/${selectedCustomer}`, { headers: storeHeaders })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setCustomerLoyaltyPoints(Number(data.data?.loyaltyPoints || 0));
          setCustomerWalletBalance(Number(data.data?.walletBalance || 0));
        }
      })
      .catch(() => {
        setCustomerLoyaltyPoints(0);
        setCustomerWalletBalance(0);
      });

    // Check if customer is a first-timer (no paid invoices)
    fetch(`/api/invoices?customerId=${selectedCustomer}&status=paid&limit=1`, { headers: storeHeaders })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.data)) {
          setIsFirstTimer(data.data.length === 0);
        } else {
          setIsFirstTimer(false);
        }
      })
      .catch(() => setIsFirstTimer(false));
  }, [selectedCustomer, customers]);

  // Apply referral code
  const applyReferralCode = async () => {
    if (!referralCode.trim() || !isFirstTimer) return;
    setReferralValidating(true);
    setReferralValidated(null);
    try {
      const res = await fetch(`/api/customers?referralCode=${referralCode.trim().toUpperCase()}`, { headers: storeHeaders });
      const data = await res.json();
      const validReferrers = data.data || [];
      if (data.success && validReferrers.length > 0) {
        const referrer = validReferrers[0];

        const isVIP = referrer.membershipExpiry && new Date(referrer.membershipExpiry).getTime() > new Date().getTime();
        if (!isVIP) {
          alert("Peringatan: Kode referral hanya berlaku jika pemiliknya adalah member VIP aktif!");
          setReferralCode("");
          return;
        }

        if (referrer._id === selectedCustomer) {
          alert("Peringatan: Tidak bisa menggunakan kode referral milik sendiri!");
          setReferralCode("");
          return;
        }

        setReferralInfoModal({ name: referrer.name, phone: referrer.phone || "-" });

        const amt =
          settings.referralDiscountType === "percentage"
            ? `${settings.referralDiscountValue || 0}% dari total`
            : (settings.referralDiscountValue || 0);
        setReferralValidated({
          referrerName: referrer.name,
          discountAmount: amt as any, // allow string or number to show in UI
        });
      } else {
        alert("Kode referral tidak valid atau tidak ditemukan");
        setReferralCode("");
      }
    } catch {
      alert("Error memvalidasi kode referral");
      setReferralCode("");
    } finally {
      setReferralValidating(false);
    }
  };

  // Apply voucher code
  const applyVoucher = async () => {
    if (!voucherCode.trim()) return;
    setVoucherLoading(true);
    try {
      const { subtotal } = calculateTotal();
      const res = await fetch("/api/vouchers", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...storeHeaders },
        body: JSON.stringify({
          action: "validate",
          code: voucherCode.trim(),
          totalAmount: subtotal,
          customerId:
            selectedCustomer !== "walking-customer"
              ? selectedCustomer
              : undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setVoucherApplied(data.data);
        setVoucherCode("");
      } else {
        alert(data.error || "Voucher tidak valid");
      }
    } catch {
      alert("Gagal memvalidasi voucher");
    } finally {
      setVoucherLoading(false);
    }
  };

  const removeVoucher = () => {
    setVoucherApplied(null);
    setVoucherCode("");
  };

  const fetchResources = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/pos/resources", { headers: storeHeaders });
      const data = await res.json().catch(() => ({ success: false, error: "HTTP parse error" }));

      if (data.success && data.data) {
        const { services: sList, products: pList, packages: pkgList, bundles: bList, customers: cList, staff: stList } = data.data;
        if (sList) setServices(sList.map((s: Item) => ({ ...s, type: "Service" })));
        if (pList) setProducts(pList.map((p: Item) => ({ ...p, type: "Product" })));
        if (pkgList) setPackages(pkgList.map((pkg: Item) => ({ ...pkg, type: "Package" })));
        if (bList) {
          setServiceBundles(
            bList.map((b: any) => ({
              _id: b._id,
              name: b.name,
              price: b.price,
              image: b.image,
              type: "Bundle" as const,
              bundleServices: (b.services || []).map((s: any) => ({
                service: s.service?._id,
                serviceName: s.service?.name,
                servicePrice: s.service?.price,
                duration: s.service?.duration,
                commissionType: s.commissionType || s.service?.commissionType,
                commissionValue: s.commissionValue || s.service?.commissionValue,
              })),
            }))
          );
        }
        if (cList) setCustomers(cList);
        if (stList) setStaffList(stList);
      } else {
        showToast(`Data tidak dapat dimuat: ${data.error || "Gagal memuat POS resources"}. Hubungi admin.`, "warning");
      }
    } catch (error) {
      console.error(error);
      showToast("Terjadi kesalahan saat memuat data POS.", "warning");
    } finally {
      setLoading(false);
    }
  };

  // Build parent-child map for services
  const parentServices = services.filter((s: any) => !s.parentService);
  const childrenMap = new Map<string, typeof services>();
  services.filter((s: any) => s.parentService).forEach((s: any) => {
    const pid = String(s.parentService);
    if (!childrenMap.has(pid)) childrenMap.set(pid, []);
    childrenMap.get(pid)!.push(s);
  });

  const rawFilteredItems = (
    activeTab === "favorites"
      ? [...services, ...products].filter((i: any) => i.isFavorite)
      : activeTab === "all"
      ? [...parentServices, ...serviceBundles, ...products, ...packages]
      : activeTab === "services" ? parentServices
      : activeTab === "products" ? products
      : activeTab === "bundles" ? serviceBundles
      : packages
  );

  const availableCategories = Array.from(
    new Map(
      rawFilteredItems
        .filter((item) => item.category && item.category._id && item.category.name)
        .map((item) => [String(item.category!._id), item.category!.name])
    )
  ).map(([id, name]) => ({ id, name }));

  const filteredItems = rawFilteredItems
    .filter((item) => activeCategory === "all" || (item.category && String(item.category._id) === activeCategory))
    .filter((item) => item.name.toLowerCase().includes(search.toLowerCase()));

  const getCartItemKey = (itemId: string, type: string, bundleIndex?: number) => bundleIndex !== undefined ? `${type}:${itemId}-${bundleIndex}` : `${type}:${itemId}`;

  const isPremiumActive = () => {
    if (!selectedCustomer || selectedCustomer === "walking-customer") return false;
    const c = customers.find((x) => x._id === selectedCustomer);
    if (!c) return false;
    return (
      c.membershipTier === "premium" &&
      !!c.membershipExpiry &&
      new Date(c.membershipExpiry) > new Date()
    );
  };

  const isIncludedInMembership = (item: Item) => {
    const s = settings as any;
    if (item.type === "Service" && s.memberIncludedServices?.includes(item._id)) return true;
    if (item.type === "Product" && s.memberIncludedProducts?.includes(item._id)) return true;
    if (item.type === "Bundle" && s.memberIncludedBundles?.includes(item._id)) return true;
    return false;
  };

  const getEffectivePrice = (item: Item | CartItem) => {
    let price = item.price;
    if (isPremiumActive()) {
      if (isIncludedInMembership(item)) {
        if (item.memberPrice !== undefined && item.memberPrice > 0) {
          price = item.memberPrice;
        } else {
          const s = settings as any;
          const discType = s.memberDiscountType || "percentage";
          const discVal = Number(s.memberDiscountValue) || 0;

          if (discVal > 0) {
            if (discType === "percentage") {
              const discAmount = (item.price * discVal) / 100;
              price = Math.max(0, item.price - discAmount);
            } else {
              price = Math.max(0, item.price - discVal);
            }
          }
        }
      }
    }
    
    // Apply per-item manual discount if present
    const cartItem = item as CartItem;
    if (cartItem.discountAmount) {
      price = Math.max(0, price - cartItem.discountAmount);
    }
    
    return price;
  };

  const roundTwo = (value: number) => Math.round(value * 100) / 100;

  const SPLIT_TOLERANCE = 0.01;

  const getEqualSplitPercentages = (count: number): number[] => {
    if (count <= 0) return [];
    const base = Math.floor((100 / count) * 100) / 100;
    const values = Array.from({ length: count }, () => base);
    const currentTotal = values.reduce((sum, val) => sum + val, 0);
    values[count - 1] = roundTwo(values[count - 1] + (100 - currentTotal));
    return values;
  };

  const dedupeAssignments = (assignments: StaffAssignment[]) => {
    const seen = new Set<string>();
    return assignments.filter((assignment) => {
      if (!assignment.staffId || seen.has(assignment.staffId)) return false;
      seen.add(assignment.staffId);
      return true;
    });
  };

  const getTotalSplitPercentage = (assignments: StaffAssignment[]) => {
    return assignments.reduce(
      (sum, assignment) => sum + (Number(assignment.percentage) || 0),
      0,
    );
  };

  const isSplitTotalValid = (assignments: StaffAssignment[]) => {
    return (
      Math.abs(getTotalSplitPercentage(assignments) - 100) <= SPLIT_TOLERANCE
    );
  };

  const getEffectiveServiceAssignments = (
    itemId: string,
    type: string,
    bundleIndex?: number,
  ): StaffAssignment[] => {
    const key = getCartItemKey(itemId, type, bundleIndex);
    const splitMode = serviceSplitModes[key] || "auto";
    const deduped = dedupeAssignments(serviceStaffAssignments[key] || []);

    if (splitMode === "auto") {
      const percentages = getEqualSplitPercentages(deduped.length);
      return deduped.map((assignment, idx) => ({
        ...assignment,
        percentage: percentages[idx] || 0,
      }));
    }

    return deduped.map((assignment) => ({
      ...assignment,
      percentage: Number(assignment.percentage) || 0,
    }));
  };

  const handleAddManualService = () => {
    if (!manualServiceName || !manualServicePrice) return;
    
    const generateObjectId = () => {
      const timestamp = (Math.floor(new Date().getTime() / 1000)).toString(16);
      const randomChars = "0123456789abcdef".repeat(16);
      return timestamp + "xxxxxxxxxxxxxxxx".replace(/[x]/g, () => randomChars[Math.floor(Math.random() * 16)]);
    };

    addToCart({
      _id: generateObjectId(),
      name: `(Manual) ${manualServiceName}`,
      price: parseFloat(manualServicePrice),
      type: "Service",
    });
    
    setManualServiceName("");
    setManualServicePrice("");
    setIsManualServiceModalOpen(false);
  };

  const addToCart = (item: Item) => {
    if (item.type === "Package") {
      if (cart.some((i) => i.type !== "Package")) {
        alert(
          "Penjualan paket harus diproses terpisah dari service/product. Selesaikan atau kosongkan cart dulu.",
        );
        return;
      }
    }

    if (item.type !== "Package" && cart.some((i) => i.type === "Package")) {
      alert(
        "Cart berisi paket. Selesaikan dulu transaksi paket sebelum menambah service/product.",
      );
      return;
    }

    setCart((prev) => {
      const existing = prev.find(
        (i) => i._id === item._id && i.type === item.type,
      );
      if (existing) {
        // Validasi stok untuk produk
        if (item.type === "Product" && item.stock !== undefined) {
          if (existing.quantity >= item.stock) {
            alert(`Stok "${item.name}" tidak mencukupi. Sisa stok: ${item.stock}`);
            return prev;
          }
        }
        return prev.map((i) =>
          i._id === item._id && i.type === item.type
            ? { ...i, quantity: i.quantity + 1 }
            : i,
        );
      }
      // Validasi stok untuk produk baru ditambahkan
      if (item.type === "Product" && item.stock !== undefined && item.stock <= 0) {
        alert(`Stok "${item.name}" habis (stok: ${item.stock}). Tidak bisa ditambahkan ke keranjang.`);
        return prev;
      }
      return [...prev, { ...item, quantity: 1 }];
    });
    if (item.type === "Service") {
      const key = getCartItemKey(item._id, item.type);
      setServiceStaffAssignments((prev) => prev[key] ? prev : { ...prev, [key]: [] });
      setServiceSplitModes((prev) => prev[key] ? prev : { ...prev, [key]: "auto" });
    } else if (item.type === "Bundle" && item.bundleServices) {
      const newStaffAssignments: any = {};
      const newSplitModes: any = {};
      item.bundleServices.forEach((bs, i) => {
        const key = getCartItemKey(item._id, item.type, i);
        newStaffAssignments[key] = [];
        newSplitModes[key] = "auto";
      });
      setServiceStaffAssignments((prev) => ({ ...prev, ...newStaffAssignments }));
      setServiceSplitModes((prev) => ({ ...prev, ...newSplitModes }));
    }
  };

  const addTopUpToCart = () => {
    const amount = Number(topupAmount);
    if (!amount || amount <= 0) {
      alert("Masukkan nominal top-up yang valid");
      return;
    }
    if (!selectedCustomer || selectedCustomer === "walking-customer") {
      alert("Pilih customer terdaftar untuk top-up wallet");
      return;
    }
    // Check if there's already a TopUp item – replace it
    setCart((prev) => {
      const withoutOldTopup = prev.filter((i) => i.type !== "TopUp");
      const topUpItem: CartItem = {
        _id: `topup-${Date.now()}`,
        name: `Top-Up Saldo Wallet`,
        price: amount,
        type: "TopUp",
        quantity: 1,
      };
      return [...withoutOldTopup, topUpItem];
    });
    setTopupAmount("");
    setActiveTab("all");
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setMobileTab("cart");
    }
  };

  const removeFromCart = (itemId: string, type: string) => {
    setCart((prev) =>
      prev.filter((i) => !(i._id === itemId && i.type === type)),
    );
    if (type === "Service") {
      const key = getCartItemKey(itemId, type);
      setServiceStaffAssignments((prev) => { const rest = { ...prev }; delete rest[key]; return rest; });
      setServiceSplitModes((prev) => { const rest = { ...prev }; delete rest[key]; return rest; });
      setPackageClaims((prev) => { const rest = { ...prev }; delete rest[key]; return rest; });
    } else if (type === "Bundle") {
      const item = cart.find(i => i._id === itemId && i.type === type);
      if (item && item.bundleServices) {
        setServiceStaffAssignments((prev) => {
          const rest = { ...prev };
          item.bundleServices!.forEach((bs, i) => delete rest[getCartItemKey(itemId, type, i)]);
          return rest;
        });
        setServiceSplitModes((prev) => {
          const rest = { ...prev };
          item.bundleServices!.forEach((bs, i) => delete rest[getCartItemKey(itemId, type, i)]);
          return rest;
        });
      }
    }
  };

  const updateQuantity = (itemId: string, type: string, delta: number) => {
    setCart((prev) =>
      prev.map((i) => {
        if (i._id === itemId && i.type === type) {
          if (type === "Package") {
            return i;
          }
          let newQty = Math.max(1, i.quantity + delta);
          // Batasi quantity produk berdasarkan stok
          if (type === "Product" && i.stock !== undefined) {
            newQty = Math.min(newQty, i.stock);
            if (newQty < 1) newQty = 1;
          }
          return { ...i, quantity: newQty };
        }
        return i;
      }),
    );
  };

  const updateCartItemDiscount = (itemId: string, type: string, updates: Partial<{ discountType: string; discountValue: number; discountNote: string }>) => {
    setCart((prev) =>
      prev.map((i) => {
        if (i._id === itemId && i.type === type) {
          const discountType = updates.discountType !== undefined ? updates.discountType : (i.discountType || "percentage");
          const discountValue = updates.discountValue !== undefined ? updates.discountValue : (i.discountValue || 0);
          const discountNote = updates.discountNote !== undefined ? updates.discountNote : (i.discountNote || "");
          
          let discountAmount = 0;
          const basePrice = i.price;
          if (discountType === "percentage") {
            discountAmount = (basePrice * discountValue) / 100;
          } else {
            discountAmount = discountValue;
          }
          
          return { ...i, discountType, discountValue, discountAmount, discountNote };
        }
        return i;
      }),
    );
  };

  const addServiceStaffAssignment = (
    itemId: string,
    type: string,
    staffId: string,
    bundleIndex?: number,
  ) => {
    const key = getCartItemKey(itemId, type, bundleIndex);
    const current = serviceStaffAssignments[key] || [];
    if (current.find((a) => a.staffId === staffId)) return;
    const splitMode = serviceSplitModes[key] || "auto";

    const nextAssignments = [
      ...current,
      {
        staffId,
        percentage: 0,
      },
    ];

    const effectiveAssignments =
      splitMode === "auto"
        ? nextAssignments.map((assignment, idx) => ({
          ...assignment,
          percentage:
            getEqualSplitPercentages(nextAssignments.length)[idx] || 0,
        }))
        : nextAssignments;

    setServiceStaffAssignments((prev) => ({
      ...prev,
      [key]: effectiveAssignments,
    }));
  };

  const removeServiceStaffAssignment = (
    itemId: string,
    type: string,
    staffId: string,
    bundleIndex?: number,
  ) => {
    const key = getCartItemKey(itemId, type, bundleIndex);
    const splitMode = serviceSplitModes[key] || "auto";

    setServiceStaffAssignments((prev) => ({
      ...prev,
      [key]: (() => {
        const filtered = (prev[key] || []).filter((a) => a.staffId !== staffId);
        if (splitMode !== "auto") return filtered;

        const percentages = getEqualSplitPercentages(filtered.length);
        return filtered.map((assignment, idx) => ({
          ...assignment,
          percentage: percentages[idx] || 0,
        }));
      })(),
    }));
  };

  const updateServiceStaffPercentage = (
    itemId: string,
    type: string,
    staffId: string,
    percentage: number,
    bundleIndex?: number,
  ) => {
    const key = getCartItemKey(itemId, type, bundleIndex);
    const splitMode = serviceSplitModes[key] || "auto";
    if (splitMode === "auto") return;

    setServiceStaffAssignments((prev) => ({
      ...prev,
      [key]: (prev[key] || []).map((a) =>
        a.staffId === staffId
          ? { ...a, percentage: Math.max(0, percentage) }
          : a,
      ),
    }));
  };

  const updateServiceSplitMode = (
    itemId: string,
    type: string,
    mode: SplitMode,
    bundleIndex?: number,
  ) => {
    const key = getCartItemKey(itemId, type, bundleIndex);

    setServiceSplitModes((prev) => ({
      ...prev,
      [key]: mode,
    }));

    setServiceStaffAssignments((prev) => {
      const current = prev[key] || [];
      if (mode !== "auto") {
        return {
          ...prev,
          [key]: current,
        };
      }

      const percentages = getEqualSplitPercentages(current.length);
      return {
        ...prev,
        [key]: current.map((assignment, idx) => ({
          ...assignment,
          percentage: percentages[idx] || 0,
        })),
      };
    });
  };

  const togglePackageClaim = (
    itemId: string,
    type: string,
    enabled: boolean,
  ) => {
    const key = getCartItemKey(itemId, type);
    setPackageClaims((prev) => {
      const current = prev[key] || { enabled: false, customerPackageId: "" };
      return {
        ...prev,
        [key]: {
          ...current,
          enabled,
        },
      };
    });
  };

  const getAvailableDeals = (): CustomerDealOption[] => {
    return customerPackages
      .flatMap((pkg) => {
        return (pkg.serviceQuotas || []).map((quota) => {
          const isExpired = pkg.expiresAt && new Date(pkg.expiresAt) < new Date();
          const isDepleted = Number(quota.remainingQuota) <= 0;
          const isUsable = pkg.status === "active" && !isExpired && !isDepleted;

          let statusReason = "Aktif";
          if (isExpired) statusReason = "Expired";
          else if (isDepleted) statusReason = "Habis";
          else if (pkg.status !== "active") statusReason = "Tidak Aktif";

          return {
            customerPackageId: pkg._id,
            packageName: pkg.packageName,
            packageCode: pkg.package?.code,
            serviceId: String(quota.service),
            serviceName: quota.serviceName,
            remainingQuota: Number(quota.remainingQuota || 0),
            totalQuota: Number(quota.totalQuota || 0),
            expiresAt: pkg.expiresAt,
            isUsable,
            statusReason,
          };
        });
      });
  };

  const addDealToCart = (deal: CustomerDealOption) => {
    if (!selectedCustomer || selectedCustomer === "walking-customer") {
      alert("Pilih customer terdaftar dulu untuk menggunakan paket.");
      return;
    }

    if (!deal.isUsable) {
      alert(`Paket ini tidak dapat digunakan karena statusnya: ${deal.statusReason}`);
      return;
    }

    const service = services.find((entry) => entry._id === deal.serviceId);
    if (!service) {
      alert("Service untuk paket ini tidak ditemukan di master service.");
      return;
    }

    const key = getCartItemKey(service._id, "Service");
    const existing = cart.find(
      (entry) => entry._id === service._id && entry.type === "Service",
    );
    
    // CEGAH QTY MELEBIHI SISA KUOTA
    const existingQty = existing ? existing.quantity : 0;
    if (existingQty + 1 > deal.remainingQuota) {
      alert(`Kuota paket ini hanya tersisa ${deal.remainingQuota}. Anda tidak bisa menambahkannya lagi.`);
      return;
    }

    const existingClaim = packageClaims[key];

    if (
      existing &&
      (!existingClaim?.enabled ||
        existingClaim.customerPackageId !== deal.customerPackageId)
    ) {
      alert(
        `Service "${service.name}" sudah ada di cart tanpa claim paket yang sama. Hapus dulu item lama atau gunakan claim dari item yang sudah ada.`,
      );
      return;
    }

    addToCart(service);
    setPackageClaimId(service._id, "Service", deal.customerPackageId);
    setIsDealsModalOpen(false);
    showToast("Berhasil menambahkan produk!");
  };

  const setPackageClaimId = (
    itemId: string,
    type: string,
    customerPackageId: string,
  ) => {
    const key = getCartItemKey(itemId, type);
    setPackageClaims((prev) => ({
      ...prev,
      [key]: {
        enabled: true,
        customerPackageId,
      },
    }));
  };

  const getServicePackageOptions = (serviceId: string) => {
    return customerPackages
      .filter((pkg) => pkg.status === "active")
      .map((pkg) => {
        const quota = pkg.serviceQuotas.find(
          (q) => String(q.service) === String(serviceId),
        );
        return { pkg, quota };
      })
      .filter((entry) => entry.quota && Number(entry.quota.remainingQuota) > 0)
      .map((entry) => ({
        value: entry.pkg._id,
        label: `${entry.pkg.packageName} (Sisa: ${entry.quota?.remainingQuota ?? 0})`,
      }));
  };

  const getStaffRate = (staffId: string) => {
    const staff = staffList.find((s) => s._id === staffId);
    return Number(staff?.commissionRate || 0);
  };

  const getSplitCommissionPreviewForItem = (item: CartItem) => {
    const key = getCartItemKey(item._id, item.type);
    const splitMode = serviceSplitModes[key] || "auto";
    const claim = packageClaims[key];
    const sourceType =
      claim?.enabled && claim.customerPackageId
        ? "package_redeem"
        : "normal_sale";

    return calculateSplitCommission({
      splitMode,
      assignments: getEffectiveServiceAssignments(item._id, item.type).map(
        (assignment) => ({
          staffId: assignment.staffId,
          percentage: assignment.percentage,
          staffCommissionRate: getStaffRate(assignment.staffId),
        }),
      ),
      servicePrice: getEffectivePrice(item),
      quantity: item.quantity,
      commissionType: item.commissionType || "fixed",
      commissionValue: Number(item.commissionValue || 0),
      sourceType,
    });
  };

  const calculateTotal = () => {
    const subtotal = cart.reduce(
      (sum, item) => sum + getEffectivePrice(item) * item.quantity,
      0,
    );
    const payableSubtotal = cart.reduce((sum, item) => {
      if (item.type !== "Service") return sum + getEffectivePrice(item) * item.quantity;

      const key = getCartItemKey(item._id, item.type);
      const claim = packageClaims[key];
      if (claim?.enabled && claim.customerPackageId) return sum;

      return sum + getEffectivePrice(item) * item.quantity;
    }, 0);

    // Voucher discount
    const voucherDiscount = voucherApplied?.discountAmount || 0;
    // Loyalty point discount: 1 point = settings.loyaltyPointValue currency units
    const loyaltyDiscount = Math.min(loyaltyPointsToRedeem * (settings.loyaltyPointValue || 1), payableSubtotal);

    // Referral discount
    let referralDiscount = 0;
    if (referralValidated) {
      if (settings.referralDiscountType === "percentage") {
        referralDiscount = (payableSubtotal * (settings.referralDiscountValue || 0)) / 100;
      } else {
        referralDiscount = settings.referralDiscountValue || 0;
      }
    }
    referralDiscount = Math.min(referralDiscount, payableSubtotal);

    // Discount flat vs percentage
    const effectiveDiscount = discountType === "percentage" ? (payableSubtotal * discount) / 100 : discount;

    const taxableAmount = Math.max(
      0,
      payableSubtotal - effectiveDiscount - voucherDiscount - loyaltyDiscount - referralDiscount,
    );
    const tax = taxableAmount * (settings.taxRate / 100);

    // Sum all tips from staffTips state
    const totalTips = Object.values(staffTips).reduce(
      (sum, tip) => sum + (Number(tip) || 0),
      0,
    );
    const total = taxableAmount + tax + totalTips;

    let totalCommission = 0;
    const perStaff: Record<
      string,
      { staffId: string; commission: number; tip: number }
    > = {};
    const lineItemSplits: Record<
      string,
      {
        splitCommissionMode: SplitMode;
        staffAssignments: {
          staffId: string;
          percentage: number;
          porsiPersen: number;
          commission: number;
          komisiNominal: number;
          tip: number;
        }[];
      }
    > = {};
    const redeemItems: {
      customerPackageId: string;
      serviceId: string;
      quantity: number;
      serviceName: string;
    }[] = [];

    cart.forEach((item) => {
      if (item.type !== "Service") return;
      const key = getCartItemKey(item._id, item.type);
      const splitCommissionMode = serviceSplitModes[key] || "auto";
      const serviceAssignments = getEffectiveServiceAssignments(
        item._id,
        item.type,
      );
      const serviceLineAssignments: {
        staffId: string;
        percentage: number;
        porsiPersen: number;
        commission: number;
        komisiNominal: number;
        tip: number;
      }[] = [];

      const claim = packageClaims[key];
      if (claim?.enabled && claim.customerPackageId) {
        redeemItems.push({
          customerPackageId: claim.customerPackageId,
          serviceId: item._id,
          quantity: item.quantity,
          serviceName: item.name,
        });
      }

      if (serviceAssignments.length === 0) {
        lineItemSplits[key] = {
          splitCommissionMode,
          staffAssignments: [],
        };
        return;
      }

      // Komisi aktif — selalu hitung normal di background terlepas dari setting display
      const splitResult = calculateSplitCommission({
        splitMode: splitCommissionMode,
        assignments: serviceAssignments.map((assignment) => ({
          staffId: assignment.staffId,
          percentage: assignment.percentage,
          staffCommissionRate: getStaffRate(assignment.staffId),
        })),
        servicePrice: getEffectivePrice(item),
        quantity: item.quantity,
        commissionType: item.commissionType || "fixed",
        commissionValue: Number(item.commissionValue || 0),
        sourceType:
          claim?.enabled && claim.customerPackageId
            ? "package_redeem"
            : "normal_sale",
      });

      if (!splitResult.isValid) {
        lineItemSplits[key] = {
          splitCommissionMode,
          staffAssignments: [],
        };
        return;
      }

      totalCommission += splitResult.totalCommission;

      splitResult.assignments.forEach((assignment) => {
        if (!perStaff[assignment.staffId]) {
          perStaff[assignment.staffId] = {
            staffId: assignment.staffId,
            commission: 0,
            tip: 0,
          };
        }
        perStaff[assignment.staffId].commission += assignment.komisiNominal;

        serviceLineAssignments.push({
          staffId: assignment.staffId,
          percentage: assignment.percentage,
          porsiPersen: assignment.porsiPersen,
          commission: assignment.komisiNominal,
          komisiNominal: assignment.komisiNominal,
          tip: 0,
        });
      });

      lineItemSplits[key] = {
        splitCommissionMode,
        staffAssignments: serviceLineAssignments,
      };
    });

    // Bundle commission — processing internal service splits
    cart.forEach((item) => {
      if (item.type !== "Bundle" || !item.bundleServices) return;
      const totalOriginalPrice = item.bundleServices.reduce((sum, bs) => sum + bs.servicePrice, 0);

      item.bundleServices.forEach((bs, i) => {
        const bsKey = getCartItemKey(item._id, item.type, i);
        const splitCommissionMode = serviceSplitModes[bsKey] || "auto";
        const serviceAssignments = getEffectiveServiceAssignments(item._id, item.type, i);
        const serviceLineAssignments: any[] = [];

        const proportion = totalOriginalPrice > 0 ? bs.servicePrice / totalOriginalPrice : 1 / item.bundleServices!.length;
        const subItemPrice = Math.round(getEffectivePrice(item) * proportion);

        if (serviceAssignments.length === 0) {
          lineItemSplits[bsKey] = { splitCommissionMode, staffAssignments: [] };
          return;
        }

        // Komisi aktif selalu di background
        const splitResult = calculateSplitCommission({
          splitMode: splitCommissionMode,
          assignments: serviceAssignments.map((assignment) => ({
            staffId: assignment.staffId,
            percentage: assignment.percentage,
            staffCommissionRate: getStaffRate(assignment.staffId),
          })),
          servicePrice: subItemPrice,
          quantity: item.quantity,
          commissionType: (bs.commissionType as "fixed" | "percentage") || "fixed",
          commissionValue: Number(bs.commissionValue || 0),
          sourceType: "normal_sale",
        });

        if (!splitResult.isValid) {
          lineItemSplits[bsKey] = { splitCommissionMode, staffAssignments: [] };
          return;
        }

        totalCommission += splitResult.totalCommission;

        splitResult.assignments.forEach((assignment) => {
          if (!perStaff[assignment.staffId]) {
            perStaff[assignment.staffId] = { staffId: assignment.staffId, commission: 0, tip: 0 };
          }
          perStaff[assignment.staffId].commission += assignment.komisiNominal;

          serviceLineAssignments.push({
            staffId: assignment.staffId,
            percentage: assignment.percentage,
            porsiPersen: assignment.porsiPersen,
            commission: assignment.komisiNominal,
            komisiNominal: assignment.komisiNominal,
            tip: 0,
          });
        });

        lineItemSplits[bsKey] = {
          splitCommissionMode,
          staffAssignments: serviceLineAssignments,
        };
      });
    });

    // Product & Package commission — single staff, no split
    cart.forEach((item) => {
      if (item.type !== "Product" && item.type !== "Package") return;
      if (!item.commissionValue || Number(item.commissionValue) <= 0) return;

      const key = getCartItemKey(item._id, item.type);
      const productStaffArr = serviceStaffAssignments[key];
      if (!productStaffArr || productStaffArr.length === 0) return;

      const staffId = productStaffArr[0].staffId;
      const commissionType = item.commissionType || "fixed";
      const commissionValue = Number(item.commissionValue || 0);
      const qty = item.quantity;

      let komisi = 0;
      if (commissionType === "percentage") {
        komisi = getEffectivePrice(item) * qty * (commissionValue / 100);
      } else {
        komisi = commissionValue * qty;
      }

      totalCommission += komisi;

      if (!perStaff[staffId]) {
        perStaff[staffId] = { staffId, commission: 0, tip: 0 };
      }
      perStaff[staffId].commission += komisi;

      lineItemSplits[key] = {
        splitCommissionMode: "auto",
        staffAssignments: [
          {
            staffId,
            percentage: 100,
            porsiPersen: 100,
            commission: komisi,
            komisiNominal: komisi,
            tip: 0,
          },
        ],
      };
    });

    // Add tips from staffTips state to the aggregated perStaff records
    Object.entries(staffTips).forEach(([staffId, tip]) => {
      if (tip > 0) {
        if (!perStaff[staffId]) {
          perStaff[staffId] = { staffId, commission: 0, tip: 0 };
        }
        perStaff[staffId].tip = tip;
      }
    });

    const perStaffValues = Object.values(perStaff);
    const fallbackPercentages = getEqualSplitPercentages(perStaffValues.length);
    const updatedAssignments = perStaffValues.map((assignment, index) => {
      const percentage =
        totalCommission > 0
          ? (assignment.commission / totalCommission) * 100
          : fallbackPercentages[index] || 0;

      return {
        staffId: assignment.staffId,
        percentage,
        porsiPersen: percentage,
        commission: assignment.commission,
        komisiNominal: assignment.commission,
        tip: assignment.tip,
      };
    });

    const maxWalletAllowedSubtotal = cart.reduce((sum, item) => {
      if (item.type === "Service" && packageClaims[getCartItemKey(item._id, item.type)]?.enabled) return sum;
      let isAllowed = false;
      if (["Service", "Product", "Bundle", "Package"].includes(item.type)) isAllowed = true;
      if (isAllowed) return sum + getEffectivePrice(item) * item.quantity;
      return sum;
    }, 0);
    const maxWalletPaymentAllowed = Math.min(total, maxWalletAllowedSubtotal * (1 + (settings.taxRate / 100)));

    return {
      subtotal,
      payableSubtotal,
      tax,
      total,
      tips: totalTips,
      commission: totalCommission,
      assignments: updatedAssignments,
      lineItemSplits,
      redeemItems,
      referralDiscount,
      effectiveDiscount,
      maxWalletPaymentAllowed
    };
  };

  /**
   * Reset semua state terkait transaksi setelah checkout selesai.
   * Dipusatkan di sini agar tidak ada state yang terlewat di-reset.
   */
  const resetCheckoutState = () => {
    setCart([]);
    setDiscount(0);
    setDiscountType("percentage");
    setDiscountReason("");
    setStaffTips({});
    setSelectedCustomer("");
    setFollowUpPhoneNumber("");
    setServiceStaffAssignments({});
    setServiceSplitModes({});
    setPackageClaims({});
    setSplitPayments([{ method: "", amount: "" }]);
    setVoucherApplied(null);
    setVoucherCode("");
    setLoyaltyPointsToRedeem(0);
    setCustomerLoyaltyPoints(0);
    setReferralCode("");
    setReferralValidated(null);
    setMedicalNotes("");
    setAcquisitionSource("");
  };

  const {
    subtotal,
    payableSubtotal,
    tax,
    total,
    tips,
    commission,
    assignments,
    maxWalletPaymentAllowed,
    effectiveDiscount,
  } = calculateTotal();

  const fetchTodayAppointments = async () => {
    setLoadingAppointments(true);
    try {
      const today = new Date().toISOString().split("T")[0];
      const res = await fetch(`/api/appointments?start=${today}&end=${today}`, { headers: storeHeaders });
      const data = await res.json();
      if (data.success) {
        setTodayAppointments(data.data);
      }
    } catch (error) {
      console.error("Failed to fetch appointments:", error);
    } finally {
      setLoadingAppointments(false);
    }
  };

  const fetchTodayReport = async () => {
    setLoadingReport(true);
    try {
      const today = new Date().toISOString().split("T")[0];
      const res = await fetch(`/api/reports/financial?startDate=${today}&endDate=${today}`, { headers: storeHeaders });
      const data = await res.json();
      if (data.success) {
        setTodayReport(data.data);
      }
    } catch (error) {
      console.error("Failed to fetch report:", error);
    } finally {
      setLoadingReport(false);
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("posParkedBills");
        if (stored) setParkedBills(JSON.parse(stored));
      } catch (e) {
        console.error("Failed to load parked bills", e);
      }
    }
  }, []);

  const saveParkedBill = () => {
    if (!parkBillName.trim()) {
      alert("Nama referensi tidak boleh kosong");
      return;
    }
    const newBill: ParkedBill = {
      id: Date.now().toString(),
      name: parkBillName,
      date: new Date().toLocaleString("id-ID"),
      cart,
      selectedCustomer,
      serviceStaffAssignments,
      serviceSplitModes,
      cartDiscounts: {}, // Simplification
      appointmentId,
      medicalNotes,
    };
    const updated = [...parkedBills, newBill];
    setParkedBills(updated);
    localStorage.setItem("posParkedBills", JSON.stringify(updated));
    resetCheckoutState();
    setIsParkModalOpen(false);
    setParkBillName("");
    if (appointmentId) {
       router.push("/appointments/calendar");
    } else {
       router.refresh();
    }
    alert("Keranjang berhasil disimpan sementara!");
  };

  const restoreParkedBill = (bill: ParkedBill) => {
    setCart(bill.cart);
    setSelectedCustomer(bill.selectedCustomer || "walking-customer");
    setServiceStaffAssignments(bill.serviceStaffAssignments || {});
    setServiceSplitModes(bill.serviceSplitModes || {});
    if (bill.appointmentId) {
      window.history.replaceState(null, "", `/pos?appointmentId=${bill.appointmentId}`);
    }
    setMedicalNotes(bill.medicalNotes || "");
    const updated = parkedBills.filter(b => b.id !== bill.id);
    setParkedBills(updated);
    localStorage.setItem("posParkedBills", JSON.stringify(updated));
    setIsParkedListOpen(false);
  };

  const handleOpenCheckout = () => {
    const typesRequiringStaff = ["Service", "Product", "Package", "Bundle"];
    const unassignedItems = cart.filter(item => {
      if (!typesRequiringStaff.includes(item.type)) return false;

      if (item.type === "Package") {
        // Package pakai field `sellingBy` (single staff, buat komisi penjualan),
        // BUKAN serviceStaffAssignments — lihat komentar di render item Package
        // (~line 3331): UI-nya sengaja cuma nampilin "Selling By" biar match sama
        // yang disimpan/dilaporin. Validasi ini ketinggalan waktu itu diubah, jadi
        // selalu nganggep Package "belum di-assign" walau Selling By udah diisi.
        return !item.sellingBy;
      }

      if (item.type === "Bundle" && item.bundleServices) {
        // Jika bundle, cek apakah ada minimal 1 anak service yang belum di-assign
        return item.bundleServices.some((bs, idx) => {
          const key = getCartItemKey(item._id, item.type, idx);
          const assignments = serviceStaffAssignments[key] || [];
          return assignments.length === 0 || assignments.some(a => !a.staffId);
        });
      }

      const key = getCartItemKey(item._id, item.type);
      const assignments = serviceStaffAssignments[key] || [];
      return assignments.length === 0 || assignments.some(a => !a.staffId);
    });

    if (unassignedItems.length > 0) {
      alert(`Mohon pilih staff / capster untuk item:\n- ${unassignedItems.map(i => i.name).join('\n- ')}`);
      return;
    }
    
    setIsCheckoutModalOpen(true);
  };

  const deleteParkedBill = (id: string) => {
    const updated = parkedBills.filter(b => b.id !== id);
    setParkedBills(updated);
    localStorage.setItem("posParkedBills", JSON.stringify(updated));
  };

  const handleCheckout = async (nonQrisPaid?: boolean) => {
    if (submitting) return;
    const computedTotals = calculateTotal();
    const { total, effectiveDiscount, payableSubtotal, maxWalletPaymentAllowed, subtotal, tax, tips, commission, assignments, lineItemSplits, redeemItems, referralDiscount } = computedTotals;

    if (referralCode.trim() && !referralValidated && isFirstTimer) {
      alert("Peringatan: Anda mengisi Kode Referral tetapi belum divalidasi. Klik tombol 'Cek Kode' terlebih dahulu.");
      return;
    }
    if (!selectedCustomer) {
      alert("Harap pilih customer");
      return;
    }
    if (cart.length === 0) {
      alert("Keranjang masih kosong");
      return;
    }
    // "Mengetahui dari" wajib — HANYA kalau owner sudah mengisi daftar sumber di Settings.
    // Daftar kosong = fitur mati, tak memblokir transaksi tenant yang belum pakai fitur ini.
    if ((settings.acquisitionSources?.length ?? 0) > 0 && !acquisitionSource) {
      alert("Field 'Mengetahui dari' wajib diisi!");
      return;
    }
    const serviceItems = cart.filter((item) => item.type === "Service");
    const hasFollowUpService = serviceItems.some((item) =>
      Boolean(item.waFollowUp?.enabled),
    );
    const packageItems = cart.filter((item) => item.type === "Package");

    if (hasFollowUpService) {
      if (
        selectedCustomer === "walking-customer" &&
        !followUpPhoneNumber.trim()
      ) {
        alert(
          "Nomor WA follow-up wajib diisi untuk Walking Customer yang mengambil service follow-up",
        );
        return;
      }

      if (
        selectedCustomer !== "walking-customer" &&
        !followUpPhoneNumber.trim()
      ) {
        alert(
          "Customer belum punya nomor telepon. Lengkapi nomor di master customer dulu.",
        );
        return;
      }
    }

    const isMarkedPaid = nonQrisPaid ?? false;
    // For split payment: use sum of all entries; for single: use that entry's amount
    const parsedAmountPaid =
      totalSplitPaidComputed > 0 ? totalSplitPaidComputed : total;
    const normalizedAmountPaid = Number.isFinite(parsedAmountPaid)
      ? parsedAmountPaid
      : 0;

    if (isMarkedPaid) {
      // Validate empty method
      if (splitPayments.some((p) => !p.method || p.method === "Pilih Metode..." || p.method.trim() === "")) {
        alert("Harap pilih metode pembayaran yang valid.");
        return;
      }

      // Validate manual discount reason
      if (effectiveDiscount > 0 && !discountReason.trim()) {
        alert("Alasan diskon manual wajib diisi!");
        return;
      }

      // Validate 0 amount
      if (splitPayments.length === 1 && totalSplitPaidComputed === 0 && total > 0) {
        alert("Harap isi nominal bayar atau klik tombol 'Isi Pas'.");
        return;
      }
      // Split payment: all entries must sum to total (within Rp 1 tolerance)
      if (
        splitPayments.length > 1 &&
        Math.abs(totalSplitPaidComputed - total) >= 1
      ) {
        alert(
          `Total split pembayaran (${settings.symbol}${totalSplitPaidComputed.toLocaleString("id-ID", { maximumFractionDigits: 0 })}) tidak sesuai dengan total transaksi (${settings.symbol}${total.toLocaleString("id-ID", { maximumFractionDigits: 0 })}). Sesuaikan jumlah tiap metode pembayaran.`,
        );
        return;
      }
      // Single payment: entered amount must be >= total (or empty = pay full)
      if (
        splitPayments.length === 1 &&
        totalSplitPaidComputed > 0 &&
        totalSplitPaidComputed < total
      ) {
        alert(
          `Nominal bayar kurang. Total ${settings.symbol}${total.toLocaleString("id-ID", { maximumFractionDigits: 0 })}. Pilih "Belum Dibayar" jika transaksi belum lunas.`,
        );
        return;
      }
    }

    if (packageItems.length > 0) {
      for (const packageItem of packageItems) {
        if (Number(packageItem.quantity || 0) < 1) {
          alert(`Quantity paket "${packageItem.name}" tidak valid.`);
          return;
        }
      }
    }
    for (const item of cart.filter(i => i.type === "Service" || i.type === "Bundle")) {
      if (item.type === "Bundle" && item.bundleServices) {
        const totalOriginalPrice = item.bundleServices.reduce((s, bs) => s + bs.servicePrice, 0);
        for (let i = 0; i < item.bundleServices.length; i++) {
          const bs = item.bundleServices[i];
          const bsKey = getCartItemKey(item._id, item.type, i);
          const rawAssignments = serviceStaffAssignments[bsKey] || [];
          const itemAssignments = getEffectiveServiceAssignments(item._id, item.type, i);
          const splitMode = serviceSplitModes[bsKey] || "auto";
          const commissionType = bs.commissionType || "fixed";
          const commissionValue = Number(bs.commissionValue || 0);

          if (settings.showCommissionInPOS) {
            // Komisi 0 diperbolehkan (service gratis/bundle/manual). Hanya nilai negatif yang ditolak.
            if (commissionValue < 0) {
              alert(`Komisi service "${bs.serviceName}" dalam bundle "${item.name}" tidak boleh negatif.`);
              return;
            }
          }

          if (itemAssignments.length === 0) {
            alert(`Harap pilih minimal 1 staff untuk service "${bs.serviceName}" dalam bundle "${item.name}"`);
            return;
          }

          const ids = rawAssignments.map((assignment) => assignment.staffId);
          if (ids.length !== new Set(ids).size) {
            alert(`Terdapat staff yang duplikat pada service "${bs.serviceName}" di dalam bundle "${item.name}"`);
            return;
          }

          if (settings.showCommissionInPOS) {
            const proportion = totalOriginalPrice > 0 ? bs.servicePrice / totalOriginalPrice : 1 / item.bundleServices.length;
            const itemPrice = Math.round(item.price * proportion);

            const splitResult = calculateSplitCommission({
              splitMode,
              assignments: itemAssignments.map((assignment) => ({
                staffId: assignment.staffId,
                percentage: assignment.percentage,
                staffCommissionRate: getStaffRate(assignment.staffId),
              })),
              servicePrice: itemPrice,
              quantity: item.quantity,
              commissionType: (commissionType as "fixed" | "percentage"),
              commissionValue,
              sourceType: "normal_sale",
            });

            if (!splitResult.isValid) {
              alert(`${bs.serviceName} in ${item.name}: ${splitResult.errors[0] || "Split komisi tidak valid"}`);
              return;
            }
          }
        }
        continue;
      }

      const key = getCartItemKey(item._id, item.type);
      const rawAssignments = serviceStaffAssignments[key] || [];
      const itemAssignments = getEffectiveServiceAssignments(
        item._id,
        item.type,
      );
      const splitMode = serviceSplitModes[key] || "auto";
      const commissionType = item.commissionType || "fixed";
      const commissionValue = Number(item.commissionValue || 0);

      if (settings.showCommissionInPOS) {
        // Komisi 0 diperbolehkan (service gratis/manual). Hanya nilai negatif yang ditolak.
        if (commissionValue < 0) {
          alert(
            `Komisi service "${item.name}" tidak boleh negatif.`,
          );
          return;
        }
      }

      if (itemAssignments.length === 0) {
        alert(`Harap pilih minimal 1 staff untuk service "${item.name}"`);
        return;
      }

      const ids = rawAssignments.map((assignment) => assignment.staffId);
      if (ids.length !== new Set(ids).size) {
        alert(`Terdapat staff yang duplikat pada service "${item.name}"`);
        return;
      }

      if (settings.showCommissionInPOS) {
        const splitResult = calculateSplitCommission({
          splitMode,
          assignments: itemAssignments.map((assignment) => ({
            staffId: assignment.staffId,
            percentage: assignment.percentage,
            staffCommissionRate: getStaffRate(assignment.staffId),
          })),
          servicePrice: item.price,
          quantity: item.quantity,
          commissionType,
          commissionValue,
          sourceType: packageClaims[key]?.enabled
            ? "package_redeem"
            : "normal_sale",
        });

        if (!splitResult.isValid) {
          alert(
            `${item.name}: ${splitResult.errors[0] || "Split komisi tidak valid"}`,
          );
          return;
        }
      }

      const claim = packageClaims[key];
      if (claim?.enabled) {
        if (!selectedCustomer || selectedCustomer === "walking-customer") {
          alert("Klaim paket membutuhkan customer yang terdaftar");
          return;
        }

        if (!claim.customerPackageId) {
          alert(`Harap pilih sumber paket untuk service "${item.name}"`);
          return;
        }

        const pkg = customerPackages.find(
          (p) => p._id === claim.customerPackageId,
        );
        const quota = pkg?.serviceQuotas.find(
          (q) => String(q.service) === String(item._id),
        );
        if (
          !quota ||
          Number(quota.remainingQuota) < Number(item.quantity || 0)
        ) {
          alert(`Kuota tidak mencukupi untuk service "${item.name}"`);
          return;
        }
      }
    }

    setSubmitting(true);
    try {
      if (packageItems.length > 0) {
        if (cart.length > packageItems.length) {
          alert("Pembelian paket dan layanan/produk reguler tidak dapat digabung dalam satu kali bayar. Mohon pisahkan menjadi dua transaksi.");
          setSubmitting(false);
          return;
        }

        const customerId =
          selectedCustomer === "walking-customer"
            ? undefined
            : selectedCustomer;

        if (!customerId) {
          alert("Pembelian paket wajib pilih customer terdaftar.");
          setSubmitting(false);
          return;
        }

        const isMarkedPaid = nonQrisPaid ?? false;

        const expandedPackageItems = packageItems.flatMap((item) => {
          const qty = Math.max(1, Number(item.quantity || 1));
          return Array.from({ length: qty }, () => item);
        });

        const packageGlobalDiscount = expandedPackageItems.length > 0 
          ? effectiveDiscount / expandedPackageItems.length 
          : 0;

        const createdPayments: Array<{
          sourceId: string;
          amount: number;
          customer: string;
          description: string;
        }> = [];

        for (const packageItem of expandedPackageItems) {
          const totalDiscountForThisPackage = (packageItem.discountAmount || 0) + packageGlobalDiscount;
          const orderRes = await fetch("/api/package-orders", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...storeHeaders },
            body: JSON.stringify({
              customerId,
              packageId: packageItem._id,
              discount: totalDiscountForThisPackage,
              sellingBy: packageItem.sellingBy || undefined,
            }),
          });

          const orderData = await orderRes.json();
          if (!orderData.success || !orderData.data?.payment) {
            alert(orderData.error || "Gagal membuat order paket");
            return;
          }

          createdPayments.push(orderData.data.payment);
        }

        if (isMarkedPaid) {
          let lastInvoiceId: string | null = null;

          for (const payment of createdPayments) {
            const markPaidRes = await fetch(
              `/api/package-orders/${payment.sourceId}`,
              {
                method: "PATCH",
                headers: { "Content-Type": "application/json", ...storeHeaders },
                body: JSON.stringify({
                  paid: true,
                  paymentMethod,
                }),
              },
            );

            const markPaidData = await markPaidRes.json();
            if (!markPaidData.success) {
              alert(markPaidData.error || "Gagal konfirmasi pembayaran paket");
              return;
            }

            // Capture the invoice ID for receipt redirect
            if (markPaidData.invoice?._id) {
              lastInvoiceId = markPaidData.invoice._id;
            }
          }

          setCart([]);
          setDiscount(0);
          setDiscountReason("");
          setStaffTips({});
          setSelectedCustomer("");
          setFollowUpPhoneNumber("");
          setServiceStaffAssignments({});
          setServiceSplitModes({});
          setPackageClaims({});
          setSplitPayments([{ method: "", amount: "" }]);

          // Redirect to receipt if invoice was created
          if (lastInvoiceId) {
            router.push(`/invoices/print/${lastInvoiceId}`);
          } else {
            alert(
              `Pembayaran ${createdPayments.length} paket tersimpan dan paket customer langsung aktif.`,
            );
          }
        } else {
          alert(
            `Order ${createdPayments.length} paket dibuat sebagai belum dibayar (pending). Paket akan aktif setelah dilunasi.`,
          );

          setCart([]);
          setDiscount(0);
          setDiscountReason("");
          setStaffTips({});
          setSelectedCustomer("");
          setFollowUpPhoneNumber("");
          setServiceStaffAssignments({});
          setServiceSplitModes({});
          setPackageClaims({});
          setSplitPayments([{ method: "", amount: "" }]);
        }
        return;
      }


      // amountPaid di-cap ke totalAmount — nominal kasir boleh lebih (kembalian),
      // tapi yang tersimpan sebagai 'dibayar' tidak boleh melebihi total transaksi.
      const paid = isMarkedPaid
        ? totalSplitPaidComputed > 0
          ? Math.min(totalSplitPaidComputed, total)
          : total
        : 0;
      const status = isMarkedPaid
        ? paid >= total
          ? "paid"
          : "partially_paid"
        : "pending";

      // Handle walking customer by setting customer to undefined
      const customerId =
        selectedCustomer === "walking-customer" ? undefined : selectedCustomer;

      const payload = {
        customer: customerId,
        appointment: appointmentId || undefined,
        followUpPhoneNumber: followUpPhoneNumber.trim() || undefined,
        items: cart.flatMap((item): any[] => {
          // Expand Bundle into individual Service line items
          if (
            item.type === "Bundle" &&
            item.bundleServices &&
            item.bundleServices.length > 0
          ) {
            const totalOriginalPrice = item.bundleServices.reduce(
              (s, bs) => s + bs.servicePrice,
              0,
            );
            const qty = item.quantity;

            return Array.from({ length: qty }, () =>
              (item.bundleServices || []).map((bs, i) => {
                const bundleKey = getCartItemKey(item._id, item.type, i);
                const splitData = lineItemSplits[bundleKey];

                const proportion =
                  totalOriginalPrice > 0
                    ? bs.servicePrice / totalOriginalPrice
                    : 1 / (item.bundleServices?.length || 1);
                const itemPrice = Math.round(item.price * proportion);
                const itemDiscount = Math.round((item.discountAmount || 0) * proportion);

                const splitMode = splitData?.splitCommissionMode || "auto";
                const assignments = splitData?.staffAssignments || [];

                return {
                  item: bs.service,
                  itemModel: "Service" as const,
                  name: `${bs.serviceName} (Bundle: ${item.name})`,
                  price: itemPrice,
                  quantity: 1,
                  discount: itemDiscount,
                  total: itemPrice - itemDiscount,
                  discountNote: item.discountNote || undefined,
                  splitCommissionMode: splitMode,
                  sellingBy: item.sellingBy || undefined,
                  sellingCommission: item.sellingBy ? (
                    item.sellingCommissionType === 'percentage'
                      ? ((itemPrice - itemDiscount) * Number(item.sellingCommissionValue || 0) / 100)
                      : (Number(item.sellingCommissionValue || 0) * proportion)
                  ) : 0,
                  staffAssignments: assignments.map((a: any) => ({
                    staff: a.staffId,
                    staffId: a.staffId,
                    percentage: a.percentage,
                    porsiPersen: a.percentage,
                    commission: a.commission,
                    komisiNominal: a.commission,
                    tip: 0,
                  })),
                };
              }),
            ).flat();
          }

          // TopUp Wallet items — no staff, no commission
          if (item.type === "TopUp") {
            return [
              {
                itemModel: "TopUp",
                name: item.name,
                price: item.price,
                quantity: 1,
                total: item.price,
              },
            ];
          }

          // Normal Service / Product / Package items
          return [
            {
              ...(item.type === "Service" &&
                packageClaims[getCartItemKey(item._id, item.type)]?.enabled
                ? { metadata: { claimedFromPackage: true } }
                : {}),
              ...(item.type === "Service"
                ? {
                  splitCommissionMode:
                    lineItemSplits[getCartItemKey(item._id, item.type)]
                      ?.splitCommissionMode ||
                    serviceSplitModes[getCartItemKey(item._id, item.type)] ||
                    "auto",
                  staffAssignments: (
                    lineItemSplits[getCartItemKey(item._id, item.type)]
                      ?.staffAssignments || []
                  ).map((assignment) => ({
                    staff: assignment.staffId,
                    staffId: assignment.staffId,
                    percentage: assignment.percentage,
                    porsiPersen: assignment.porsiPersen,
                    commission: assignment.commission,
                    komisiNominal: assignment.komisiNominal,
                    tip: assignment.tip,
                  })),
                }
                : (item.type === "Product" || item.type === "Package") &&
                  (
                    lineItemSplits[getCartItemKey(item._id, item.type)]
                      ?.staffAssignments || []
                  ).length > 0
                  ? {
                    splitCommissionMode: "auto" as const,
                    staffAssignments: (
                      lineItemSplits[getCartItemKey(item._id, item.type)]
                        ?.staffAssignments || []
                    ).map((assignment) => ({
                      staff: assignment.staffId,
                      staffId: assignment.staffId,
                      percentage: 100,
                      porsiPersen: 100,
                      commission: assignment.komisiNominal,
                      komisiNominal: assignment.komisiNominal,
                      tip: 0,
                    })),
                  }
                  : {}),
              item: item._id,
              itemModel: item.type === "Bundle" ? "Service" : (item.type === "Package" ? "ServicePackage" : item.type),
              name: item.name,
              price: item.price,
              quantity: item.quantity,
              discount: item.discountAmount || 0,
              discountNote: item.discountNote || undefined,
              sellingBy: item.sellingBy || undefined,
              sellingCommission: item.sellingBy ? (
                item.sellingCommissionType === 'percentage'
                  ? (getEffectivePrice(item) * item.quantity * Number(item.sellingCommissionValue || 0) / 100)
                  : (Number(item.sellingCommissionValue || 0) * item.quantity)
              ) : 0,
              total:
                item.type === "Service" &&
                  packageClaims[getCartItemKey(item._id, item.type)]?.enabled
                  ? 0
                  : getEffectivePrice(item) * item.quantity,
            },
          ];
        }) as any[],
        subtotal: payableSubtotal,
        tax,
        discount:
          effectiveDiscount +
          (voucherApplied?.discountAmount || 0) +
          referralDiscount +
          Math.min(loyaltyPointsToRedeem * (settings.loyaltyPointValue || 1), payableSubtotal),
        loyaltyPointsUsed: Math.min(loyaltyPointsToRedeem, Math.ceil(payableSubtotal / (settings.loyaltyPointValue || 1))),
        tips,
        totalAmount: total,
        commission,
        sourceType: redeemItems.length === 0 ? "normal_sale" : "package_redeem",
        staffAssignments: assignments.map((a) => ({
          staff: a.staffId,
          staffId: a.staffId,
          percentage: a.percentage,
          porsiPersen: a.porsiPersen,
          commission: a.commission,
          komisiNominal: a.komisiNominal,
          tip: a.tip,
        })),
        staff: assignments[0]?.staffId || undefined, // Keep primary staff for compatibility
        amountPaid: paid,
        paymentMethod, // primary method (first entry) for backward compat
        paymentMethods: splitPayments.map((p) => ({
          method: p.method,
          amount: parseFloat(String(p.amount || "0")) || 0,
        })),
        status: status,
        referralCode: referralCode.trim() || undefined,
        voucherId: voucherApplied?.voucherId || undefined,
        discountBreakdown: {
          manual: effectiveDiscount,
          manualReason: discountReason.trim() || undefined,
          loyalty: Math.min(loyaltyPointsToRedeem * (settings.loyaltyPointValue || 1), payableSubtotal),
          referral: referralDiscount,
          voucher: voucherApplied?.discountAmount || 0
        },
        medicalNotes: medicalNotes.trim() || undefined,
        acquisitionSource: acquisitionSource || undefined,
        packageUsage: cart.filter(item => item.type === "Service" && packageClaims[getCartItemKey(item._id, item.type)]?.enabled).map(item => {
          const claim = packageClaims[getCartItemKey(item._id, item.type)];
          const pkg = customerPackages.find(p => p._id === claim.customerPackageId);
          const quota = pkg?.serviceQuotas.find(q => String(q.service) === String(item._id));
          return {
            itemName: item.name,
            packageName: pkg?.package?.name || "Package",
            usedQuantity: item.quantity,
            remainingQuota: Math.max(0, (quota?.remainingQuota || 0) - item.quantity),
            expiryDate: pkg?.expiresAt
          };
        }),
        notes:
          [
            voucherApplied
              ? `Voucher: ${voucherApplied.code} (-${settings.symbol}${voucherApplied.discountAmount.toLocaleString("id-ID")})`
              : "",
            loyaltyPointsToRedeem > 0
              ? `Loyalty Redeem: ${loyaltyPointsToRedeem} pts (-${settings.symbol}${Math.min(loyaltyPointsToRedeem * (settings.loyaltyPointValue || 1), payableSubtotal).toLocaleString("id-ID")})`
              : "",
            referralValidated
              ? `Referral Code: ${referralCode} (-${settings.symbol}${referralDiscount.toLocaleString("id-ID")})`
              : "",
          ]
            .filter(Boolean)
            .join(" | ") || undefined,
      };

      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...storeHeaders },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        // Voucher usage is now handled atomically in POST /api/invoices backend.

        // Remove manual loyalty point deduction logic (handled securely in POST /api/invoices)
        // Deduct loyalty points logic has been moved to backend POST handler.



        if (redeemItems.length > 0 && customerId) {
          const redeemRes = await fetch("/api/customer-packages/redeem", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...storeHeaders },
            body: JSON.stringify({
              customerId,
              invoiceId: data.data._id,
              items: redeemItems,
              note: "Redeem from POS checkout",
            }),
          });

          const redeemData = await redeemRes.json();
          if (!redeemData.success) {
            alert(redeemData.error || "Gagal menebus kuota paket");
            return;
          }
        }

        // Deposit records are now created atomically in backend POST /api/invoices

        // Auto-complete appointment if checkout was initiated from a booking
        if (appointmentId) {
          try {
            const updatedServices = cart
              .filter(item => item.type === "Service" || item.type === "Bundle")
              .flatMap(item => {
                if (item.type === "Bundle" && item.bundleServices) {
                  return item.bundleServices.map(bs => ({
                    service: bs.service,
                    name: bs.serviceName,
                    price: bs.servicePrice,
                    duration: bs.duration || 30
                  }));
                } else if (item.type === "Service") {
                  return [{
                    service: item._id,
                    name: item.name,
                    price: item.price,
                    duration: item.duration || 30
                  }];
                }
                return [];
              });

            fetch(`/api/appointments/${appointmentId}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json", ...storeHeaders },
              body: JSON.stringify({ 
                 status: "completed",
                 services: updatedServices.length > 0 ? updatedServices : undefined
              }),
            }).catch(err => console.error("Failed to auto-complete appointment in background:", err));
          } catch (err) {
            console.error("Failed to format appointment services:", err);
          }
        }

        // Auto-send WhatsApp Receipt if customer is attached
        if (customerId) {
          try {
            // Fire and forget (don't block the redirect)
            fetch(`/api/invoices/${data.data._id}/wa-nota`, {
              method: 'POST',
              headers: storeHeaders
            }).catch(e => console.error("Auto WA send failed in background:", e));
          } catch (err) {
            console.error("Failed to auto-send WA:", err);
          }
        }

        resetCheckoutState();
        if (customerId) {
          router.push(`/invoices/print/${data.data._id}?autoSent=1`);
        } else {
          router.push(`/invoices/print/${data.data._id}`);
        }
      } else {
        alert(data.error || "Gagal membuat invoice");
      }
    } catch (error) {
      console.error(error);
      alert("Terjadi kesalahan saat memproses checkout");
    } finally {
      setSubmitting(false);
    }
  };

  const hasInvalidSplitInCart = cart.some((item) => {
    if (item.type !== "Service") return false;
    return !getSplitCommissionPreviewForItem(item).isValid;
  });
  const enteredPaidAmount = totalSplitPaidComputed;
  const changeAmount = Math.max(0, totalSplitPaidComputed - total);
  const availableDeals = getAvailableDeals();
  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const renderStaffAssignmentBlock = (item: CartItem, customTitle?: string, bundleIndex?: number) => {
    const key = getCartItemKey(item._id, item.type, bundleIndex);
    return (
      <div key={key} className="w-full">
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[10px] font-bold text-gray-500">Assign Staff {customTitle ? `- ${customTitle}` : ""}</p>
          {settings?.showCommissionInPOS && (
            <div className="flex items-center gap-1">
              <span className="text-[9px] font-medium text-gray-400">Mode:</span>
              <select
                className="text-[9px] font-bold text-blue-600 bg-blue-50 border border-blue-100 rounded px-1 py-0.5 outline-none"
                value={serviceSplitModes[key] || "auto"}
                onChange={(e) => {
                  setServiceSplitModes((prev) => ({
                    ...prev,
                    [key]: e.target.value as "auto" | "manual",
                  }));
                  const current = serviceStaffAssignments[key] || [];
                  if (e.target.value === "auto" && current.length > 0) {
                    const newPct = 100 / current.length;
                    const updated = current.map((a) => ({ ...a, percentage: newPct }));
                    setServiceStaffAssignments((prev) => ({ ...prev, [key]: updated }));
                  }
                }}
              >
                <option value="auto">Bagi Rata</option>
                <option value="manual">Manual %</option>
              </select>
            </div>
          )}
        </div>
        
        <div className="space-y-1.5">
          {(serviceStaffAssignments[key] || []).map((assignment, idx) => (
            <div key={idx} className="flex items-center gap-1.5">
              <SearchableSelect
                placeholder="Pilih Staff..."
                value={assignment.staffId}
                onChange={(val) => {
                  const updated = [...(serviceStaffAssignments[key] || [])];
                  updated[idx].staffId = val;
                  setServiceStaffAssignments((prev) => ({
                    ...prev,
                    [key]: updated,
                  }));
                }}
                options={[
                  { value: "", label: "— Pilih —" },
                  ...staffList.map((s) => ({ value: s._id, label: s.name })),
                ]}
                className="flex-1"
                controlClassName="px-2 py-1 text-[10px] min-h-[26px]"
              />
              {settings?.showCommissionInPOS && (
                serviceSplitModes[key] === "manual" ? (
                  <div className="flex items-center gap-0.5 w-14">
                    <input
                      type="number"
                      value={assignment.percentage}
                      onChange={(e) => {
                        const updated = [...(serviceStaffAssignments[key] || [])];
                        updated[idx].percentage = parseFloat(e.target.value) || 0;
                        setServiceStaffAssignments((prev) => ({
                          ...prev,
                          [key]: updated,
                        }));
                      }}
                      className="w-full text-right text-[10px] border border-gray-200 rounded px-1 py-1 focus:ring-1 focus:ring-blue-500 outline-none"
                    />
                    <span className="text-[10px] text-gray-500">%</span>
                  </div>
                ) : (
                  <div className="w-10 text-right text-[10px] text-gray-500 font-medium">
                    {assignment.percentage.toFixed(1)}%
                  </div>
                )
              )}
              <button
                type="button"
                onClick={() => {
                  let updated = [...(serviceStaffAssignments[key] || [])];
                  updated.splice(idx, 1);
                  if (serviceSplitModes[key] !== "manual" && updated.length > 0) {
                    const newPct = 100 / updated.length;
                    updated = updated.map((a) => ({ ...a, percentage: newPct }));
                  }
                  setServiceStaffAssignments((prev) => ({
                    ...prev,
                    [key]: updated,
                  }));
                }}
                className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
          
          <button
            type="button"
            onClick={() => {
              const current = serviceStaffAssignments[key] || [];
              const isManual = serviceSplitModes[key] === "manual";
              let updated = [...current, { staffId: "", percentage: isManual ? 0 : 100 }];
              if (!isManual) {
                const newPct = 100 / updated.length;
                updated = updated.map((a) => ({ ...a, percentage: newPct }));
              }
              setServiceStaffAssignments((prev) => ({
                ...prev,
                [key]: updated,
              }));
            }}
            className="text-[9px] font-bold text-blue-600 flex items-center gap-1 hover:text-blue-800 py-0.5"
          >
            <Plus className="w-3 h-3" /> Tambah Staff
          </button>
        </div>
      </div>
    );
  };

  const renderSellingByBlock = (item: CartItem) => {
    if (!["Service", "Package", "Bundle", "Product"].includes(item.type)) return null;
    return (
      <div className="w-full">
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[10px] font-bold text-gray-500">Selling By (Komisi Penjualan)</p>
        </div>
        <div className="flex items-center gap-1.5">
          <SearchableSelect
            placeholder="Pilih Staff Penjual..."
            value={item.sellingBy || ""}
            onChange={(val) => {
              setCart(cart.map((c) => {
                if (c._id === item._id && c.type === item.type) {
                  return { ...c, sellingBy: val };
                }
                return c;
              }));
            }}
            options={[
              { value: "", label: "— Pilih —" },
              ...staffList.map((s) => ({ value: s._id, label: s.name })),
            ]}
            className="flex-1"
            controlClassName="px-2 py-1 text-[10px] min-h-[26px]"
          />
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-[100dvh] w-full bg-[#FCFAF8] overflow-hidden flex-col md:flex-row">
      {/* Left Side: Items Catalog */}
      <div
        className={`flex-1 flex flex-col min-w-0 border-r border-gray-200 bg-white ${mobileTab === "cart" ? "hidden md:flex" : "flex"}`}
      >
        <div className="bg-white flex flex-col h-full overflow-hidden">
          {/* Header/Tabs */}
          <div className="px-4 py-3 lg:px-6 lg:py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
              <button onClick={() => router.push("/dashboard")} className="p-2 bg-gray-50 text-gray-400 hover:bg-gray-100 rounded-lg border border-gray-200 transition-colors hidden sm:block">
                <Menu className="w-5 h-5" />
              </button>
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Cari layanan..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-full text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 transition-colors"
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    title="Clear search"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="bg-emerald-100 text-emerald-700 font-bold text-[10px] px-2 py-1.5 rounded-full uppercase tracking-wide flex items-center gap-1.5 whitespace-nowrap">
                  <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
                  ONLINE
                </span>
                <span className="bg-[#FAF7F2] text-[#8B7355] font-bold text-[10px] px-2 py-1.5 rounded-full uppercase tracking-wide flex items-center gap-1.5 whitespace-nowrap border border-[#F0EBE1]">
                  <Store className="w-3 h-3" /> {settings.storeName || "CABANG PUSAT"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setIsManualServiceModalOpen(true)} className="px-3 py-1.5 border border-[#F0EBE1] rounded-full text-xs font-bold text-[#8B7355] hover:bg-[#FAF7F2] flex items-center gap-1.5 whitespace-nowrap transition-colors">
                  <Sparkles className="w-3.5 h-3.5" /> Layanan Manual
                </button>
                <button onClick={() => setIsCustomerModalOpen(true)} className="px-3 py-1.5 border border-dashed border-gray-400 rounded-full text-xs font-bold text-gray-700 hover:bg-gray-50 flex items-center gap-1.5 whitespace-nowrap bg-white">
                  <Plus className="w-3.5 h-3.5" /> Pilih Pelanggan
                </button>
              </div>
              <div className="flex items-center gap-1.5 border-l border-gray-200 pl-3">
                <button onClick={() => { setIsAppointmentsModalOpen(true); fetchTodayAppointments(); }} className="p-2 hover:bg-gray-100 text-gray-600 rounded-lg transition-colors" title="Jadwal Hari Ini">
                  <Calendar className="w-5 h-5" />
                </button>
                <button onClick={() => setIsParkedListOpen(true)} className="p-2 hover:bg-gray-100 text-gray-600 rounded-lg relative transition-colors" title="Bon Tersimpan">
                  <Wallet className="w-5 h-5" />
                  {parkedBills.length > 0 && (
                    <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-amber-500 rounded-full border-2 border-white"></span>
                  )}
                </button>
                <button onClick={() => setIsMedicalNotesModalOpen(true)} className="p-2 hover:bg-gray-100 text-gray-600 rounded-lg relative transition-colors flex items-center justify-center" title="Rekam Medis">
                  <Stethoscope className="w-5 h-5" />
                  {medicalNotes && (
                    <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-white"></span>
                  )}
                </button>
                <button onClick={() => { setIsReportsModalOpen(true); fetchTodayReport(); }} className="p-2 hover:bg-gray-100 text-gray-600 rounded-lg transition-colors" title="Laporan Hari Ini">
                  <Clock className="w-5 h-5" />
                </button>
                <button onClick={() => router.push("/dashboard")} className="p-2 hover:bg-red-50 text-red-500 rounded-lg transition-colors" title="Keluar">
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            {/* Tabs */}
            <div className="flex bg-gray-100 p-1 rounded-lg w-fit overflow-x-auto hide-scrollbar">
              {[
                { id: "all", label: "Semua" },
                { id: "services", label: "Layanan" },
                { id: "products", label: "Produk" },
                { id: "packages", label: "Paket" },
                { id: "bundles", label: "Bundling" },
                { id: "topup", label: "Top-Up" },
                { id: "favorites", label: <span className="flex items-center gap-1.5"><Star className="w-3.5 h-3.5 fill-current" /> Favorit</span> },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`px-4 py-1.5 rounded-md text-xs lg:text-sm font-semibold transition-colors whitespace-nowrap ${
                    activeTab === tab.id
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Category Pills */}
            {(activeTab === "all" || activeTab === "services" || activeTab === "products") && availableCategories.length > 0 && (
              <div className="flex gap-2 mt-4 overflow-x-auto hide-scrollbar pb-1">
                <button
                  onClick={() => setActiveCategory("all")}
                  className={`px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors border ${
                    activeCategory === "all"
                      ? "bg-gray-900 text-white border-gray-900"
                      : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  Semua Kategori
                </button>
                {availableCategories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCategory(cat.id)}
                    className={`px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors border ${
                      activeCategory === cat.id
                        ? "bg-gray-900 text-white border-gray-900"
                        : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Grid */}
          <div 
            className="flex-1 overflow-y-auto p-3 lg:p-4 bg-[#FCFAF8] pb-20 md:pb-4 custom-scrollbar"
            onScroll={(e) => {
              const bottom = e.currentTarget.scrollHeight - e.currentTarget.scrollTop <= e.currentTarget.clientHeight + 150;
              if (bottom && visibleCount < filteredItems.length) {
                setVisibleCount(prev => prev + 24);
              }
            }}
          >
            {loading ? (
              <div className="flex justify-center py-20">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-900 border-t-transparent"></div>
              </div>
            ) : activeTab === "topup" ? (
              <div className="h-full flex flex-col items-center justify-center px-4">
                <div className="w-full max-w-md bg-white rounded-2xl shadow-lg border border-gray-200 p-6 space-y-5">
                  <div className="text-center">
                    <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center mb-3 shadow-lg">
                      <Wallet className="w-8 h-8 text-white" />
                    </div>
                    <h3 className="text-lg font-bold text-gray-900">Top-Up Saldo Wallet</h3>
                    <p className="text-xs text-gray-500 mt-1">Isi saldo e-wallet pelanggan, otomatis masuk ke invoice & laporan kasir</p>
                  </div>

                  {(!selectedCustomer || selectedCustomer === "walking-customer") && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center">
                      <p className="text-xs text-amber-700 font-semibold">⚠️ Pilih Customer terdaftar terlebih dahulu di panel kanan</p>
                    </div>
                  )}

                  {selectedCustomer && selectedCustomer !== "walking-customer" && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex items-center justify-between">
                      <span className="text-xs text-emerald-700 font-medium">Saldo saat ini</span>
                      <span className="text-sm font-bold text-emerald-700">
                        {settings.symbol}{(customerWalletBalance || 0).toLocaleString("id-ID", { maximumFractionDigits: 0 })}
                      </span>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">Nominal Top-Up</label>
                    <input
                      type="number"
                      min="0"
                      placeholder="Contoh: 100000"
                      value={topupAmount}
                      onChange={(e) => setTopupAmount(e.target.value)}
                      className="w-full px-4 py-3 text-lg font-bold border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-gray-900 bg-white"
                    />
                  </div>

                  {/* Quick amount buttons */}
                  <div className="grid grid-cols-3 gap-2">
                    {[50000, 100000, 200000, 300000, 500000, 1000000].map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setTopupAmount(amt)}
                        className="py-2 px-2 text-xs font-semibold rounded-lg border border-gray-200 bg-gray-50 hover:bg-emerald-50 hover:border-emerald-300 transition-colors text-gray-700"
                      >
                        {settings.symbol}{amt.toLocaleString("id-ID")}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={addTopUpToCart}
                    disabled={!selectedCustomer || selectedCustomer === "walking-customer" || !topupAmount || Number(topupAmount) <= 0}
                    className="w-full py-3 rounded-xl bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-md"
                  >
                    <ShoppingCart className="w-4 h-4" />
                    Tambahkan ke Keranjang
                  </button>
                </div>
              </div>
            ) : activeTab === "packages" && filteredItems.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center px-4">
                <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mb-3">
                  <Package className="w-6 h-6 text-amber-600" />
                </div>
                <p className="text-sm font-semibold text-gray-800 mb-1">
                  Belum ada paket aktif
                </p>
                <p className="text-xs text-gray-500 mb-3">
                  Buat dulu master paket di halaman Packages, lalu paket akan
                  muncul di POS.
                </p>
                <button
                  type="button"
                  onClick={() => router.push("/packages")}
                  className="px-3 py-2 text-xs font-semibold rounded-lg bg-blue-900 text-white hover:bg-blue-800"
                >
                  Buka Halaman Packages
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 xs:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2 lg:gap-3">
                {filteredItems.slice(0, visibleCount).map((item) => {
                  const children = item.type === "Service" ? (childrenMap.get(item._id) || []) : [];
                  const hasChildren = children.length > 0;
                  const isExpanded = expandedParent === item._id;

                  return (
                    <React.Fragment key={`${item._id}-${item.type}`}>
                      <div
                        onClick={() => {
                          if (hasChildren) {
                            setExpandedParent(isExpanded ? null : item._id);
                          } else {
                            addToCart(item);
                            if (
                              typeof window !== "undefined" &&
                              window.innerWidth < 768
                            ) {
                              setMobileTab("cart");
                            }
                          }
                        }}
                        className={`relative bg-white p-3 lg:p-4 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.04)] border cursor-pointer hover:shadow-md transition-shadow flex flex-col items-start group min-h-[160px] lg:min-h-[180px] active:scale-[0.98] duration-75 ${hasChildren ? 'border-purple-200 bg-purple-50/30' : 'border-gray-100 hover:border-gray-200'} ${isExpanded ? 'ring-2 ring-purple-400 border-purple-400' : ''}`}
                      >
                        {(item as any).isFavorite && (
                          <Star className="absolute top-2 left-2 text-amber-500 w-4 h-4 fill-current" />
                        )}
                        {hasChildren && (
                          <span className="absolute top-2 right-2 bg-purple-600 text-white text-[9px] font-bold px-2 py-0.5 rounded-full">
                            {children.length} varian
                          </span>
                        )}
                        <div className="w-14 h-14 lg:w-16 lg:h-16 rounded-full flex items-center justify-center mb-3 group-hover:scale-105 transition-transform overflow-hidden bg-gray-50 border border-gray-100 self-center shrink-0">
                          {item.image ? (
                            <img
                              src={item.image}
                              alt={item.name}
                              className="w-full h-full object-cover"
                            />
                          ) : item.icon && ICONS.find(i => i.id === item.icon) ? (
                            <div className="w-full h-full bg-[#FAF7F2] rounded-full flex items-center justify-center border border-[#F0EBE1] shadow-sm">
                              {(() => {
                                const IconComp = ICONS.find(i => i.id === item.icon)!.icon;
                                return <IconComp className="w-7 h-7 text-[#8B7355]" strokeWidth={1.5} />;
                              })()}
                            </div>
                          ) : item.type === "Service" ? (
                            <div className="w-full h-full bg-[#FAF7F2] flex items-center justify-center border-none">
                              <ScissorsIcon className="w-6 h-6 text-[#8B7355]" />
                            </div>
                          ) : item.type === "Product" ? (
                            <div className="w-full h-full bg-[#FAF7F2] flex items-center justify-center border-none">
                              <Package className="w-6 h-6 text-[#8B7355]" />
                            </div>
                          ) : (
                            <div className="w-full h-full bg-[#FAF7F2] flex items-center justify-center border-none">
                              <Package className="w-6 h-6 text-[#8B7355]" />
                            </div>
                          )}
                        </div>
                        <h3 className="font-bold text-gray-800 text-xs lg:text-sm leading-tight line-clamp-2 mb-auto text-left w-full mt-1">
                          {item.name}
                        </h3>
                        <div className="flex items-end justify-between w-full mt-3 gap-2">
                           <div className="min-w-0 flex-1">
                             <p className="text-[9px] lg:text-[10px] text-gray-400 font-semibold leading-none mb-1">Mulai dari</p>
                             <p className="text-amber-600 font-black text-[11px] lg:text-xs tracking-tight leading-none truncate">
                               {settings.symbol}{(item.price || 0).toLocaleString("id-ID")}
                             </p>
                           </div>
                           <div className="w-7 h-7 lg:w-8 lg:h-8 bg-[#D2B48C]/20 rounded-full flex items-center justify-center shrink-0 transition-all group-hover:bg-[#D2B48C]/40">
                             <Plus className="w-4 h-4 lg:w-5 lg:h-5 text-[#8B4513]" strokeWidth={2.5} />
                           </div>
                        </div>
                      </div>
                      {isExpanded && children
                        .map(child => (
                          <div
                            key={child._id}
                            onClick={() => {
                              addToCart(child);
                              if (
                                typeof window !== "undefined" &&
                                window.innerWidth < 768
                              ) {
                                setMobileTab("cart");
                              }
                            }}
                            className="relative flex flex-col items-start p-3 lg:p-4 rounded-2xl border border-dashed border-purple-200 bg-purple-50/30 text-left cursor-pointer transition-all hover:shadow-[0_2px_8px_rgba(0,0,0,0.04)] hover:bg-white active:scale-[0.98] duration-75 min-h-[160px] lg:min-h-[180px] group"
                          >
                            <div className="w-14 h-14 lg:w-16 lg:h-16 rounded-xl flex items-center justify-center mb-3 group-hover:scale-105 transition-transform overflow-hidden bg-purple-100/50 self-center shrink-0">
                              {child.image ? (
                                <img src={child.image} alt={child.name} className="w-full h-full object-cover" />
                              ) : (
                                <ScissorsIcon className="w-6 h-6 text-purple-400" />
                              )}
                            </div>
                            <p className="text-xs lg:text-sm font-bold text-gray-800 line-clamp-2 leading-tight mb-auto w-full mt-1">{child.name}</p>
                            <div className="flex items-end justify-between w-full mt-3 gap-2">
                               <div className="min-w-0 flex-1">
                                 <p className="text-[9px] lg:text-[10px] text-gray-400 font-semibold leading-none mb-1">Harga Varian</p>
                                 <p className="text-amber-600 font-black text-xs lg:text-sm leading-none truncate">
                                   {settings.symbol}{(child.price || 0).toLocaleString("id-ID")}
                                 </p>
                               </div>
                               <div className="w-7 h-7 lg:w-8 lg:h-8 rounded-full bg-[#D2B48C]/20 flex items-center justify-center shrink-0 shadow-sm group-hover:bg-[#D2B48C]/40 transition-colors">
                                 <Plus className="w-4 h-4 text-[#8B4513]" />
                               </div>
                            </div>
                          </div>
                        ))
                      }
                    </React.Fragment>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right Side: Cart */}
      <div
        className={`w-full md:w-[420px] lg:w-[500px] xl:w-[560px] 2xl:w-[620px] md:flex-none flex flex-col text-gray-900 bg-white border-l border-gray-200 ${mobileTab === "catalog" ? "hidden md:flex" : "flex"} h-full`}
      >
        <div className="bg-white flex flex-col h-full overflow-hidden">
          <div className="p-3 lg:p-4 border-b border-gray-200 bg-gray-50 flex-shrink-0 space-y-3">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 lg:w-5 lg:h-5 text-gray-500 flex-shrink-0" />
              <SearchableSelect
                placeholder="Select Customer"
                value={selectedCustomer}
                onChange={(val) => setSelectedCustomer(val)}
                options={[
                  { value: "walking-customer", label: "Walking Customer" },
                  ...customers.map((c) => ({
                    value: c._id,
                    label: `${c.name} ${c.phone ? `(${c.phone})` : ""}`,
                    showGreenIndicator:
                      Number(c.packageSummary?.activePackages || 0) > 0,
                  })),
                ]}
                className="flex-1"
                controlClassName="px-3 py-1.5 text-xs md:text-xs lg:text-sm"
              />
              <button
                onClick={() => setIsCustomerModalOpen(true)}
                className="p-2 bg-blue-900 text-white rounded-lg hover:bg-blue-800 transition-colors shadow-sm"
                title="Add New Customer"
              >
                <Plus className="w-4 h-4 ml-0.5" />
              </button>
              <button
                type="button"
                onClick={() => setIsDealsModalOpen(true)}
                disabled={
                  !selectedCustomer || selectedCustomer === "walking-customer"
                }
                className="p-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                title="My Deals"
              >
                <Package className="w-4 h-4" />
              </button>
            </div>

            {(() => {
              const cust = customers.find(c => c._id === selectedCustomer);
              const isPremium = cust && cust.membershipTier === "premium" && cust.membershipExpiry && new Date(cust.membershipExpiry) > new Date();
              if (!isPremium) return null;
              return (
                <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 px-3 py-2 shadow-sm">
                  <div className="flex flex-col">
                    <span className="text-[12px] font-black text-amber-800 tracking-wide uppercase flex items-center gap-1">
                      <Award className="w-4 h-4 text-amber-600" /> Premium Member Active
                    </span>
                    <span className="text-[10px] text-amber-600 font-bold">
                      s/d {new Date(cust.membershipExpiry!).toLocaleDateString("id-ID")}
                    </span>
                  </div>
                  <span className="text-[10px] text-amber-700 font-bold">
                    Harga Diskon
                  </span>
                </div>
              );
            })()}

            {selectedCustomer &&
              selectedCustomer !== "walking-customer" &&
              availableDeals.length > 0 && (
                <div className="flex items-center justify-between rounded-lg border border-amber-100 bg-amber-50 px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                    <p className="text-[11px] text-amber-800 font-semibold">
                      {availableDeals.length} reward tersedia
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsDealsModalOpen(true)}
                    className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700 hover:text-amber-900"
                  >
                    Lihat <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              )}

            {selectedCustomer && selectedCustomer !== "walking-customer" && (
              <div className="grid grid-cols-2 gap-2 mt-1">
                <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 shadow-sm">
                  <div className="flex items-center gap-1.5">
                    <Wallet className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                    <span className="text-[11px] text-emerald-900 font-semibold">Saldo Wallet</span>
                  </div>
                  <span className="text-[12px] font-black text-emerald-700">
                    {settings.symbol}{(customerWalletBalance || 0).toLocaleString("id-ID", { maximumFractionDigits: 0 })}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 shadow-sm">
                  <div className="flex items-center gap-1.5">
                    <Award className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                    <span className="text-[11px] text-blue-900 font-semibold">Loyalty Poin</span>
                  </div>
                  <span className="text-[12px] font-black text-blue-700">
                    {(customerLoyaltyPoints || 0).toLocaleString("id-ID")} Pts
                  </span>
                </div>
              </div>
            )}

            {/* Referral Code */}
            {selectedCustomer && selectedCustomer !== "walking-customer" && isFirstTimer && !customers.find((c) => c._id === selectedCustomer)?.referredBy && (
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-gray-700 flex items-center gap-1">
                  🎁 Kode Referral (First Timer Only)
                </label>
                {referralValidated ? (
                  <div className="flex items-center justify-between px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
                    <div>
                      <p className="text-xs font-bold text-green-800">
                        Kode dari {referralValidated.referrerName} ✅
                      </p>
                      <p className="text-[10px] text-green-600">
                        Diskon otomatis{" "}
                        {settings.referralDiscountType === "percentage"
                          ? `${settings.referralDiscountValue}%`
                          : `${settings.symbol}${(settings.referralDiscountValue || 0).toLocaleString("id-ID")}`}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setReferralValidated(null);
                        setReferralCode("");
                      }}
                      className="text-xs font-bold text-red-600 px-2 py-1 hover:bg-red-50 rounded"
                    >
                      Batal
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={referralCode}
                      onChange={(e) => { setReferralCode(e.target.value.toUpperCase()); if (referralValidated) setReferralValidated(null); }} onKeyDown={(e) => { if (e.key === "Enter") void applyReferralCode(); }}
                      placeholder="Masukkan kode teman"
                      className="flex-1 h-9 px-3 text-xs lg:text-sm text-gray-900 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 uppercase tracking-wider font-bold placeholder:font-normal placeholder:tracking-normal placeholder:normal-case"
                    />
                    <button
                      type="button"
                      onClick={applyReferralCode}
                      disabled={!referralCode.trim() || referralValidating}
                      className="h-9 px-3 bg-amber-100 text-amber-700 font-bold text-xs rounded-lg hover:bg-amber-200 disabled:opacity-50 transition-colors"
                    >
                      {referralValidating ? "Cek..." : "Cek Kode"}
                    </button>
                  </div>
                )}
              </div>
            )}

            {selectedCustomer === "walking-customer" && (
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-gray-700">
                  Nomor WhatsApp (Walking Customer)
                </label>
                <input
                  type="text"
                  value={followUpPhoneNumber}
                  onChange={(e) => setFollowUpPhoneNumber(e.target.value)}
                  placeholder="Contoh: 08123456789"
                  className="w-full h-9 px-3 text-xs lg:text-sm text-gray-900 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            )}
          </div>

          {/* Cart Items */}
          <div className="flex-grow overflow-y-auto p-2 lg:p-3 space-y-2 pb-24 md:pb-2">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-400 py-10">
                <ShoppingCart className="w-8 h-8 lg:w-10 lg:h-10 mb-2 opacity-30" />
                <p className="text-xs lg:text-sm">Cart is empty</p>
              </div>
            ) : (
              cart.map((item) => (
                <div
                  key={`${item._id}-${item.type}`}
                  className="p-2 border border-gray-100 rounded-lg bg-white shadow-sm space-y-2"
                >
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex items-center gap-2 overflow-hidden flex-1">
                      <div className="flex-shrink-0">
                        {item.type === "Service" ? (
                          <div className="w-6 h-6 rounded-full bg-[#FAF7F2] border border-[#F0EBE1] flex items-center justify-center shadow-sm">
                            <ScissorsIcon className="w-3 h-3 text-[#8B7355]" />
                          </div>
                        ) : item.type === "TopUp" ? (
                          <div className="w-6 h-6 rounded-full bg-[#FAF7F2] border border-[#F0EBE1] flex items-center justify-center shadow-sm">
                            <Wallet className="w-3 h-3 text-[#8B7355]" />
                          </div>
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-[#FAF7F2] border border-[#F0EBE1] flex items-center justify-center shadow-sm">
                            <Package className="w-3 h-3 text-[#8B7355]" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs lg:text-sm font-bold text-gray-800 truncate">
                          {item.name}
                        </p>
                        <p className="text-[9px] lg:text-[10px] text-gray-500 flex items-center gap-1.5 flex-wrap">
                          {getEffectivePrice(item) < item.price ? (
                            <>
                              <span className="line-through text-gray-400">
                                {settings.symbol}{item.price.toLocaleString("id-ID")}
                              </span>
                              <span className="font-bold text-amber-600">
                                {settings.symbol}{getEffectivePrice(item).toLocaleString("id-ID")}
                              </span>
                              <span className="px-1 py-0.5 bg-amber-100 text-amber-700 text-[8px] uppercase font-black rounded-sm leading-none">
                                Member
                              </span>
                            </>
                          ) : (
                            <span>
                              {settings.symbol}{item.price.toLocaleString("id-ID")}
                            </span>
                          )}
                        </p>
                        {(() => {
                          if (item.type !== "Service") return null;
                          const claim =
                            packageClaims[getCartItemKey(item._id, item.type)];
                          if (!claim?.enabled || !claim.customerPackageId)
                            return null;
                          const pkg = customerPackages.find(
                            (entry) => entry._id === claim.customerPackageId,
                          );
                          const quota = pkg?.serviceQuotas.find(
                            (entry) =>
                              String(entry.service) === String(item._id),
                          );

                          return (
                            <p className="text-[9px] lg:text-[10px] text-amber-700 font-bold truncate">
                              Reward: {pkg?.packageName || "Paket"} (
                              {quota
                                ? `${quota.remainingQuota}/${quota.totalQuota}`
                                : "Claim"}
                              )
                            </p>
                          );
                        })()}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => updateQuantity(item._id, item.type, -1)}
                        className="p-1 hover:bg-gray-200 rounded text-gray-600"
                      >
                        <Minus className="w-2.5 h-2.5 md:w-3 md:h-3" />
                      </button>
                      <span className="text-xs md:text-sm font-black w-5 text-center text-gray-900">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateQuantity(item._id, item.type, 1)}
                        className="p-1 hover:bg-gray-200 rounded text-gray-600"
                      >
                        <Plus className="w-2.5 h-2.5 md:w-3 md:h-3" />
                      </button>
                      <button
                        onClick={() => removeFromCart(item._id, item.type)}
                        className="p-1 hover:bg-red-50 text-red-500 rounded ml-0.5"
                      >
                        <Trash2 className="w-2.5 h-2.5 md:w-3 md:h-3" />
                      </button>
                    </div>
                  </div>

                  {/* Inline Item Discount */}
                  {["Service", "Product", "Bundle", "Package"].includes(item.type) && (
                    <div className="flex items-center gap-1.5 text-[10px] mt-1 pt-1 border-t border-gray-100">
                      <span className="font-semibold text-gray-500">Diskon:</span>
                      <select
                        value={item.discountType || "percentage"}
                        onChange={(e) => updateCartItemDiscount(item._id, item.type, { discountType: e.target.value as any })}
                        className="h-6 px-1 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white font-medium text-gray-700"
                      >
                        <option value="percentage">%</option>
                        <option value="nominal">Rp</option>
                      </select>
                      <input
                        type="text"
                        value={item.discountValue || ""}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^0-9]/g, '');
                          updateCartItemDiscount(item._id, item.type, { discountValue: val ? parseInt(val) : 0 });
                        }}
                        placeholder="0"
                        className="h-6 w-16 px-1.5 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-right font-medium text-gray-700 bg-white"
                      />
                      <input
                        type="text"
                        value={item.discountNote || ""}
                        onChange={(e) => updateCartItemDiscount(item._id, item.type, { discountNote: e.target.value })}
                        placeholder="Keterangan..."
                        className="h-6 w-24 sm:w-32 px-1.5 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium text-gray-700 bg-white ml-auto"
                      />
                    </div>
                  )}

                  {/* Inline Staff Assignment (Side by Side) */}
                  {/* NOTE: "Assign Staff" (staffAssignments) is intentionally NOT shown for Package.
                      Package purchases go through /api/package-orders -> PATCH /api/package-orders/[id],
                      which only reads/saves `sellingBy` (single staff, matches ServicePackage's single
                      commissionType/commissionValue). staffAssignments entered here was silently dropped
                      and never reached the Invoice, which caused package sales to be missing entirely from
                      Staff Report (both the summary table and the drill-down detail). Keeping only
                      "Selling By" here so the field shown actually matches what gets saved & reported. */}
                  {["Service", "Product", "Bundle"].includes(item.type) && (
                    <div className="flex gap-2 w-full pt-1 mt-1 border-t border-gray-100">
                      <div className="flex-1 w-0 min-w-0">
                        {(item.type === "Service" || item.type === "Product") && (
                          renderStaffAssignmentBlock(item)
                        )}
                        {item.type === "Bundle" && item.bundleServices && (
                          <div className="space-y-1">
                            {item.bundleServices.map((bs, i) => renderStaffAssignmentBlock(item, bs.serviceName, i))}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 w-0 min-w-0 border-l border-gray-100 pl-2">
                        {renderSellingByBlock(item)}
                      </div>
                    </div>
                  )}
                  {item.type === "Package" && (
                    <div className="w-full pt-1 mt-1 border-t border-gray-100">
                      {renderSellingByBlock(item)}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Summary - Sticky at bottom */}
          <div className="flex-shrink-0 p-4 bg-white border-t border-gray-200 shadow-[0_-4px_10px_rgba(0,0,0,0.03)] pb-24 md:pb-4">
            <div className="flex justify-between items-center mb-2 text-sm text-gray-500 font-semibold">
              <span>Subtotal</span>
              <span>{settings.symbol}{subtotal.toLocaleString("id-ID")}</span>
            </div>
            <div className="flex justify-between items-center mb-4">
              <span className="text-lg font-black text-gray-900">Total Tagihan</span>
              <span className="text-2xl font-black text-blue-900">{settings.symbol}{total.toLocaleString("id-ID")}</span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsParkModalOpen(true)}
                disabled={cart.length === 0}
                className="px-4 py-3 bg-amber-50 text-amber-600 rounded-xl font-bold border border-amber-200 hover:bg-amber-100 disabled:opacity-50 transition-colors flex items-center justify-center"
                title="Park Bill"
              >
                <Save className="w-5 h-5" />
              </button>
              <button
                onClick={handleOpenCheckout}
                disabled={cart.length === 0}
                className="flex-1 py-3 bg-blue-900 text-white rounded-xl font-black text-sm hover:bg-blue-800 disabled:opacity-50 transition-all shadow-md active:scale-[0.98] flex items-center justify-center gap-2"
              >
                <CreditCard className="w-5 h-5" />
                PROSES PEMBAYARAN
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Navigation Bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 text-gray-900 bg-white border-t border-gray-200 flex items-center justify-around h-16 z-50 px-2 shadow-[0_-4px_10px_rgba(0,0,0,0.05)]">
        <button
          onClick={() => setMobileTab("catalog")}
          className={`flex flex-col items-center justify-center w-20 h-full transition-all ${mobileTab === "catalog" ? "text-blue-900 scale-110" : "text-gray-400"}`}
        >
          <LayoutDashboard className="w-5 h-5 mb-1" />
          <span className="text-[10px] font-bold">Catalog</span>
          {mobileTab === "catalog" && (
            <div className="absolute top-0 w-8 h-1 bg-blue-900 rounded-b-full"></div>
          )}
        </button>
        <div className="w-px h-8 bg-gray-100"></div>
        <button
          onClick={() => setMobileTab("cart")}
          className={`flex flex-col items-center justify-center w-20 h-full transition-all relative ${mobileTab === "cart" ? "text-blue-900 scale-110" : "text-gray-400"}`}
        >
          <div className="relative">
            <ShoppingCart className="w-5 h-5 mb-1" />
            {cartItemCount > 0 && (
              <span className="absolute -top-1 -right-2 bg-red-500 text-white text-[8px] font-bold w-4 h-4 rounded-full flex items-center justify-center animate-pulse">
                {cartItemCount}
              </span>
            )}
          </div>
          <span className="text-[10px] font-bold">Cart</span>
          {mobileTab === "cart" && (
            <div className="absolute top-0 w-8 h-1 bg-blue-900 rounded-b-full"></div>
          )}
        </button>
      </div>

      <Modal
        isOpen={isMedicalNotesModalOpen}
        onClose={() => setIsMedicalNotesModalOpen(false)}
        title="🩺 Catatan Rekam Medis"
      >
        <div className="space-y-4">
          <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-lg flex gap-3 items-start">
            <span className="text-xl">💡</span>
            <p className="text-xs text-emerald-800">
              Catatan rekam medis ini akan <b>disimpan menempel langsung ke dalam Bon/Invoice</b>. Cocok untuk mencatat formula warna, alergi, atau catatan khusus pelanggan saat visit ini.
            </p>
          </div>
          <div>
            <label className="text-xs font-bold text-gray-700">Catatan Medis & Treatment</label>
            <textarea
              value={medicalNotes}
              onChange={(e) => setMedicalNotes(e.target.value)}
              placeholder="Contoh: Pelanggan alergi terhadap bleaching tipe X. Formula pewarna rambut: 60% Ash, 40% Blonde dengan developer 20vol..."
              className="w-full mt-1 border border-gray-300 px-3 py-2 rounded-lg text-sm min-h-[120px] resize-y"
              autoFocus
            />
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <button onClick={() => setIsMedicalNotesModalOpen(false)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-200">
              Tutup
            </button>
            <button onClick={() => setIsMedicalNotesModalOpen(false)} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700">
              Simpan Catatan
            </button>
          </div>
        </div>
      </Modal>
      <Modal
        isOpen={isAppointmentsModalOpen}
        onClose={() => setIsAppointmentsModalOpen(false)}
        title="📅 Jadwal Hari Ini"
      >
        <div className="space-y-4">
          {loadingAppointments ? (
            <div className="text-center py-4 text-sm text-gray-500">Memuat jadwal...</div>
          ) : todayAppointments.length === 0 ? (
            <div className="text-center py-4 text-sm text-gray-500">Tidak ada jadwal hari ini.</div>
          ) : (
            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
              {todayAppointments.map((apt: any) => {
                const statusStr = String(apt.status || '').toUpperCase();
                const isCompleted = statusStr === 'COMPLETED';
                const isCancelled = statusStr === 'CANCELLED';
                
                // Color Helper
                let statusColorClass = 'bg-gray-100 text-gray-700';
                if (statusStr === 'COMPLETED') statusColorClass = 'bg-green-100 text-green-700';
                else if (statusStr === 'CONFIRMED') statusColorClass = 'bg-blue-100 text-blue-700';
                else if (statusStr === 'PENDING') statusColorClass = 'bg-orange-100 text-orange-700';
                else if (statusStr === 'CANCELLED') statusColorClass = 'bg-red-100 text-red-700';


                return (
                  <div 
                    key={apt._id} 
                    onClick={() => {
                      if (!isCompleted && !isCancelled) {
                        handleLoadAppointment(apt._id);
                      }
                    }}
                    className={`p-3 border border-gray-200 rounded-lg flex justify-between items-start transition-colors ${(!isCompleted && !isCancelled) ? 'cursor-pointer hover:border-blue-300 hover:bg-blue-50/50' : 'opacity-70'}`}
                  >
                    <div>
                      <div className="font-bold text-gray-800 text-sm flex items-center gap-2">
                        {apt.customer?.name || "Pelanggan Tanpa Nama"}
                        {(!isCompleted && !isCancelled) && (
                          <span className="text-[10px] font-medium px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full flex items-center gap-1">
                            <ShoppingCart className="w-3 h-3" /> Buka di POS
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">Staf: {apt.staff?.name || "-"}</div>
                      <div className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                        Status: <span className={`uppercase text-[10px] px-2 py-0.5 rounded-full font-bold ${statusColorClass}`}>{apt.status}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-blue-600 text-sm">{apt.startTime} - {apt.endTime}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="flex justify-end pt-2">
            <button onClick={() => setIsAppointmentsModalOpen(false)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-200">
              Tutup
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={isReportsModalOpen}
        onClose={() => setIsReportsModalOpen(false)}
        title="📈 Ringkasan Laporan Hari Ini"
      >
        <div className="space-y-4">
          {loadingReport ? (
            <div className="text-center py-4 text-sm text-gray-500">Memuat laporan...</div>
          ) : !todayReport ? (
            <div className="text-center py-4 text-sm text-gray-500">Gagal memuat laporan.</div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-blue-50 border border-blue-100 p-3 rounded-lg">
                <div className="text-xs text-blue-600 font-bold mb-1">Total Penjualan</div>
                <div className="text-lg font-black text-blue-800">
                  {settings.symbol}{(todayReport.sales?.totalSales || 0).toLocaleString("id-ID")}
                </div>
              </div>
              <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-lg">
                <div className="text-xs text-emerald-600 font-bold mb-1">Total Diterima</div>
                <div className="text-lg font-black text-emerald-800">
                  {settings.symbol}{(todayReport.sales?.totalCollected || 0).toLocaleString("id-ID")}
                </div>
              </div>
              <div className="bg-red-50 border border-red-100 p-3 rounded-lg">
                <div className="text-xs text-red-600 font-bold mb-1">Total Pengeluaran</div>
                <div className="text-lg font-black text-red-800">
                  {settings.symbol}{(todayReport.expenses?.totalExpenses || 0).toLocaleString("id-ID")}
                </div>
              </div>
              <div className="bg-purple-50 border border-purple-100 p-3 rounded-lg">
                <div className="text-xs text-purple-600 font-bold mb-1">Laba Bersih</div>
                <div className="text-lg font-black text-purple-800">
                  {settings.symbol}{(todayReport.netProfit || 0).toLocaleString("id-ID")}
                </div>
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => router.push("/reports")} className="px-4 py-2 border border-gray-200 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-50">
              Lihat Detail
            </button>
            <button onClick={() => setIsReportsModalOpen(false)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-200">
              Tutup
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={isManualServiceModalOpen}
        onClose={() => setIsManualServiceModalOpen(false)}
        title="✨ Tambah Layanan Manual"
      >
        <div className="space-y-4">
          <div>
            <label className="text-xs font-bold text-gray-700">Nama Layanan</label>
            <input
              type="text"
              value={manualServiceName}
              onChange={(e) => setManualServiceName(e.target.value)}
              placeholder="Contoh: Potong Poni (Custom)"
              className="w-full mt-1 border border-gray-300 px-3 py-2 rounded-lg text-sm"
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-700">Harga (Rp)</label>
            <input
              type="number"
              value={manualServicePrice}
              onChange={(e) => setManualServicePrice(e.target.value)}
              placeholder="0"
              className="w-full mt-1 border border-gray-300 px-3 py-2 rounded-lg text-sm"
            />
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <button onClick={() => setIsManualServiceModalOpen(false)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-200">
              Batal
            </button>
            <button onClick={handleAddManualService} disabled={!manualServiceName.trim() || !manualServicePrice} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 disabled:opacity-50">
              Tambah ke Keranjang
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={isCustomerModalOpen}
        onClose={() => setIsCustomerModalOpen(false)}
        title="Add New Customer"
      >
        <CustomerForm
          onSuccess={(newCustomer) => {
            setCustomers((prev) => [newCustomer, ...prev]);
            setSelectedCustomer(newCustomer._id);
            setIsCustomerModalOpen(false);
          }}
          onCancel={() => setIsCustomerModalOpen(false)}
        />
      </Modal>

      <Modal
        isOpen={isDealsModalOpen}
        onClose={() => setIsDealsModalOpen(false)}
        title="My Deals"
        size="lg"
      >
        <div className="space-y-3 text-black max-h-[70vh] overflow-y-auto pr-1">
          {!selectedCustomer || selectedCustomer === "walking-customer" ? (
            <p className="text-sm text-gray-500">
              Pilih customer terdaftar dulu untuk melihat paket.
            </p>
          ) : availableDeals.length === 0 ? (
            <p className="text-sm text-gray-500">
              Customer belum punya reward paket aktif.
            </p>
          ) : (
            availableDeals.map((deal, index) => (
              <div
                key={`${deal.customerPackageId}-${deal.serviceId}-${index}`}
                className={`rounded-lg border p-3 ${
                  deal.isUsable 
                    ? "border-amber-200 bg-amber-50" 
                    : "border-gray-200 bg-gray-100 opacity-75"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className={`text-xs font-black uppercase tracking-wide ${deal.isUsable ? "text-amber-900" : "text-gray-700"}`}>
                      {deal.packageCode ? `${deal.packageCode} ` : ""}
                      {deal.serviceName}
                    </p>
                    <p className={`text-xs mt-0.5 ${deal.isUsable ? "text-amber-800" : "text-gray-600"}`}>
                      Reward: {deal.packageName} ({deal.remainingQuota}/
                      {deal.totalQuota})
                    </p>
                    <p className={`text-[11px] mt-0.5 ${deal.isUsable ? "text-amber-700" : "text-gray-500"}`}>
                      Exp:{" "}
                      {deal.expiresAt
                        ? new Date(deal.expiresAt).toLocaleDateString("id-ID")
                        : "Seumur Hidup"}
                    </p>
                  </div>
                  {deal.isUsable ? (
                    <button
                      type="button"
                      onClick={() => addDealToCart(deal)}
                      className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-bold hover:bg-amber-700"
                    >
                      Masuk Cart
                    </button>
                  ) : (
                    <div className="shrink-0 px-3 py-1.5 rounded-lg bg-gray-300 text-gray-600 text-xs font-bold cursor-not-allowed">
                      {deal.statusReason}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </Modal>

      <Modal
        isOpen={referralInfoModal !== null}
        onClose={() => setReferralInfoModal(null)}
        title="🎁 Kode Referral Ditemukan!"
      >
        <div className="space-y-4">
          <div className="flex flex-col items-center justify-center p-4 bg-green-50 border border-green-200 rounded-lg">
            <span className="text-4xl mb-2">✅</span>
            <p className="text-lg font-bold text-green-800 text-center">
              Member VIP Valid
            </p>
            <div className="mt-4 w-full bg-white rounded p-3 shadow-sm border border-green-100 flex flex-col gap-1">
              <div className="flex justify-between">
                <span className="text-gray-500 text-xs">Nama Member</span>
                <span className="font-bold text-gray-900">{referralInfoModal?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 text-xs">No. WhatsApp</span>
                <span className="font-bold text-gray-900">{referralInfoModal?.phone}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setReferralInfoModal(null)}
              className="mt-4 w-full py-2 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg transition-colors"
            >
              Gunakan Diskon Referral
            </button>
          </div>
        </div>
      </Modal>



      {toastMessage && (
        <div className={`fixed bottom-20 md:bottom-6 right-3 md:right-6 z-[70] px-4 py-2 rounded-lg text-white text-xs lg:text-sm font-bold shadow-xl max-w-xs ${toastType === "warning" ? "bg-amber-500" : "bg-emerald-600"
          }`}>
          {toastMessage}
        </div>
      )}
      {/* Modal Checkout */}
      <Modal isOpen={isCheckoutModalOpen} onClose={() => setIsCheckoutModalOpen(false)} title="Checkout & Pembayaran" size="xl">
        <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-2 pb-10">
          {/* List of Cart Items is now handled in the Sidebar */}          <div className="space-y-3 pt-3 border-t-2 border-dashed border-gray-300">
            <h3 className="font-black text-gray-800 text-sm border-b pb-1">Global Discount & Voucher</h3>
            
            <div className="flex justify-between text-gray-600 items-center">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold">Discount Tagihan</span>
                <select
                  value={discountType}
                  onChange={(e) => setDiscountType(e.target.value as "nominal" | "percentage")}
                  className="bg-white text-xs font-bold text-blue-900 border border-gray-300 rounded px-1.5 py-1 focus:ring-1 focus:ring-blue-900 outline-none"
                >
                  <option value="nominal">{settings.symbol}</option>
                  <option value="percentage">%</option>
                </select>
              </div>
              <DebouncedNumberInput
                value={discount}
                onChange={(val: number) => setDiscount(val)}
                className="w-24 text-right text-sm text-gray-900 border border-gray-300 rounded px-2 py-1 focus:ring-1 focus:ring-blue-900 outline-none bg-white font-bold"
                min="0"
              />
            </div>
            {discount > 0 && (
              <input
                type="text"
                value={discountReason}
                onChange={(e) => setDiscountReason(e.target.value)}
                placeholder="Alasan Diskon (Wajib)"
                className="w-full text-xs text-gray-900 border border-red-300 focus:ring-red-500 rounded px-2 py-1.5 outline-none bg-white"
              />
            )}
            
            {/* Voucher & Loyalty here if needed */}
          </div>

          {(settings.acquisitionSources?.length ?? 0) > 0 && (
            <div className="space-y-2 pt-3 border-t-2 border-dashed border-gray-300">
              <h3 className="font-black text-gray-800 text-sm border-b pb-1">
                Mengetahui Dari <span className="text-red-500">*</span>
              </h3>
              <select
                value={acquisitionSource}
                onChange={(e) => setAcquisitionSource(e.target.value)}
                className={`w-full text-xs font-bold border rounded px-2 py-2 focus:ring-1 outline-none ${acquisitionSource ? "border-gray-300 focus:ring-blue-900" : "border-red-300 focus:ring-red-500"}`}
              >
                <option value="" disabled>Pilih sumber... (Wajib)</option>
                {(settings.acquisitionSources || []).map((src) => (
                  <option key={src} value={src}>{src}</option>
                ))}
              </select>
              {!acquisitionSource && (
                <p className="text-[10px] text-red-500 font-semibold">Wajib dipilih sebelum menyelesaikan transaksi.</p>
              )}
            </div>
          )}

          <div className="space-y-3 pt-3 border-t-2 border-dashed border-gray-300">
            <h3 className="font-black text-gray-800 text-sm border-b pb-1">Payment Method</h3>
            
            <div className="space-y-2">
              {splitPayments.map((payment, index) => (
                <div key={index} className="flex items-center gap-2">
                  <select
                    value={payment.method}
                    onChange={(e) => updateSplitMethod(index, e.target.value)}
                    className="flex-1 text-xs font-bold border border-gray-300 rounded px-2 py-2 focus:ring-1 focus:ring-blue-900 outline-none"
                  >
                    <option value="" disabled>Pilih Metode...</option>
                    {["Cash", "Transfer", "Debit", "Credit Card", "QRIS", ...(selectedCustomer && selectedCustomer !== 'walking-customer' && customerWalletBalance > 0 && maxWalletPaymentAllowed > 0 ? ["Wallet"] : [])].map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                  <DebouncedNumberInput
                    value={payment.amount}
                    onChange={(val: number) => updateSplitAmount(index, val.toString())}
                    className="w-32 text-right text-sm font-black border border-gray-300 rounded px-2 py-2 focus:ring-1 focus:ring-blue-900 outline-none"
                  />
                  {splitPayments.length > 1 && (
                    <button type="button" onClick={() => removeSplitPayment(index)} className="p-2 text-red-500 bg-red-50 rounded hover:bg-red-100">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              <div className="flex gap-2">
                <button type="button" onClick={addSplitPayment} className="text-xs font-bold text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-200">
                  + Split Payment
                </button>
                <button type="button" onClick={() => {
                  if (splitPayments.length > 0) {
                    const lastIdx = splitPayments.length - 1;
                    const paidBeforeLast = splitPayments.slice(0, lastIdx).reduce((sum, p) => sum + (parseFloat(String(p.amount || "0")) || 0), 0);
                    const remainder = Math.max(0, total - paidBeforeLast);
                    updateSplitAmount(lastIdx, remainder.toString());
                  } else {
                    setSplitPayments([{ method: "Cash", amount: total.toString() }]);
                  }
                }} className="text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200">
                  Isi Pas Tagihan
                </button>
              </div>
            </div>
          </div>

          <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex justify-between items-center mt-4">
            <div>
              <p className="text-xs font-bold text-blue-900">Total Dibayar</p>
              <p className="text-lg font-black text-blue-900">{settings.symbol}{totalSplitPaidComputed.toLocaleString("id-ID")}</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-bold text-gray-600">Tagihan</p>
              <p className="text-lg font-black text-gray-900">{settings.symbol}{total.toLocaleString("id-ID")}</p>
            </div>
          </div>
          
          <div className="pt-4 flex gap-3">
            <button type="button" onClick={() => setIsCheckoutModalOpen(false)} className="flex-1 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200">
              Batal
            </button>
            <FormButton
              onClick={() => void handleCheckout(true)}
              loading={submitting}
              disabled={hasInvalidSplitInCart || cart.length === 0 || !splitPayments.some(p => !!p.method) || (discount > 0 && !discountReason.trim()) || ((settings.acquisitionSources?.length ?? 0) > 0 && !acquisitionSource) || totalSplitPaidComputed < total}
              variant="success"
              className="flex-[2] py-3 text-sm font-black uppercase tracking-widest shadow-lg rounded-xl"
              icon={<CreditCard className="w-5 h-5" />}
            >
              Complete Order
            </FormButton>
          </div>
        </div>
      </Modal>

      <Modal isOpen={isParkModalOpen} onClose={() => setIsParkModalOpen(false)} title="Simpan Keranjang (Park Bill)">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Simpan keranjang ini sementara agar bisa dipanggil lagi nanti tanpa kehilangan data.</p>
          <div>
            <label className="text-xs font-bold text-gray-700">Nama Referensi (Misal: Nama Pelanggan / Nomor Antrean)</label>
            <input
              type="text"
              value={parkBillName}
              onChange={(e) => setParkBillName(e.target.value)}
              placeholder="Contoh: Budi - Potong Rambut"
              className="w-full mt-1 border border-gray-300 px-3 py-2 rounded-lg text-sm"
              autoFocus
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setIsParkModalOpen(false)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-200">
              Batal
            </button>
            <button onClick={saveParkedBill} disabled={!parkBillName.trim()} className="px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-bold hover:bg-amber-600 disabled:opacity-50">
              Simpan
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal Daftar Parked Bills */}
      <Modal isOpen={isParkedListOpen} onClose={() => setIsParkedListOpen(false)} title="Daftar Bon Tersimpan">
        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          {parkedBills.length === 0 ? (
            <div className="text-center text-gray-500 text-sm py-8 flex flex-col items-center">
              <Package className="w-8 h-8 text-gray-300 mb-2" />
              Belum ada bon yang disimpan
            </div>
          ) : (
            parkedBills.map((bill) => (
              <div key={bill.id} className="p-3 border border-gray-200 rounded-lg hover:border-amber-300 transition-colors flex items-center justify-between group">
                <div>
                  <h4 className="font-bold text-gray-800 text-sm">{bill.name}</h4>
                  <div className="text-xs text-gray-500 flex gap-2 mt-1">
                    <span>🕒 {bill.date}</span>
                    <span>•</span>
                    <span>🛒 {bill.cart.length} item</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => restoreParkedBill(bill)}
                    className="px-3 py-1.5 bg-blue-900 text-white rounded-lg text-xs font-bold hover:bg-blue-800"
                  >
                    Panggil
                  </button>
                  <button
                    onClick={() => deleteParkedBill(bill.id)}
                    className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg opacity-50 group-hover:opacity-100 transition-opacity"
                    title="Hapus"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </Modal>
    </div>
  );
}