"use client";


import { useParams } from "next/navigation";
import { useState, useEffect } from "react";
import { Save, Store, Mail, Phone, MapPin, DollarSign, Percent, Image as ImageIcon, Globe, FileText, Clock, CreditCard, MessageSquare, Send, Bell, Sparkles, Trash2, RefreshCw, Gift, Crown, BarChart3, Calendar } from "lucide-react";
import FormInput, { FormSelect, FormButton } from "@/components/dashboard/FormInput";
import SearchableSelect from "@/components/dashboard/SearchableSelect";
import { getAllCurrencies } from "@/lib/currency";
import { getAllTimezones } from "@/lib/timezones";
import PermissionGate from "@/components/PermissionGate";
import { useSettings } from "@/components/providers/SettingsProvider";

interface Settings {
    storeName: string;
    address: string;
    phone: string;
    email: string;
    website: string;
    taxId: string;
    currency: string;
    timezone: string;
    taxRate: number;
    logoUrl: string;
    businessHours: string;
    receiptFooter: string;
    receiptQrType?: string;
    customReceiptQrLink?: string;
    showStaffOnReceipt: boolean;
    showTaxAndTaxableAmountOnReceipt: boolean;
    showCommissionInPOS: boolean;
    walletBonusTiers: { minAmount: number; bonusPercent: number }[];
    walletIncludedServices: string[];
    walletIncludedProducts: string[];
    walletIncludedBundles: string[];
    walletExpiryDays: number;
    financialReportSections: {
        totalSales: boolean;
        totalCollected: boolean;
        purchases: boolean;
        expenses: boolean;
        payroll: boolean;
        walletTopups: boolean;
        netProfit: boolean;
        cashFlow: boolean;
    };
    allowStaffDoubleBooking: boolean;
    stockAdjustmentPassword?: string;
    bankTransferPassword?: string;
    ownerTransferPassword?: string;
    termsAndConditions: string;

    // Premium Membership
    membershipPrice: number;
    membershipDurationDays: number;
    birthdayVoucherId: string;
    memberDiscountType: "percentage" | "nominal";
    memberDiscountValue: number;
    memberIncludedServices: string[];
    memberIncludedProducts: string[];
    memberIncludedBundles: string[];

    // Loyalty & Referral
    loyaltyPointPerSpend: number;
    loyaltyPointValue: number;
    referralRewardPoints: number;
    referralDiscountType: "percentage" | "nominal";
    referralDiscountValue: number;

    // WhatsApp Settings (Fonnte)
    fonnteToken: string;
    waBlastNumber: string;
    waAdminNumber: string;
    waOwnerNumber: string;
    // WA Provider (lib/waProvider.ts)
    waProvider: "fonnte" | "balesotomatis";
    balesotomatisMode: "unofficial" | "waba";
    balesotomatisApiKey: string;
    balesotomatisNumberId: string;
    balesotomatisSecretKey: string;
    balesotomatisLicensesKey: string;
    greetingEnabled: boolean;
    membershipExpiryReminderDays: number;
    packageExpiryReminderDays: number;
    dailyReportTime: string;
    waMembershipReminderTime: string;
    waPackageReminderTime: string;
    waStockAlertTime: string;
    waBirthdayNotifTime: string;
    waTemplateStockAlert: string;
    waTemplateDailyReport: string;
    waTemplateMembershipExpiry: string;
    waTemplatePackageExpiry: string;
    waOperationalHoursStart: number;
    waOperationalHoursEnd: number;
    fonnteMaxDailyMessages: number;
    fonnteDeviceRegisteredAt: string;
    
    // Fitur 5: WA Appointment Reminder & Fitur 6: WA Nota
    waAppointmentReminderEnabled: boolean;
    waAppointmentReminderMinutesBefore: number;
    waAppointmentReminderDefaultTemplate: string;
    waNotaTemplate: string;
    waAdminNotaPrefix: string;

    // SMS Settings
    smsEnabled: boolean;
    twilioAccountSid: string;
    twilioAuthToken: string;
    twilioPhoneNumber: string;
    // Email Settings
    emailEnabled: boolean;
    smtpHost: string;
    smtpPort: number;
    smtpSecure: boolean;
    smtpUser: string;
    smtpPassword: string;
    smtpFrom: string;
    // Reminder Settings
    reminderDaysBefore: number;
    reminderMethod: string;
    // AI Settings
    aiEnabled: boolean;
    openaiApiKey: string;
    openaiModel: string;
}

interface GreetingLogItem {
    _id: string;
    phoneRaw: string;
    phoneNormalized: string;
    greetingSentAt?: string;
    createdAt?: string;
}

export default function SettingsPage() {
  const params = useParams();
  const slug = params.slug as string;
    const { refreshSettings } = useSettings();
    const [settings, setSettings] = useState<Settings>({
        storeName: "",
        address: "",
        phone: "",
        email: "",
        website: "",
        taxId: "",
        currency: "IDR",
        timezone: "Asia/Jakarta",
        taxRate: 0,
        logoUrl: "",
        businessHours: "Mon-Fri: 9:00 AM - 6:00 PM",
        receiptFooter: "Thank you for your business!",
        receiptQrType: "digital_receipt",
        customReceiptQrLink: "",
        showStaffOnReceipt: true,
        showTaxAndTaxableAmountOnReceipt: true,
        showCommissionInPOS: false,
        walletBonusTiers: [],
        walletIncludedServices: [],
        walletIncludedProducts: [],
        walletIncludedBundles: [],
        walletExpiryDays: 0,
        financialReportSections: {
            totalSales: true,
            totalCollected: true,
            purchases: true,
            expenses: true,
            payroll: false,
            walletTopups: false,
            netProfit: true,
            cashFlow: true,
        },
        allowStaffDoubleBooking: false,
        stockAdjustmentPassword: "",
        bankTransferPassword: "",
        ownerTransferPassword: "",
        termsAndConditions: "",
        membershipPrice: 0,
        membershipDurationDays: 365,
        birthdayVoucherId: "",
        memberDiscountType: "percentage",
        memberDiscountValue: 0,
        memberIncludedServices: [],
        memberIncludedProducts: [],
        memberIncludedBundles: [],
        loyaltyPointPerSpend: 0,
        loyaltyPointValue: 0,
        referralRewardPoints: 0,
        referralDiscountType: "nominal",
        referralDiscountValue: 0,
        // WhatsApp Settings
        fonnteToken: "",
        waBlastNumber: "",
        waAdminNumber: "",
        waOwnerNumber: "",
        waProvider: "balesotomatis",
        balesotomatisMode: "unofficial",
        balesotomatisApiKey: "",
        balesotomatisNumberId: "",
        balesotomatisSecretKey: "",
        balesotomatisLicensesKey: "",
        greetingEnabled: true,
        membershipExpiryReminderDays: 30,
        packageExpiryReminderDays: 30,
        dailyReportTime: "21:00",
        waMembershipReminderTime: "09:00",
        waPackageReminderTime: "09:30",
        waStockAlertTime: "08:00",
        waBirthdayNotifTime: "08:00",
        waTemplateStockAlert: "",
        waTemplateDailyReport: "",
        waTemplateMembershipExpiry: "",
        waTemplatePackageExpiry: "",
        waOperationalHoursStart: 8,
        waOperationalHoursEnd: 20,
        fonnteMaxDailyMessages: 0,
        fonnteDeviceRegisteredAt: "",
        waAppointmentReminderEnabled: false,
        waAppointmentReminderMinutesBefore: 120,
        waAppointmentReminderDefaultTemplate: "Halo {customer_name}, ini adalah pengingat appointment Anda di {store_name} untuk layanan {service_name} bersama {staff_name} pada {appointment_date} pukul {appointment_time}. Silakan datang tepat waktu.",
        waNotaTemplate: "Halo {customer_name}, terima kasih telah berkunjung ke {store_name}. Berikut adalah nota transaksi Anda: {invoice_number} sebesar {total_amount}.",
        waAdminNotaPrefix: "[NOTIFIKASI ADMIN]",
        // SMS Settings
        smsEnabled: false,
        twilioAccountSid: "",
        twilioAuthToken: "",
        twilioPhoneNumber: "",
        // Email Settings
        emailEnabled: false,
        smtpHost: "",
        smtpPort: 587,
        smtpSecure: false,
        smtpUser: "",
        smtpPassword: "",
        smtpFrom: "",
        // Reminder Settings
        reminderDaysBefore: 1,
        reminderMethod: "both",
        // AI Settings
        aiEnabled: false,
        openaiApiKey: "",
        openaiModel: "gpt-4o",
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState({ type: "", text: "" });
    const [waPushLoading, setWaPushLoading] = useState(false);
    const [testingWaConnection, setTestingWaConnection] = useState(false);
    const [waConnectionTestResult, setWaConnectionTestResult] = useState<{ success: boolean; message: string; devices?: any[] } | null>(null);
    const [waPushResult, setWaPushResult] = useState<{ total: number; sent: number; failed: number } | null>(null);
    const [greetingPhone, setGreetingPhone] = useState("");
    const [deletingGreeting, setDeletingGreeting] = useState(false);
    const [deletingAllGreeting, setDeletingAllGreeting] = useState(false);
    const [greetingLogs, setGreetingLogs] = useState<GreetingLogItem[]>([]);
    const [greetingLogTotal, setGreetingLogTotal] = useState(0);
    const [loadingGreetingLogs, setLoadingGreetingLogs] = useState(false);

    // Options for Wallet Included Items
    const [servicesOptions, setServicesOptions] = useState<{ _id: string; name: string; category?: any }[]>([]);
    const [productsOptions, setProductsOptions] = useState<{ _id: string; name: string }[]>([]);
    const [bundlesOptions, setBundlesOptions] = useState<{ _id: string; name: string }[]>([]);
    const [vouchersOptions, setVouchersOptions] = useState<{ _id: string; code: string; description: string }[]>([]);

    const currencies = getAllCurrencies();
    const timezones = getAllTimezones();

    useEffect(() => {
        fetchSettings();
        fetchGreetingLogs();
        fetchOptions();
    }, []);

    const fetchOptions = async () => {
        try {
            const [resS, resP, resB, resV] = await Promise.all([
                fetch('/api/services?limit=1000', { headers: { "x-store-slug": slug } }),
                fetch('/api/products?limit=1000', { headers: { "x-store-slug": slug } }),
                fetch('/api/service-bundles?limit=1000', { headers: { "x-store-slug": slug } }),
                fetch('/api/vouchers?limit=999')
            ]);
            const [dataS, dataP, dataB, dataV] = await Promise.all([resS.json(), resP.json(), resB.json(), resV.json()]);
            if (dataS.success) setServicesOptions(dataS.data);
            if (dataP.success) setProductsOptions(dataP.data);
            if (dataB.success) setBundlesOptions(dataB.data);
            if (dataV.success) setVouchersOptions((dataV.data || []).filter((v: any) => v.isActive));
        } catch (error) {
            console.error('Error fetching options:', error);
        }
    };

    const fetchGreetingLogs = async () => {
        setLoadingGreetingLogs(true);
        try {
            const res = await fetch('/api/wa/greeting-logs', { headers: { "x-store-slug": slug } });
            const data = await res.json();
            if (!data.success) return;

            setGreetingLogTotal(data.data?.total || 0);
            setGreetingLogs(data.data?.items || []);
        } catch (error) {
            console.error('Error fetching greeting logs:', error);
        } finally {
            setLoadingGreetingLogs(false);
        }
    };

    const fetchSettings = async () => {
        try {
            const res = await fetch("/api/settings", { headers: { "x-store-slug": slug } });
            const data = await res.json();
            if (data.success) {
                // Merge fetched data with defaults to ensure all fields exist
                setSettings({
                    storeName: data.data.storeName || "",
                    address: data.data.address || "",
                    phone: data.data.phone || "",
                    email: data.data.email || "",
                    website: data.data.website || "",
                    taxId: data.data.taxId || "",
                    currency: data.data.currency || "IDR",
                    timezone: data.data.timezone || "Asia/Jakarta",
                    taxRate: data.data.taxRate || 0,
                    logoUrl: data.data.logoUrl || "",
                    businessHours: data.data.businessHours || "Mon-Fri: 9:00 AM - 6:00 PM",
                    receiptFooter: data.data.receiptFooter || 'Thank you for your business!',
                    receiptQrType: data.data.receiptQrType || 'digital_receipt',
                    customReceiptQrLink: data.data.customReceiptQrLink || '',
                    showStaffOnReceipt: data.data.showStaffOnReceipt !== false,
                    showTaxAndTaxableAmountOnReceipt: data.data.showTaxAndTaxableAmountOnReceipt !== false,
                    showCommissionInPOS: data.data.showCommissionInPOS || false,
                    walletBonusTiers: data.data.walletBonusTiers || [],
                    walletIncludedServices: data.data.walletIncludedServices || [],
                    walletIncludedProducts: data.data.walletIncludedProducts || [],
                    walletIncludedBundles: data.data.walletIncludedBundles || [],
                    walletExpiryDays: data.data.walletExpiryDays || 0,
                    financialReportSections: data.data.financialReportSections || {
                        totalSales: true,
                        totalCollected: true,
                        purchases: true,
                        expenses: true,
                        payroll: false,
                        walletTopups: false,
                        netProfit: true,
                        cashFlow: true
                    },
                    allowStaffDoubleBooking: data.data.allowStaffDoubleBooking || false,
                    stockAdjustmentPassword: data.data.stockAdjustmentPassword || "",
                    bankTransferPassword: data.data.bankTransferPassword || "",
                    ownerTransferPassword: data.data.ownerTransferPassword || "",
                    termsAndConditions: data.data.termsAndConditions || "",
                    loyaltyPointPerSpend: data.data.loyaltyPointPerSpend || 0,
                    loyaltyPointValue: data.data.loyaltyPointValue || 0,
                    referralRewardPoints: data.data.referralRewardPoints || 0,
                    referralDiscountType: data.data.referralDiscountType || "nominal",
                    referralDiscountValue: data.data.referralDiscountValue || 0,
                    membershipPrice: data.data.membershipPrice || 0,
                    membershipDurationDays: data.data.membershipDurationDays || 365,
                    birthdayVoucherId: data.data.birthdayVoucherId || "",
                    memberDiscountType: data.data.memberDiscountType || "percentage",
                    memberDiscountValue: data.data.memberDiscountValue || 0,
                    memberIncludedServices: data.data.memberIncludedServices || [],
                    memberIncludedProducts: data.data.memberIncludedProducts || [],
                    memberIncludedBundles: data.data.memberIncludedBundles || [],

                    // WhatsApp Settings
                    fonnteToken: data.data.fonnteToken || "",
                    waBlastNumber: data.data.waBlastNumber || "",
                    waAdminNumber: data.data.waAdminNumber || "",
                    waOwnerNumber: data.data.waOwnerNumber || "",
                    waProvider: data.data.waProvider || "fonnte",
                    balesotomatisMode: data.data.balesotomatisMode || "unofficial",
                    balesotomatisApiKey: data.data.balesotomatisApiKey || "",
                    balesotomatisNumberId: data.data.balesotomatisNumberId || "",
                    balesotomatisSecretKey: data.data.balesotomatisSecretKey || "",
                    balesotomatisLicensesKey: data.data.balesotomatisLicensesKey || "",
                    greetingEnabled: data.data.greetingEnabled ?? true,
                    membershipExpiryReminderDays: data.data.membershipExpiryReminderDays || 30,
                    packageExpiryReminderDays: data.data.packageExpiryReminderDays || 30,
                    dailyReportTime: data.data.dailyReportTime || "21:00",
                    waMembershipReminderTime: data.data.waMembershipReminderTime || "09:00",
                    waPackageReminderTime: data.data.waPackageReminderTime || "09:30",
                    waStockAlertTime: data.data.waStockAlertTime || "08:00",
                    waBirthdayNotifTime: data.data.waBirthdayNotifTime || "08:00",
                    waTemplateStockAlert: data.data.waTemplateStockAlert || "",
                    waTemplateDailyReport: data.data.waTemplateDailyReport || "",
                    waTemplateMembershipExpiry: data.data.waTemplateMembershipExpiry || "",
                    waTemplatePackageExpiry: data.data.waTemplatePackageExpiry || "",
                    waOperationalHoursStart: data.data.waOperationalHoursStart ?? 8,
                    waOperationalHoursEnd: data.data.waOperationalHoursEnd ?? 20,
                    fonnteMaxDailyMessages: data.data.fonnteMaxDailyMessages || 0,
                    fonnteDeviceRegisteredAt: data.data.fonnteDeviceRegisteredAt || "",
                    waAppointmentReminderEnabled: data.data.waAppointmentReminderEnabled ?? false,
                    waAppointmentReminderMinutesBefore: data.data.waAppointmentReminderMinutesBefore || 120,
                    waAppointmentReminderDefaultTemplate: data.data.waAppointmentReminderDefaultTemplate || "Halo {customer_name}, ini adalah pengingat appointment Anda di {store_name} untuk layanan {service_name} bersama {staff_name} pada {appointment_date} pukul {appointment_time}. Silakan datang tepat waktu.",
                    waNotaTemplate: data.data.waNotaTemplate || "Halo {customer_name}, terima kasih telah berkunjung ke {store_name}. Berikut adalah nota transaksi Anda: {invoice_number} sebesar {total_amount}.",
                    waAdminNotaPrefix: data.data.waAdminNotaPrefix || "[NOTIFIKASI ADMIN]",
                    // SMS Settings
                    smsEnabled: data.data.smsEnabled || false,
                    twilioAccountSid: data.data.twilioAccountSid || "",
                    twilioAuthToken: data.data.twilioAuthToken || "",
                    twilioPhoneNumber: data.data.twilioPhoneNumber || "",
                    // Email Settings
                    emailEnabled: data.data.emailEnabled || false,
                    smtpHost: data.data.smtpHost || "",
                    smtpPort: data.data.smtpPort || 587,
                    smtpSecure: data.data.smtpSecure || false,
                    smtpUser: data.data.smtpUser || "",
                    smtpPassword: data.data.smtpPassword || "",
                    smtpFrom: data.data.smtpFrom || "",
                    // Reminder Settings
                    reminderDaysBefore: data.data.reminderDaysBefore || 1,
                    reminderMethod: data.data.reminderMethod || "both",
                    // AI Settings
                    aiEnabled: data.data.aiEnabled || false,
                    openaiApiKey: data.data.openaiApiKey || "",
                    openaiModel: data.data.openaiModel || "gpt-4o",
                });
            }
        } catch (error) {
            console.error("Error fetching settings:", error);
            setMessage({ type: "error", text: "Failed to load settings" });
        } finally {
            setLoading(false);
        }
    };



    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setMessage({ type: "", text: "" });

        try {
            const res = await fetch("/api/settings", {
                method: "PUT",
                headers: { "x-store-slug": slug, "Content-Type": "application/json" },
                body: JSON.stringify(settings),
            });
            const data = await res.json();
            if (data.success) {
                setSettings(prev => ({ ...prev, ...data.data }));
                await refreshSettings();
                setMessage({ type: "success", text: "Settings saved successfully!" });
            } else {
                setMessage({ type: "error", text: data.error || "Failed to save settings" });
            }
        } catch (error) {
            console.error("Error saving settings:", error);
            setMessage({ type: "error", text: "Failed to save settings" });
        } finally {
            setSaving(false);
        }
    };

    const handleTestWaPush = async () => {
        setWaPushLoading(true);
        setWaPushResult(null);

        try {
            const res = await fetch("/api/wa/trigger", { headers: { "x-store-slug": slug }, method: "POST", });
            const data = await res.json();

            if (!data.success) {
                setMessage({ type: "error", text: data.error || "Failed to trigger WhatsApp push" });
                return;
            }

            setWaPushResult(data.data || { total: 0, sent: 0, failed: 0 });
            setMessage({ type: "success", text: "WhatsApp push test executed successfully" });
        } catch (error) {
            console.error("Error triggering WhatsApp push test:", error);
            setMessage({ type: "error", text: "Failed to trigger WhatsApp push test" });
        } finally {
            setWaPushLoading(false);
        }
    };

    const handleTestWaConnection = async () => {
        setTestingWaConnection(true);
        setWaConnectionTestResult(null);

        try {
            const payload =
                settings.balesotomatisMode === "waba"
                    ? { mode: "waba", secretKey: settings.balesotomatisSecretKey, licensesKey: settings.balesotomatisLicensesKey }
                    : { mode: "unofficial", apiKey: settings.balesotomatisApiKey };

            const res = await fetch("/api/settings/wa-provider/test-connection", {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-store-slug": slug },
                body: JSON.stringify(payload),
            });
            const data = await res.json();

            if (!data.success) {
                setWaConnectionTestResult({ success: false, message: data.error || "Koneksi gagal" });
                return;
            }

            if (settings.balesotomatisMode === "unofficial") {
                const devices = data.devices || [];
                const connected = devices.filter((d: any) => d.state_connection === "connected");
                setWaConnectionTestResult({
                    success: true,
                    message: connected.length > 0
                        ? `Terhubung. ${connected.length} device aktif.`
                        : "API key valid, tapi belum ada nomor yang di-scan QR.",
                    devices,
                });
            } else {
                setWaConnectionTestResult({ success: true, message: data.message || "Koneksi WABA berhasil." });
            }
        } catch (error) {
            console.error("Error testing WA connection:", error);
            setWaConnectionTestResult({ success: false, message: "Gagal menghubungi server." });
        } finally {
            setTestingWaConnection(false);
        }
    };

    const handleDeleteGreetingLog = async (phoneArg?: string) => {
        const phoneToDelete = String(phoneArg || greetingPhone).trim();

        if (!phoneToDelete) {
            setMessage({ type: "error", text: "Masukkan nomor terlebih dahulu" });
            return;
        }

        setDeletingGreeting(true);
        try {
            const res = await fetch("/api/wa/greeting-logs", {
                method: "DELETE",
                headers: { "x-store-slug": slug, "Content-Type": "application/json" },
                body: JSON.stringify({ phone: phoneToDelete }),
            });
            const data = await res.json();

            if (!data.success) {
                setMessage({ type: "error", text: data.error || "Gagal menghapus greeting log" });
                return;
            }

            setMessage({ type: "success", text: `${data.message} (${data.data?.phone || phoneToDelete})` });
            setGreetingPhone("");
            await fetchGreetingLogs();
        } catch (error) {
            console.error("Error deleting greeting log:", error);
            setMessage({ type: "error", text: "Gagal menghapus greeting log" });
        } finally {
            setDeletingGreeting(false);
        }
    };

    const handleDeleteAllGreetingLogs = async () => {
        if (!confirm("Hapus SEMUA greeting log? Aksi ini tidak bisa dibatalkan.")) return;

        setDeletingAllGreeting(true);
        try {
            const res = await fetch("/api/wa/greeting-logs", {
                method: "DELETE",
                headers: { "x-store-slug": slug, "Content-Type": "application/json" },
                body: JSON.stringify({ clearAll: true }),
            });
            const data = await res.json();

            if (!data.success) {
                setMessage({ type: "error", text: data.error || "Gagal menghapus semua greeting log" });
                return;
            }

            setMessage({ type: "success", text: `${data.message}. Total dihapus: ${data.data?.deletedCount || 0}` });
            await fetchGreetingLogs();
        } catch (error) {
            console.error("Error deleting all greeting logs:", error);
            setMessage({ type: "error", text: "Gagal menghapus semua greeting log" });
        } finally {
            setDeletingAllGreeting(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-900 border-t-transparent"></div>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto p-6">
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-gray-900">Store Settings</h1>
                <p className="text-gray-500">Manage your store details and configuration</p>
            </div>

            {message.text && (
                <div className={`p-4 rounded-lg mb-6 ${message.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
                    {message.text}
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
                {/* General Information */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <Store className="w-5 h-5 text-blue-900" />
                        General Information
                    </h2>
                    <div className="grid grid-cols-1 gap-6">
                        <FormInput
                            label="Store Name"
                            value={settings.storeName}
                            onChange={(e) => setSettings({ ...settings, storeName: e.target.value })}
                            required
                            placeholder="e.g. SalonNext"
                        />
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Store Logo
                            </label>
                            <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                        const reader = new FileReader();
                                        reader.onloadend = () => {
                                            setSettings({ ...settings, logoUrl: reader.result as string });
                                        };
                                        reader.readAsDataURL(file);
                                    }
                                }}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-900 focus:border-transparent file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                            />
                        </div>
                        {settings.logoUrl && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Logo Preview</label>
                                <div className="flex items-center gap-4">
                                    <img src={settings.logoUrl} alt="Store Logo" className="h-20 object-contain border rounded p-2" />
                                    <button
                                        type="button"
                                        onClick={() => setSettings({ ...settings, logoUrl: "" })}
                                        className="text-sm text-red-600 hover:text-red-700"
                                    >
                                        Remove Logo
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Contact Details */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <Phone className="w-5 h-5 text-blue-900" />
                        Contact Details
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <FormInput
                            label="Phone Number"
                            value={settings.phone}
                            onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
                            placeholder="+1 234 567 890"
                        />
                        <FormInput
                            label="Email Address"
                            value={settings.email}
                            onChange={(e) => setSettings({ ...settings, email: e.target.value })}
                            type="email"
                            placeholder="contact@store.com"
                        />
                        <FormInput
                            label="Website"
                            value={settings.website}
                            onChange={(e) => setSettings({ ...settings, website: e.target.value })}
                            placeholder="https://www.yourstore.com"
                        />
                        <FormInput
                            label="Business Hours"
                            value={settings.businessHours}
                            onChange={(e) => setSettings({ ...settings, businessHours: e.target.value })}
                            placeholder="Mon-Fri: 9:00 AM - 6:00 PM"
                        />
                        <div className="md:col-span-2">
                            <FormInput
                                label="Address"
                                value={settings.address}
                                onChange={(e) => setSettings({ ...settings, address: e.target.value })}
                                placeholder="123 Main St, City, Country"
                            />
                        </div>
                    </div>
                </div>

                {/* Business Information */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <FileText className="w-5 h-5 text-blue-900" />
                        Business Information
                    </h2>
                    <div className="grid grid-cols-1 gap-6">
                        <FormInput
                            label="Tax ID / Registration Number"
                            value={settings.taxId}
                            onChange={(e) => setSettings({ ...settings, taxId: e.target.value })}
                            placeholder="e.g. 123-456-789"
                        />
                    </div>
                </div>

                {/* Receipt Settings */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <FileText className="w-5 h-5 text-blue-900" />
                        Receipt / Nota Settings
                    </h2>
                    <div className="space-y-4">
                        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-200">
                            <div>
                                <p className="text-sm font-bold text-gray-900">Tampilkan "Served By" di Nota</p>
                                <p className="text-xs text-gray-500 mt-0.5">Menampilkan nama staff yang melayani di struk cetak</p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={settings.showStaffOnReceipt}
                                    onChange={(e) => setSettings({ ...settings, showStaffOnReceipt: e.target.checked })}
                                    className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-600 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
                            </label>
                        </div>
                        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-200">
                            <div>
                                <p className="text-sm font-bold text-gray-900">Tampilkan Taxable Amount & GST di Nota</p>
                                <p className="text-xs text-gray-500 mt-0.5">Menampilkan baris rincian perhitungan pajak pada struk cetak</p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={settings.showTaxAndTaxableAmountOnReceipt}
                                    onChange={(e) => setSettings({ ...settings, showTaxAndTaxableAmountOnReceipt: e.target.checked })}
                                    className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-600 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
                            </label>
                        </div>
                        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-200">
                            <div>
                                <p className="text-sm font-bold text-gray-900">Tampilkan Komisi di POS</p>
                                <p className="text-xs text-gray-500 mt-0.5">Menampilkan informasi perhitungan komisi staff di halaman Kasir</p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={settings.showCommissionInPOS}
                                    onChange={(e) => setSettings({ ...settings, showCommissionInPOS: e.target.checked })}
                                    className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-600 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
                            </label>
                        </div>
                        
                        <div className="flex flex-col p-4 bg-gray-50 rounded-xl border border-gray-200">
                            <p className="text-sm font-bold text-gray-900 mb-1">Receipt Footer Note</p>
                            <p className="text-xs text-gray-500 mb-3">Teks tambahan di bagian bawah nota (contoh: "Barang yang sudah dibeli tidak dapat ditukar", atau "Info promo cek IG: @salonnext")</p>
                            <textarea 
                                className="w-full p-2 border border-gray-300 rounded-lg text-sm"
                                rows={3}
                                value={settings.receiptFooter || ''}
                                onChange={(e) => setSettings({...settings, receiptFooter: e.target.value})}
                                placeholder="Thank you for your business!"
                            />
                        </div>

                        <div className="flex flex-col p-4 bg-gray-50 rounded-xl border border-gray-200">
                            <p className="text-sm font-bold text-gray-900 mb-1">QR Code di Nota</p>
                            <p className="text-xs text-gray-500 mb-3">Pilih tipe QR code yang ingin dicetak pada nota thermal.</p>
                            <select 
                                className="w-full p-2 border border-gray-300 rounded-lg text-sm mb-3"
                                value={settings.receiptQrType || 'digital_receipt'}
                                onChange={(e) => setSettings({...settings, receiptQrType: e.target.value})}
                            >
                                <option value="digital_receipt">QR Digital Receipt (Link ke nota online pelanggan)</option>
                                <option value="custom">QR Custom (Link bebas)</option>
                                <option value="hidden">Sembunyikan QR Code</option>
                            </select>

                            {settings.receiptQrType === 'custom' && (
                                <div className="mt-2">
                                    <p className="text-xs font-bold text-gray-700 mb-1">Link Kustom QR Code</p>
                                    <input 
                                        type="text"
                                        className="w-full p-2 border border-gray-300 rounded-lg text-sm"
                                        placeholder="https://wa.me/62812345... atau https://g.page/r/..."
                                        value={settings.customReceiptQrLink || ''}
                                        onChange={(e) => setSettings({...settings, customReceiptQrLink: e.target.value})}
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Booking & Schedule Settings */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-blue-900" />
                        Booking & Schedule Settings
                    </h2>
                    <div className="space-y-4">
                        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-200">
                            <div>
                                <p className="text-sm font-bold text-gray-900">Izinkan Double Booking Staf & Abaikan Jam Bentrok</p>
                                <p className="text-xs text-gray-500 mt-0.5">Jika diaktifkan, staf dapat dipesan pada jam yang sama oleh lebih dari satu pelanggan (mengabaikan blokir jadwal bentrok).</p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={settings.allowStaffDoubleBooking}
                                    onChange={(e) => setSettings({ ...settings, allowStaffDoubleBooking: e.target.checked })}
                                    className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-600 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
                            </label>
                        </div>
                        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-200">
                            <div className="flex-1 mr-4">
                                <p className="text-sm font-bold text-gray-900">Password Stock Adjustment</p>
                                <p className="text-xs text-gray-500 mt-0.5">Password yang harus dimasukkan kasir/staf saat mengubah jumlah stok barang secara manual. Kosongkan jika tidak ingin memakai password.</p>
                            </div>
                            <div className="w-1/3">
                                <input
                                    type="password"
                                    value={settings.stockAdjustmentPassword}
                                    onChange={(e) => setSettings({ ...settings, stockAdjustmentPassword: e.target.value })}
                                    placeholder="Masukkan password..."
                                    className="w-full px-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-900 focus:border-transparent outline-none"
                                />
                            </div>
                        </div>

                        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-200">
                            <div className="flex-1 mr-4">
                                <p className="text-sm font-bold text-gray-900">Password Setor Bank</p>
                                <p className="text-xs text-gray-500 mt-0.5">Password untuk kasir/staf saat mentransfer uang dari Brankas ke Bank. Kosongkan jika tidak wajib.</p>
                            </div>
                            <div className="w-1/3">
                                <input
                                    type="password"
                                    value={settings.bankTransferPassword}
                                    onChange={(e) => setSettings({ ...settings, bankTransferPassword: e.target.value })}
                                    placeholder="Masukkan password..."
                                    className="w-full px-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-900 focus:border-transparent outline-none"
                                />
                            </div>
                        </div>

                        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-200">
                            <div className="flex-1 mr-4">
                                <p className="text-sm font-bold text-gray-900">Password Ambil Cash (Owner)</p>
                                <p className="text-xs text-gray-500 mt-0.5">Password untuk menarik uang tunai dari Brankas oleh Owner. Kosongkan jika tidak wajib.</p>
                            </div>
                            <div className="w-1/3">
                                <input
                                    type="password"
                                    value={settings.ownerTransferPassword}
                                    onChange={(e) => setSettings({ ...settings, ownerTransferPassword: e.target.value })}
                                    placeholder="Masukkan password..."
                                    className="w-full px-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-900 focus:border-transparent outline-none"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Premium Membership Settings */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <Crown className="w-5 h-5 text-amber-600" />
                        Premium Membership Settings
                    </h2>
                    <p className="text-xs text-gray-500 mb-4">
                        Atur harga, durasi, dan diskon otomatis untuk Premium Membership.
                    </p>
                    <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <FormInput
                                label="Harga Membership (Rp)"
                                type="number"
                                value={settings.membershipPrice.toString()}
                                onChange={(e) => setSettings({ ...settings, membershipPrice: parseFloat(e.target.value) || 0 })}
                                min="0"
                                placeholder="500000"
                            />
                            <FormInput
                                label="Masa Berlaku (Hari)"
                                type="number"
                                value={settings.membershipDurationDays.toString()}
                                onChange={(e) => setSettings({ ...settings, membershipDurationDays: parseInt(e.target.value) || 365 })}
                                min="1"
                                placeholder="365"
                            />
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">Voucher Ulang Tahun (Opsional)</label>
                                <select
                                    value={settings.birthdayVoucherId || ""}
                                    onChange={(e) => setSettings({ ...settings, birthdayVoucherId: e.target.value })}
                                    className="w-full px-4 py-2 border-2 border-gray-400 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 text-sm"
                                >
                                    <option value="">— Tidak ada —</option>
                                    {vouchersOptions.map((v) => (
                                        <option key={v._id} value={v._id}>
                                            {v.code} {v.description ? `- ${v.description}` : ""}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-3">
                            <h3 className="text-sm font-bold text-amber-900">💰 Diskon Default Member</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <FormSelect
                                    label="Tipe Diskon"
                                    value={settings.memberDiscountType}
                                    onChange={(e: any) => setSettings({ ...settings, memberDiscountType: e.target.value })}
                                    options={[
                                        { value: "percentage", label: "Persentase (%)" },
                                        { value: "nominal", label: "Nominal (Rp)" },
                                    ]}
                                />
                                <FormInput
                                    label={settings.memberDiscountType === "percentage" ? "Nilai Diskon (%)" : "Nilai Diskon (Rp)"}
                                    type="number"
                                    value={settings.memberDiscountValue.toString()}
                                    onChange={(e) => setSettings({ ...settings, memberDiscountValue: parseFloat(e.target.value) || 0 })}
                                    min="0"
                                    max={settings.memberDiscountType === "percentage" ? "100" : undefined}
                                    placeholder={settings.memberDiscountType === "percentage" ? "10" : "20000"}
                                />
                            </div>
                            <p className="text-[11px] text-amber-700">
                                Diskon ini berlaku untuk semua item yang dicentang di bawah. Item dengan "Harga Member" khusus di master data akan menggunakan harga override-nya.
                            </p>
                        </div>

                        <div>
                            <h3 className="text-md font-bold text-gray-900 mb-2 mt-4">Item Benefit Member</h3>
                            <p className="text-xs text-gray-500 mb-4">
                                Pilih item mana saja yang akan mendapat diskon saat member checkout di Kasir.
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                                    <h4 className="font-semibold text-sm mb-3">Layanan (Services)</h4>
                                    <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                                        {servicesOptions.map(svc => (
                                            <label key={svc._id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-100 p-1 rounded">
                                                <input
                                                    type="checkbox"
                                                    checked={settings.memberIncludedServices.includes(svc._id)}
                                                    onChange={(e) => {
                                                        const newArr = e.target.checked
                                                            ? [...settings.memberIncludedServices, svc._id]
                                                            : settings.memberIncludedServices.filter(id => id !== svc._id);
                                                        setSettings({ ...settings, memberIncludedServices: newArr });
                                                    }}
                                                    className="rounded text-amber-600 focus:ring-amber-500 accent-amber-600"
                                                />
                                                <span className="text-gray-700">{svc.name}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                                    <h4 className="font-semibold text-sm mb-3">Produk (Products)</h4>
                                    <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                                        {productsOptions.map(prod => (
                                            <label key={prod._id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-100 p-1 rounded">
                                                <input
                                                    type="checkbox"
                                                    checked={settings.memberIncludedProducts.includes(prod._id)}
                                                    onChange={(e) => {
                                                        const newArr = e.target.checked
                                                            ? [...settings.memberIncludedProducts, prod._id]
                                                            : settings.memberIncludedProducts.filter(id => id !== prod._id);
                                                        setSettings({ ...settings, memberIncludedProducts: newArr });
                                                    }}
                                                    className="rounded text-amber-600 focus:ring-amber-500 accent-amber-600"
                                                />
                                                <span className="text-gray-700">{prod.name}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                                    <h4 className="font-semibold text-sm mb-3">Paket (Bundles)</h4>
                                    <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                                        {bundlesOptions.map(bndl => (
                                            <label key={bndl._id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-100 p-1 rounded">
                                                <input
                                                    type="checkbox"
                                                    checked={settings.memberIncludedBundles.includes(bndl._id)}
                                                    onChange={(e) => {
                                                        const newArr = e.target.checked
                                                            ? [...settings.memberIncludedBundles, bndl._id]
                                                            : settings.memberIncludedBundles.filter(id => id !== bndl._id);
                                                        setSettings({ ...settings, memberIncludedBundles: newArr });
                                                    }}
                                                    className="rounded text-amber-600 focus:ring-amber-500 accent-amber-600"
                                                />
                                                <span className="text-gray-700">{bndl.name}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Wallet Bonus Tiers */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <CreditCard className="w-5 h-5 text-blue-900" />
                        Wallet Bonus Tiers
                    </h2>
                    <p className="text-xs text-gray-500 mb-4">
                        Atur bonus otomatis berdasarkan nominal top-up. Contoh: Top-up 500rb bonus 10%, top-up 1jt bonus 20%.
                    </p>
                    <div className="space-y-3">
                        {(settings.walletBonusTiers || []).map((tier, idx) => (
                            <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                                <div className="col-span-5">
                                    <label className="text-[10px] text-gray-500 mb-0.5 block">Min Top-Up (Rp)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={tier.minAmount}
                                        onChange={(e) => {
                                            const newTiers = [...settings.walletBonusTiers];
                                            newTiers[idx] = { ...newTiers[idx], minAmount: Number(e.target.value) };
                                            setSettings({ ...settings, walletBonusTiers: newTiers });
                                        }}
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white"
                                        placeholder="500000"
                                    />
                                </div>
                                <div className="col-span-5">
                                    <label className="text-[10px] text-gray-500 mb-0.5 block">Bonus (%)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        max="100"
                                        value={tier.bonusPercent}
                                        onChange={(e) => {
                                            const newTiers = [...settings.walletBonusTiers];
                                            newTiers[idx] = { ...newTiers[idx], bonusPercent: Number(e.target.value) };
                                            setSettings({ ...settings, walletBonusTiers: newTiers });
                                        }}
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white"
                                        placeholder="10"
                                    />
                                </div>
                                <div className="col-span-2 flex justify-center pt-4">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const newTiers = settings.walletBonusTiers.filter((_, i) => i !== idx);
                                            setSettings({ ...settings, walletBonusTiers: newTiers });
                                        }}
                                        className="text-red-500 text-xs font-bold hover:text-red-700"
                                    >
                                        Hapus
                                    </button>
                                </div>
                            </div>
                        ))}
                        <button
                            type="button"
                            onClick={() => {
                                setSettings({
                                    ...settings,
                                    walletBonusTiers: [...(settings.walletBonusTiers || []), { minAmount: 0, bonusPercent: 0 }],
                                });
                            }}
                            className="text-sm text-blue-700 font-semibold hover:underline"
                        >
                            + Tambah Tier
                        </button>
                    </div>

                    <div className="border-t border-gray-100 pt-4 mt-4">
                        <FormInput
                            label="Masa Berlaku Saldo E-Wallet (Hari)"
                            type="number"
                            value={(settings.walletExpiryDays || 0).toString()}
                            onChange={(e) => setSettings({ ...settings, walletExpiryDays: parseInt(e.target.value) || 0 })}
                            min="0"
                            placeholder="Isi 0 untuk tidak pernah hangus"
                        />
                        <p className="text-[11px] text-gray-500 mt-1">
                            Isi angka 0 jika saldo tidak pernah hangus. Jika diisi angka lain (misal: 30), saldo customer akan otomatis hangus jika tidak ada transaksi wallet dalam jangka waktu tersebut sejak top-up terakhir.
                        </p>
                    </div>

                    <div className="mt-8 pt-6 border-t border-gray-200">
                        <h3 className="text-md font-bold text-gray-900 mb-2">Syarat Penggunaan E-Wallet</h3>
                        <p className="text-xs text-gray-500 mb-4">
                            Pilih item apa saja yang boleh dibayar menggunakan Saldo E-Wallet. Jika dikosongkan, E-Wallet TIDAK BISA digunakan sama sekali.
                            Untuk membebaskan, centang semuanya.
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                                <div className="flex items-center justify-between mb-3">
                                    <h4 className="font-semibold text-sm">Layanan (Services)</h4>
                                    <div className="flex gap-2">
                                        <button type="button" onClick={() => setSettings({ ...settings, walletIncludedServices: servicesOptions.map(s => s._id) })} className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded hover:bg-blue-200">Pilih Semua</button>
                                        <button type="button" onClick={() => setSettings({ ...settings, walletIncludedServices: [] })} className="text-[10px] bg-gray-200 text-gray-700 px-2 py-0.5 rounded hover:bg-gray-300">Hapus</button>
                                    </div>
                                </div>
                                <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                                    {servicesOptions.map(svc => (
                                        <label key={svc._id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-100 p-1 rounded">
                                            <input
                                                type="checkbox"
                                                checked={settings.walletIncludedServices.includes(svc._id)}
                                                onChange={(e) => {
                                                    const newArr = e.target.checked
                                                        ? [...settings.walletIncludedServices, svc._id]
                                                        : settings.walletIncludedServices.filter(id => id !== svc._id);
                                                    setSettings({ ...settings, walletIncludedServices: newArr });
                                                }}
                                                className="rounded text-blue-600 focus:ring-blue-500"
                                            />
                                            <span className="text-gray-700">{svc.name}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                                <div className="flex items-center justify-between mb-3">
                                    <h4 className="font-semibold text-sm">Produk (Products)</h4>
                                    <div className="flex gap-2">
                                        <button type="button" onClick={() => setSettings({ ...settings, walletIncludedProducts: productsOptions.map(p => p._id) })} className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded hover:bg-blue-200">Pilih Semua</button>
                                        <button type="button" onClick={() => setSettings({ ...settings, walletIncludedProducts: [] })} className="text-[10px] bg-gray-200 text-gray-700 px-2 py-0.5 rounded hover:bg-gray-300">Hapus</button>
                                    </div>
                                </div>
                                <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                                    {productsOptions.map(prod => (
                                        <label key={prod._id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-100 p-1 rounded">
                                            <input
                                                type="checkbox"
                                                checked={settings.walletIncludedProducts.includes(prod._id)}
                                                onChange={(e) => {
                                                    const newArr = e.target.checked
                                                        ? [...settings.walletIncludedProducts, prod._id]
                                                        : settings.walletIncludedProducts.filter(id => id !== prod._id);
                                                    setSettings({ ...settings, walletIncludedProducts: newArr });
                                                }}
                                                className="rounded text-blue-600 focus:ring-blue-500"
                                            />
                                            <span className="text-gray-700">{prod.name}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                                <div className="flex items-center justify-between mb-3">
                                    <h4 className="font-semibold text-sm">Paket (Bundles)</h4>
                                    <div className="flex gap-2">
                                        <button type="button" onClick={() => setSettings({ ...settings, walletIncludedBundles: bundlesOptions.map(b => b._id) })} className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded hover:bg-blue-200">Pilih Semua</button>
                                        <button type="button" onClick={() => setSettings({ ...settings, walletIncludedBundles: [] })} className="text-[10px] bg-gray-200 text-gray-700 px-2 py-0.5 rounded hover:bg-gray-300">Hapus</button>
                                    </div>
                                </div>
                                <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                                    {bundlesOptions.map(bndl => (
                                        <label key={bndl._id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-100 p-1 rounded">
                                            <input
                                                type="checkbox"
                                                checked={settings.walletIncludedBundles.includes(bndl._id)}
                                                onChange={(e) => {
                                                    const newArr = e.target.checked
                                                        ? [...settings.walletIncludedBundles, bndl._id]
                                                        : settings.walletIncludedBundles.filter(id => id !== bndl._id);
                                                    setSettings({ ...settings, walletIncludedBundles: newArr });
                                                }}
                                                className="rounded text-blue-600 focus:ring-blue-500"
                                            />
                                            <span className="text-gray-700">{bndl.name}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Financial Settings */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <DollarSign className="w-5 h-5 text-blue-900" />
                        Financial Settings
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <FormSelect
                            label="Currency"
                            value={settings.currency}
                            onChange={(e: any) => setSettings({ ...settings, currency: e.target.value })}
                            options={currencies.map(c => ({ value: c.code, label: `${c.symbol} ${c.code} - ${c.name}` }))}
                        />

                        <FormSelect
                            label="Timezone"
                            value={settings.timezone}
                            onChange={(e: any) => setSettings({ ...settings, timezone: e.target.value })}
                            options={timezones}
                        />
                        <FormInput
                            label="Default Tax Rate (%)"
                            value={settings.taxRate.toString()}
                            onChange={(e) => setSettings({ ...settings, taxRate: parseFloat(e.target.value) || 0 })}
                            type="number"
                            placeholder="0"
                        />
                    </div>
                </div>



                {/* Receipt Customization */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <FileText className="w-5 h-5 text-blue-900" />
                        Receipt Customization
                    </h2>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Receipt Footer Message
                            </label>
                            <input
                                type="text"
                                value={settings.receiptFooter}
                                onChange={(e) => setSettings({ ...settings, receiptFooter: e.target.value })}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-900 focus:border-transparent"
                                placeholder="Thank you for your business!"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Terms and Conditions
                            </label>
                            <textarea
                                value={settings.termsAndConditions}
                                onChange={(e) => setSettings({ ...settings, termsAndConditions: e.target.value })}
                                rows={4}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-900 focus:border-transparent"
                                placeholder="Enter your terms and conditions..."
                            />
                        </div>
                    </div>
                </div>

                {/* Loyalty & Referral Settings */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <Gift className="w-5 h-5 text-amber-600" />
                        Loyalty & Referral Settings
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <FormInput
                            label="Loyalty: Poin per Spending (Rp)"
                            type="number"
                            value={settings.loyaltyPointPerSpend.toString()}
                            onChange={(e) => setSettings({ ...settings, loyaltyPointPerSpend: parseFloat(e.target.value) || 0 })}
                            min="0"
                            placeholder="100000 = tiap Rp100.000 = 1 poin"
                        />
                        <FormInput
                            label="Loyalty: Nilai 1 Poin (Rp)"
                            type="number"
                            value={settings.loyaltyPointValue.toString()}
                            onChange={(e) => setSettings({ ...settings, loyaltyPointValue: parseFloat(e.target.value) || 0 })}
                            min="0"
                            placeholder="1000 = 1 poin = Rp1.000"
                        />
                        <div>
                          <FormInput
                              label="Referral: Bonus Poin untuk Pengajak"
                              type="number"
                              value={settings.referralRewardPoints.toString()}
                              onChange={(e) => setSettings({ ...settings, referralRewardPoints: parseFloat(e.target.value) || 0 })}
                              min="0"
                              placeholder="Misal: 50 poin"
                          />
                          {/* [U04 FIX] Info VIP-only agar admin tidak bingung */}
                          <p className="mt-1 text-xs text-amber-600 flex items-start gap-1">
                            <span className="flex-shrink-0">⚠️</span>
                            <span><strong>Reward ini hanya diberikan kepada pengajak yang berstatus Member VIP.</strong> Customer regular yang mereferensikan orang lain tidak akan mendapatkan reward poin ini.</span>
                          </p>
                        </div>
                        <div className="flex gap-2 items-end">
                            <div className="flex-1">
                                <FormInput
                                    label="Referral: Diskon untuk Customer Baru"
                                    type="number"
                                    value={settings.referralDiscountValue.toString()}
                                    onChange={(e) => setSettings({ ...settings, referralDiscountValue: parseFloat(e.target.value) || 0 })}
                                    min="0"
                                    placeholder="Nilai diskon referral"
                                />
                            </div>
                            <select
                                value={settings.referralDiscountType}
                                onChange={(e) => setSettings({ ...settings, referralDiscountType: e.target.value as "percentage" | "nominal" })}
                                className="h-10 px-2 border border-gray-300 rounded-lg text-sm bg-white mb-4"
                            >
                                <option value="nominal">Rp</option>
                                <option value="percentage">%</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* SMS Settings (Twilio) */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <MessageSquare className="w-5 h-5 text-blue-900" />
                        SMS Settings (Twilio)
                    </h2>
                    <div className="space-y-4">
                        <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg border border-blue-100">
                            <input
                                type="checkbox"
                                id="smsEnabled"
                                checked={settings.smsEnabled}
                                onChange={(e) => setSettings({ ...settings, smsEnabled: e.target.checked })}
                                className="w-4 h-4 text-blue-900 rounded focus:ring-blue-900"
                            />
                            <label htmlFor="smsEnabled" className="text-sm font-medium text-gray-900 cursor-pointer">
                                Enable SMS Notifications
                            </label>
                        </div>
                        {settings.smsEnabled && (
                            <div className="grid grid-cols-1 gap-4 pl-4 border-l-2 border-blue-200">
                                <FormInput
                                    label="Twilio Account SID"
                                    value={settings.twilioAccountSid}
                                    onChange={(e) => setSettings({ ...settings, twilioAccountSid: e.target.value })}
                                    placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                                />
                                <FormInput
                                    label="Twilio Auth Token"
                                    type="password"
                                    value={settings.twilioAuthToken}
                                    onChange={(e) => setSettings({ ...settings, twilioAuthToken: e.target.value })}
                                    placeholder="Your Twilio Auth Token"
                                />
                                <FormInput
                                    label="Twilio Phone Number"
                                    value={settings.twilioPhoneNumber}
                                    onChange={(e) => setSettings({ ...settings, twilioPhoneNumber: e.target.value })}
                                    placeholder="+1234567890"
                                />
                                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                                    <p className="text-xs text-yellow-800">
                                        <strong>Note:</strong> Get your Twilio credentials from <a href="https://www.twilio.com/console" target="_blank" rel="noopener noreferrer" className="underline">Twilio Console</a>
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* WhatsApp Provider */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <MessageSquare className="w-5 h-5 text-green-600" />
                        WhatsApp Provider
                    </h2>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Provider</label>
                            <div className="grid grid-cols-2 gap-3">
                                {(["fonnte", "balesotomatis"] as const).map((p) => (
                                    <button
                                        key={p}
                                        type="button"
                                        onClick={() => {
                                            setSettings({ ...settings, waProvider: p });
                                            setWaConnectionTestResult(null);
                                        }}
                                        className={`p-3 rounded-lg border-2 text-sm font-medium text-left transition ${
                                            settings.waProvider === p
                                                ? "border-green-500 bg-green-50 text-green-700"
                                                : "border-gray-200 text-gray-600 hover:border-gray-300"
                                        }`}
                                    >
                                        {p === "fonnte" ? "Fonnte (Legacy)" : "BalesOtomatis.id"}
                                        <div className="text-xs font-normal text-gray-400 mt-0.5">
                                            {p === "fonnte" ? "Token tunggal, gak disarankan buat tenant baru" : "Scan QR atau WABA resmi"}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {settings.waProvider === "fonnte" ? (
                            <div className="grid grid-cols-1 gap-4">
                                <FormInput
                                    label="Fonnte API Token"
                                    type="password"
                                    value={settings.fonnteToken}
                                    onChange={(e) => setSettings({ ...settings, fonnteToken: e.target.value })}
                                    placeholder="Your Fonnte Token"
                                />
                                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                                    <p className="text-xs text-yellow-800">
                                        <strong>Note:</strong> Get your Token from <a href="https://fonnte.com" target="_blank" rel="noopener noreferrer" className="underline">Fonnte API Dashboard</a>. This will override the token from `.env` file if provided.
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Mode Koneksi</label>
                                    <div className="grid grid-cols-2 gap-3">
                                        {(["unofficial", "waba"] as const).map((m) => (
                                            <button
                                                key={m}
                                                type="button"
                                                onClick={() => {
                                                    setSettings({ ...settings, balesotomatisMode: m });
                                                    setWaConnectionTestResult(null);
                                                }}
                                                className={`p-3 rounded-lg border-2 text-sm font-medium text-left transition ${
                                                    settings.balesotomatisMode === m
                                                        ? "border-green-500 bg-green-50 text-green-700"
                                                        : "border-gray-200 text-gray-600 hover:border-gray-300"
                                                }`}
                                            >
                                                {m === "unofficial" ? "Scan QR (Un-Official)" : "WhatsApp Business API (Resmi)"}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {settings.balesotomatisMode === "unofficial" ? (
                                    <div className="grid grid-cols-1 gap-4">
                                        <FormInput
                                            label="API Key"
                                            type="password"
                                            value={settings.balesotomatisApiKey}
                                            onChange={(e) => setSettings({ ...settings, balesotomatisApiKey: e.target.value })}
                                            placeholder="Dari app.balesotomatis.id/rest-api"
                                        />
                                        <FormInput
                                            label="Number ID"
                                            value={settings.balesotomatisNumberId}
                                            onChange={(e) => setSettings({ ...settings, balesotomatisNumberId: e.target.value })}
                                            placeholder="ID device yang sudah di-scan QR"
                                        />
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 gap-4">
                                        <FormInput
                                            label="Secret Key"
                                            type="password"
                                            value={settings.balesotomatisSecretKey}
                                            onChange={(e) => setSettings({ ...settings, balesotomatisSecretKey: e.target.value })}
                                        />
                                        <FormInput
                                            label="Licenses Key"
                                            value={settings.balesotomatisLicensesKey}
                                            onChange={(e) => setSettings({ ...settings, balesotomatisLicensesKey: e.target.value })}
                                            placeholder="WB-xxxx"
                                        />
                                        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                            <p className="text-xs text-blue-800">
                                                Mode ini butuh customer chat duluan dalam 24 jam terakhir untuk pesan bebas teks
                                                (reminder/notifikasi). Di luar window itu, cuma template pre-approved Meta yang bisa dikirim.
                                            </p>
                                        </div>
                                    </div>
                                )}

                                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                                    <p className="text-xs text-yellow-800">
                                        Ambil kredensial dari <a href="https://app.balesotomatis.id/rest-api" target="_blank" rel="noopener noreferrer" className="underline">app.balesotomatis.id/rest-api</a>.
                                    </p>
                                </div>

                                <div className="flex items-center gap-3">
                                    <button
                                        type="button"
                                        onClick={handleTestWaConnection}
                                        disabled={testingWaConnection}
                                        className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                                    >
                                        {testingWaConnection ? "Menguji..." : settings.balesotomatisMode === "waba" ? "🔄 Sync & Cek Status Template Meta" : "Test Koneksi"}
                                    </button>
                                    {waConnectionTestResult && (
                                        <span className={`text-sm ${waConnectionTestResult.success ? "text-green-600" : "text-red-600"}`}>
                                            {waConnectionTestResult.message}
                                        </span>
                                    )}
                                </div>

                                {waConnectionTestResult?.devices && waConnectionTestResult.devices.length > 0 && (
                                    <div className="border border-gray-200 rounded-lg divide-y">
                                        {waConnectionTestResult.devices.map((d: any) => (
                                            <div key={d.number_id} className="p-3 flex items-center justify-between text-sm">
                                                <div>
                                                    <div className="font-medium text-gray-800">{d.number_whatsapp || "-"}</div>
                                                    <div className="text-xs text-gray-400">Number ID: {d.number_id}</div>
                                                </div>
                                                <span className={`text-xs px-2 py-1 rounded-full ${d.state_connection === "connected" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                                                    {d.state_connection}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {waConnectionTestResult?.templates && waConnectionTestResult.templates.length > 0 && (
                                    <div className="mt-4 border border-green-200 rounded-xl bg-green-50/50 p-4 space-y-3">
                                        <div className="flex items-center justify-between border-b border-green-200 pb-2">
                                            <div className="flex items-center gap-2">
                                                <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
                                                <h4 className="font-semibold text-sm text-gray-900">Daftar Template WABA Resmi (Status Meta)</h4>
                                            </div>
                                            <span className="text-xs bg-green-100 text-green-800 font-medium px-2 py-0.5 rounded-full">
                                                {waConnectionTestResult.templates.length} Template
                                            </span>
                                        </div>
                                        <div className="divide-y divide-gray-200 bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                                            {waConnectionTestResult.templates.map((t: any, idx: number) => {
                                                const tName = t.name || t.template_name || `Template #${idx + 1}`;
                                                const tStatus = String(t.status || t.template_status || "UNKNOWN").toUpperCase();
                                                const tLang = t.language || t.template_language || "id";
                                                const tCat = t.category || t.template_category || "UTILITY";
                                                
                                                const isApproved = tStatus === "APPROVED";
                                                const isPending = tStatus === "PENDING" || tStatus === "IN_REVIEW";
                                                const isRejected = tStatus === "REJECTED";

                                                return (
                                                    <div key={t.id || tName} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-gray-50 transition-colors">
                                                        <div className="space-y-1">
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-semibold text-sm text-gray-900 font-mono">{tName}</span>
                                                                <span className="text-[10px] uppercase tracking-wider bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-medium">
                                                                    {tLang} • {tCat}
                                                                </span>
                                                            </div>
                                                            {t.components && (
                                                                <p className="text-xs text-gray-500 line-clamp-1">
                                                                    {t.components.find((c: any) => c.type === 'BODY')?.text || "Template WABA tersinkronisasi"}
                                                                </p>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center self-start sm:self-center">
                                                            {isApproved ? (
                                                                <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                                                                    <span>🟢</span> Approved (Siap Dipakai!)
                                                                </span>
                                                            ) : isPending ? (
                                                                <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                                                                    <span>🟡</span> Pending Review Meta
                                                                </span>
                                                            ) : isRejected ? (
                                                                <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-rose-100 text-rose-800 border border-rose-300">
                                                                    <span>🔴</span> Rejected Meta
                                                                </span>
                                                            ) : (
                                                                <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-gray-100 text-gray-700">
                                                                    <span>⚪</span> {tStatus}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* WA Marketing Settings */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <MessageSquare className="w-5 h-5 text-green-600" />
                        WA Marketing & Notifications
                    </h2>
                    <div className="space-y-4">
                        <div className="flex items-center gap-3 p-4 bg-green-50 rounded-lg border border-green-100">
                            <input
                                type="checkbox"
                                id="greetingEnabled"
                                checked={settings.greetingEnabled}
                                onChange={(e) => setSettings({ ...settings, greetingEnabled: e.target.checked })}
                                className="w-4 h-4 text-green-600 rounded focus:ring-green-600"
                            />
                            <label htmlFor="greetingEnabled" className="text-sm font-medium text-gray-900 cursor-pointer">
                                Aktifkan Auto-Reply Greeting WA (Pesan sambutan otomatis ke pelanggan baru)
                            </label>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <FormInput
                                label="WA Admin (Stock Alert)"
                                value={settings.waAdminNumber}
                                onChange={(e) => setSettings({ ...settings, waAdminNumber: e.target.value })}
                                placeholder="628123456789"
                            />
                            <FormInput
                                label="WA Owner (Daily Report)"
                                value={settings.waOwnerNumber}
                                onChange={(e) => setSettings({ ...settings, waOwnerNumber: e.target.value })}
                                placeholder="628123456789"
                            />
                        </div>

                        <div className="border-t border-gray-200 pt-4 mt-4">
                            <h3 className="text-sm font-bold text-gray-800 mb-3">⚙️ Pengaturan Lanjutan WA Blast</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* ===== OPERATIONAL HOURS - VISUAL TIME RANGE ===== */}
                                <div className="col-span-1 md:col-span-2 space-y-4">
                                    
                                    {/* Time Range Picker */}
                                    <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl">
                                        <h4 className="text-sm font-bold text-gray-800 mb-3">
                                            🕐 Jendela Jam Operasional WA
                                        </h4>
                                        <p className="text-xs text-gray-500 mb-4">
                                            WA hanya akan dikirim di antara jam ini (berlaku untuk semua pengiriman otomatis)
                                        </p>
                                        
                                        <div className="grid grid-cols-2 gap-4 mb-4">
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                                    Mulai Operasional
                                                </label>
                                                <input
                                                    type="time"
                                                    value={`${String(settings.waOperationalHoursStart ?? 8).padStart(2,'0')}:00`}
                                                    onChange={(e) => {
                                                        const hour = parseInt(e.target.value.split(':')[0]) || 0;
                                                        setSettings({ ...settings, waOperationalHoursStart: hour });
                                                    }}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm 
                                                            text-gray-900 bg-white focus:ring-2 focus:ring-green-500"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                                    Selesai Operasional
                                                </label>
                                                <input
                                                    type="time"
                                                    value={`${String(settings.waOperationalHoursEnd ?? 20).padStart(2,'0')}:00`}
                                                    onChange={(e) => {
                                                        const hour = parseInt(e.target.value.split(':')[0]) || 0;
                                                        setSettings({ ...settings, waOperationalHoursEnd: hour });
                                                    }}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm 
                                                            text-gray-900 bg-white focus:ring-2 focus:ring-green-500"
                                                />
                                            </div>
                                        </div>
                                        
                                        {/* Visual Preview Bar */}
                                        <div className="mt-2">
                                            <div className="flex justify-between text-xs text-gray-400 mb-1">
                                                <span>00:00</span>
                                                <span>06:00</span>
                                                <span>12:00</span>
                                                <span>18:00</span>
                                                <span>23:59</span>
                                            </div>
                                            <div className="relative h-4 bg-gray-200 rounded-full overflow-hidden">
                                                <div
                                                    className="absolute h-full bg-green-400 rounded-full transition-all"
                                                    style={{
                                                        left: `${((settings.waOperationalHoursStart ?? 8) / 24) * 100}%`,
                                                        width: `${(((settings.waOperationalHoursEnd ?? 20) - (settings.waOperationalHoursStart ?? 8)) / 24) * 100}%`
                                                    }}
                                                />
                                            </div>
                                            <p className="text-xs text-green-700 font-medium mt-2 text-center">
                                                ✅ WA aktif: {String(settings.waOperationalHoursStart ?? 8).padStart(2,'0')}:00 
                                                &nbsp;—&nbsp; 
                                                {String(settings.waOperationalHoursEnd ?? 20).padStart(2,'0')}:00
                                            </p>
                                        </div>
                                    </div>

                                    {/* Per-Type Schedule */}
                                    <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
                                        <h4 className="text-sm font-bold text-gray-800 mb-3">
                                            📅 Jadwal Spesifik per Jenis Notifikasi
                                        </h4>
                                        <p className="text-xs text-gray-500 mb-3">
                                            Tentukan jam berapa tepatnya setiap jenis pesan WA akan dikirim 
                                            (harus dalam rentang jam operasional di atas)
                                        </p>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            {[
                                                { key: 'dailyReportTime',           label: '📊 Laporan Harian',         default: '21:00' },
                                                { key: 'waStockAlertTime',          label: '📦 Alert Stok Rendah',       default: '08:00' },
                                                { key: 'waMembershipReminderTime',  label: '👑 Reminder Membership',     default: '09:00' },
                                                { key: 'waPackageReminderTime',     label: '🎁 Reminder Paket',           default: '09:30' },
                                                { key: 'waBirthdayNotifTime',       label: '🎂 Notifikasi Ultah',  default: '08:00' },
                                            ].map(({ key, label, default: def }) => (
                                                <div key={key} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2 bg-white rounded-lg border border-blue-100">
                                                    <label className="text-sm font-medium text-gray-700 flex-1">{label}</label>
                                                    <input
                                                        type="time"
                                                        value={(settings as any)[key] || def}
                                                        onChange={(e) => setSettings({ ...settings, [key]: e.target.value })}
                                                        className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm 
                                                                text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 w-full sm:w-32"
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                {/* ===== END OPERATIONAL HOURS ===== */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Tanggal Nomor Fonnte Didaftarkan</label>
                                    <input
                                        type="date"
                                        value={settings.fonnteDeviceRegisteredAt ? settings.fonnteDeviceRegisteredAt.substring(0, 10) : ''}
                                        onChange={(e) => setSettings({ ...settings, fonnteDeviceRegisteredAt: e.target.value })}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-900"
                                    />
                                </div>
                                <FormInput
                                    label="Override Limit Pesan Harian (0 = otomatis)"
                                    type="number" min="0"
                                    value={settings.fonnteMaxDailyMessages?.toString()}
                                    onChange={(e) => setSettings({ ...settings, fonnteMaxDailyMessages: parseInt(e.target.value) || 0 })}
                                    placeholder="0"
                                />
                            </div>
                        </div>

                        <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                            <p className="text-xs text-green-800">
                                <strong>Auto WA:</strong> Stock alert → Admin | Daily report → Owner | Membership/Package expiry → Customer.<br />
                                Setup cron job di <a href="https://cron-job.org" target="_blank" rel="noopener noreferrer" className="underline">cron-job.org</a> untuk trigger otomatis:
                                <code className="ml-1 bg-green-100 px-1.5 py-0.5 rounded text-[10px]">/api/cron/wa-stock-alert</code>,
                                <code className="ml-1 bg-green-100 px-1.5 py-0.5 rounded text-[10px]">/api/cron/wa-daily-report</code>,
                                <code className="ml-1 bg-green-100 px-1.5 py-0.5 rounded text-[10px]">/api/cron/wa-membership-expiry</code>,
                                <code className="ml-1 bg-green-100 px-1.5 py-0.5 rounded text-[10px]">/api/cron/wa-package-expiry</code>
                            </p>
                        </div>
                    </div>
                </div>

                {/* WhatsApp Templates & Messages */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <MessageSquare className="w-5 h-5 text-green-600" />
                        WhatsApp Templates & Reminders
                    </h2>
                    
                    <div className="space-y-6">
                        {/* WA Appointment Reminder */}
                        <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-4">
                            <h3 className="text-sm font-bold text-gray-800 mb-2 border-b border-gray-200 pb-2">📅 Appointment Reminder</h3>
                            <div className="flex items-center gap-3">
                                <input
                                    type="checkbox"
                                    id="waAppointmentReminderEnabled"
                                    checked={settings.waAppointmentReminderEnabled}
                                    onChange={(e) => setSettings({ ...settings, waAppointmentReminderEnabled: e.target.checked })}
                                    className="w-4 h-4 text-green-600 rounded focus:ring-green-600"
                                />
                                <label htmlFor="waAppointmentReminderEnabled" className="text-sm font-medium text-gray-900 cursor-pointer">
                                    Aktifkan Auto-Reminder Appointment ke Customer
                                </label>
                            </div>
                            {settings.waAppointmentReminderEnabled && (
                                <>
                                    <FormInput
                                        label="Waktu Reminder (Menit Sebelum Jadwal)"
                                        type="number" min="0"
                                        value={settings.waAppointmentReminderMinutesBefore?.toString()}
                                        onChange={(e) => setSettings({ ...settings, waAppointmentReminderMinutesBefore: parseInt(e.target.value) || 0 })}
                                        placeholder="120"
                                    />
                                    <p className="text-[10px] text-gray-500 mt-1">Contoh: 120 menit (2 jam) sebelum jadwal.</p>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">Template Pesan Reminder</label>
                                        <textarea
                                            value={settings.waAppointmentReminderDefaultTemplate}
                                            onChange={(e) => setSettings({ ...settings, waAppointmentReminderDefaultTemplate: e.target.value })}
                                            rows={4}
                                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 text-sm"
                                        />
                                        <p className="text-[10px] text-gray-500 mt-1">Gunakan tag: {'{customer_name}'}, {'{store_name}'}, {'{service_name}'}, {'{staff_name}'}, {'{appointment_date}'}, {'{appointment_time}'}</p>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* WA Nota */}
                        <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-4">
                            <h3 className="text-sm font-bold text-gray-800 mb-2 border-b border-gray-200 pb-2">🧾 Nota WhatsApp</h3>
                            <FormInput
                                label="Prefix Notifikasi ke Admin"
                                value={settings.waAdminNotaPrefix}
                                onChange={(e) => setSettings({ ...settings, waAdminNotaPrefix: e.target.value })}
                                placeholder="[NOTIFIKASI ADMIN]"
                            />
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Template Pesan Nota</label>
                                <textarea
                                    value={settings.waNotaTemplate}
                                    onChange={(e) => setSettings({ ...settings, waNotaTemplate: e.target.value })}
                                    rows={4}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 text-sm"
                                />
                                <p className="text-[10px] text-gray-500 mt-1">Gunakan tag: {'{customer_name}'}, {'{store_name}'}, {'{invoice_number}'}, {'{total_amount}'}, {'{payment_method}'}</p>
                            </div>
                        </div>

                        {/* Additional Existing Templates */}
                        <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-4">
                            <h3 className="text-sm font-bold text-gray-800 mb-2 border-b border-gray-200 pb-2">Templates WA Otomatis Lainnya</h3>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Stock Alert Template</label>
                                <textarea
                                    value={settings.waTemplateStockAlert}
                                    onChange={(e) => setSettings({ ...settings, waTemplateStockAlert: e.target.value })}
                                    rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Daily Report Template</label>
                                <textarea
                                    value={settings.waTemplateDailyReport}
                                    onChange={(e) => setSettings({ ...settings, waTemplateDailyReport: e.target.value })}
                                    rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Membership Expiry Template</label>
                                <textarea
                                    value={settings.waTemplateMembershipExpiry}
                                    onChange={(e) => setSettings({ ...settings, waTemplateMembershipExpiry: e.target.value })}
                                    rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Package Expiry Template</label>
                                <textarea
                                    value={settings.waTemplatePackageExpiry}
                                    onChange={(e) => setSettings({ ...settings, waTemplatePackageExpiry: e.target.value })}
                                    rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Email Settings (SMTP) */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <Send className="w-5 h-5 text-blue-900" />
                        Email Settings (SMTP)
                    </h2>
                    <div className="space-y-4">
                        <div className="flex items-center gap-3 p-4 bg-green-50 rounded-lg border border-green-100">
                            <input
                                type="checkbox"
                                id="emailEnabled"
                                checked={settings.emailEnabled}
                                onChange={(e) => setSettings({ ...settings, emailEnabled: e.target.checked })}
                                className="w-4 h-4 text-blue-900 rounded focus:ring-blue-900"
                            />
                            <label htmlFor="emailEnabled" className="text-sm font-medium text-gray-900 cursor-pointer">
                                Enable Email Notifications
                            </label>
                        </div>
                        {settings.emailEnabled && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-4 border-l-2 border-green-200">
                                <FormInput
                                    label="SMTP Host"
                                    value={settings.smtpHost}
                                    onChange={(e) => setSettings({ ...settings, smtpHost: e.target.value })}
                                    placeholder="smtp.gmail.com"
                                />
                                <FormInput
                                    label="SMTP Port"
                                    type="number"
                                    value={settings.smtpPort.toString()}
                                    onChange={(e) => setSettings({ ...settings, smtpPort: parseInt(e.target.value) || 587 })}
                                    placeholder="587"
                                />
                                <FormInput
                                    label="SMTP Username"
                                    value={settings.smtpUser}
                                    onChange={(e) => setSettings({ ...settings, smtpUser: e.target.value })}
                                    placeholder="your_email@gmail.com"
                                />
                                <FormInput
                                    label="SMTP Password"
                                    type="password"
                                    value={settings.smtpPassword}
                                    onChange={(e) => setSettings({ ...settings, smtpPassword: e.target.value })}
                                    placeholder="Your app password"
                                />
                                <div className="md:col-span-2">
                                    <FormInput
                                        label="From Email Address"
                                        value={settings.smtpFrom}
                                        onChange={(e) => setSettings({ ...settings, smtpFrom: e.target.value })}
                                        placeholder='"Your Salon" <noreply@yoursalon.com>'
                                    />
                                </div>
                                <div className="md:col-span-2 flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                                    <input
                                        type="checkbox"
                                        id="smtpSecure"
                                        checked={settings.smtpSecure}
                                        onChange={(e) => setSettings({ ...settings, smtpSecure: e.target.checked })}
                                        className="w-4 h-4 text-blue-900 rounded focus:ring-blue-900"
                                    />
                                    <label htmlFor="smtpSecure" className="text-sm text-gray-700 cursor-pointer">
                                        Use SSL/TLS (Enable for port 465, disable for port 587)
                                    </label>
                                </div>
                                <div className="md:col-span-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                                    <p className="text-xs text-yellow-800">
                                        <strong>Gmail Users:</strong> Use port 587, enable 2FA, and generate an <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer" className="underline">App Password</a>
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Reminder Settings */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <Bell className="w-5 h-5 text-blue-900" />
                        Appointment Reminder Settings
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <FormInput
                            label="Send Reminders (Days Before)"
                            type="number"
                            value={settings.reminderDaysBefore.toString()}
                            onChange={(e) => setSettings({ ...settings, reminderDaysBefore: parseInt(e.target.value) || 1 })}
                            min="0"
                            max="7"
                            placeholder="1"
                        />
                        <FormSelect
                            label="Reminder Method"
                            value={settings.reminderMethod}
                            onChange={(e: any) => setSettings({ ...settings, reminderMethod: e.target.value })}
                            options={[
                                { value: "both", label: "SMS & Email" },
                                { value: "sms", label: "SMS Only" },
                                { value: "email", label: "Email Only" }
                            ]}
                        />
                    </div>
                    <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                        <p className="text-sm text-blue-800">
                            <strong>Note:</strong> Reminders will be sent automatically {settings.reminderDaysBefore} day(s) before appointments via {
                                settings.reminderMethod === 'both' ? 'SMS and Email' :
                                    settings.reminderMethod === 'sms' ? 'SMS only' : 'Email only'
                            }.
                        </p>
                    </div>
                </div>

                {/* AI Settings */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-blue-900" />
                        AI Power Reporting Settings
                    </h2>
                    <div className="space-y-4">
                        <div className="flex items-center gap-3 p-4 bg-purple-50 rounded-lg border border-purple-100">
                            <input
                                type="checkbox"
                                id="aiEnabled"
                                checked={settings.aiEnabled}
                                onChange={(e) => setSettings({ ...settings, aiEnabled: e.target.checked })}
                                className="w-4 h-4 text-blue-900 rounded focus:ring-blue-900"
                            />
                            <label htmlFor="aiEnabled" className="text-sm font-medium text-gray-900 cursor-pointer">
                                Enable AI Powered Insights & Reporting
                            </label>
                        </div>
                        {settings.aiEnabled && (
                            <div className="grid grid-cols-1 gap-4 pl-4 border-l-2 border-purple-200">
                                <FormInput
                                    label="OpenAI API Key"
                                    type="password"
                                    value={settings.openaiApiKey}
                                    onChange={(e) => setSettings({ ...settings, openaiApiKey: e.target.value })}
                                    placeholder="sk-..."
                                />
                                <FormSelect
                                    label="OpenAI Model"
                                    value={settings.openaiModel}
                                    onChange={(e: any) => setSettings({ ...settings, openaiModel: e.target.value })}
                                    options={[
                                        { value: "gpt-4o", label: "GPT-4o (Recommended)" },
                                        { value: "gpt-4o-mini", label: "GPT-4o Mini (Faster/Cheaper)" },
                                        { value: "gpt-4-turbo", label: "GPT-4 Turbo" },
                                        { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo" }
                                    ]}
                                />
                                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                                    <p className="text-xs text-yellow-800">
                                        <strong>Note:</strong> Your API key is stored securely. Get your API key from <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="underline">OpenAI Dashboard</a>
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>


                {/* System Management */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <Save className="w-5 h-5 text-blue-900" />
                        System Management
                    </h2>
                    <div className="space-y-4">
                        <div className="p-4 bg-gray-50 rounded-lg border border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div>
                                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-tight">Database Backup</h3>
                                <p className="text-xs text-gray-500 mt-1">Export all your business data to a JSON file for safety.</p>
                            </div>
                            <button
                                type="button"
                                onClick={async () => {
                                    try {
                                        window.location.href = '/api/settings/backup';
                                    } catch (error) {
                                        console.error("Backup failed:", error);
                                        alert("Backup failed. Please try again.");
                                    }
                                }}
                                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-900 text-white rounded-lg text-sm font-bold hover:bg-blue-800 transition-colors shadow-sm"
                            >
                                <Save className="w-4 h-4" />
                                Download Backup
                            </button>
                        </div>

                        <div className="p-4 bg-gray-50 rounded-lg border border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div>
                                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-tight">Manual Trigger Scheduler WA</h3>
                                <p className="text-xs text-gray-500 mt-1">Jalankan scheduler WA secara manual untuk memproses: (1) Follow-up service, (2) Blast campaigns, (3) Automation rules.</p>
                                <p className="text-[11px] text-red-600 font-bold mt-1">⚠️ Pesan WA sungguhan akan terkirim ke customer.</p>
                                {waPushResult && (
                                    <p className="text-xs text-gray-700 mt-2">
                                        Hasil: total {waPushResult.total}, sent {waPushResult.sent}, failed {waPushResult.failed}
                                    </p>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={handleTestWaPush}
                                disabled={waPushLoading}
                                className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-700 text-white rounded-lg text-sm font-bold hover:bg-emerald-600 transition-colors shadow-sm disabled:opacity-60"
                            >
                                <Send className="w-4 h-4" />
                                {waPushLoading ? "Processing..." : "Push WA Sekarang"}
                            </button>
                        </div>

                        <div className="p-4 bg-gray-50 rounded-lg border border-gray-100 flex flex-col gap-3">
                            <div>
                                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-tight">Reset Greeting Log</h3>
                                <p className="text-xs text-gray-500 mt-1">Hapus log nomor agar greeting bisa terkirim lagi dari awal.</p>
                            </div>

                            <div className="flex flex-col md:flex-row gap-2 md:items-center">
                                <input
                                    type="text"
                                    value={greetingPhone}
                                    onChange={(e) => setGreetingPhone(e.target.value)}
                                    placeholder="Contoh: 0895352281010"
                                    className="w-full md:max-w-sm px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                />
                                <button
                                    type="button"
                                    onClick={() => {
                                        void handleDeleteGreetingLog();
                                    }}
                                    disabled={deletingGreeting}
                                    className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-bold hover:bg-red-500 transition-colors shadow-sm disabled:opacity-60"
                                >
                                    <Trash2 className="w-4 h-4" />
                                    {deletingGreeting ? "Menghapus..." : "Hapus Nomor Ini"}
                                </button>
                                <button
                                    type="button"
                                    onClick={handleDeleteAllGreetingLogs}
                                    disabled={deletingAllGreeting}
                                    className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-gray-700 text-white rounded-lg text-sm font-bold hover:bg-gray-600 transition-colors shadow-sm disabled:opacity-60"
                                >
                                    <Trash2 className="w-4 h-4" />
                                    {deletingAllGreeting ? "Menghapus..." : "Hapus Semua Log"}
                                </button>
                                <button
                                    type="button"
                                    onClick={fetchGreetingLogs}
                                    disabled={loadingGreetingLogs}
                                    className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-700 text-white rounded-lg text-sm font-bold hover:bg-blue-600 transition-colors shadow-sm disabled:opacity-60"
                                >
                                    <RefreshCw className="w-4 h-4" />
                                    {loadingGreetingLogs ? "Memuat..." : "Refresh List"}
                                </button>
                            </div>

                            <div className="text-xs text-gray-600">
                                Total nomor tersimpan: <span className="font-semibold">{greetingLogTotal}</span>
                            </div>

                            <div className="max-h-56 overflow-auto border border-gray-200 rounded-lg bg-white">
                                {loadingGreetingLogs ? (
                                    <div className="p-3 text-xs text-gray-500">Memuat daftar nomor...</div>
                                ) : greetingLogs.length === 0 ? (
                                    <div className="p-3 text-xs text-gray-500">Belum ada nomor tersimpan.</div>
                                ) : (
                                    <ul className="divide-y divide-gray-100">
                                        {greetingLogs.map((log) => (
                                            <li key={log._id} className="p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                                                <div>
                                                    <p className="text-sm font-semibold text-gray-800">{log.phoneNormalized}</p>
                                                    <p className="text-[11px] text-gray-500">
                                                        Raw: {log.phoneRaw || '-'} | Greeting: {log.greetingSentAt ? new Date(log.greetingSentAt).toLocaleString('id-ID') : '-'}
                                                    </p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        void handleDeleteGreetingLog(log.phoneNormalized);
                                                    }}
                                                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-red-50 text-red-700 rounded text-xs font-semibold hover:bg-red-100"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" /> Hapus
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex justify-end">
                    <PermissionGate resource="settings" action="edit">
                        <FormButton
                            type="submit"
                            loading={saving}
                            icon={<Save className="w-5 h-5" />}
                        >
                            Save Settings
                        </FormButton>
                    </PermissionGate>
                </div>
            </form>
        </div>
    );
}