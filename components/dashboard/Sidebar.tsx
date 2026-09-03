"use client";

import { useState, useEffect } from "react";
import TenantLink from '@/components/TenantLink';
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Users,
  Settings,
  X,
  LogOut,
  Truck,
  DollarSign,
  ClipboardList,
  Tag,
  BarChart3,
  Shield,
  Sparkles,
  UserCircle,
  FileText,
  History,
  ShoppingBasket,
  Clock,
  Activity,
  QrCode,
  MessageSquare,
  Gift,
  Crown,
  FileSpreadsheet,
  Megaphone,
  Wallet,
  CreditCard,
} from "lucide-react";
import { usePermission } from "@/hooks/usePermission";
import { signOut } from "next-auth/react";

interface SidebarProps {
  isSidebarOpen: boolean;
  isSidebarCollapsed: boolean;
  toggleSidebar: () => void;
}

// Organized menu structure with sections
// Organized menu structure with sections
const menuSections = [
  {
    title: "Main",
    items: [
      { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { name: "Appointments", href: "/appointments", icon: ClipboardList },
      { name: "Calendar", href: "/appointments/calendar", icon: Clock },
      { name: "POS", href: "/pos", icon: ShoppingCart },
      { name: "Invoices", href: "/invoices", icon: FileText },
      { name: "Correction Requests", href: "/corrections", icon: ClipboardList },
    ],
  },
  {
    title: "Management",
    items: [
      { name: "Services", href: "/services", icon: Tag },
      { name: "WA Templates", href: "/wa-templates", icon: MessageSquare },
      { name: "WA Marketing", href: "/wa-marketing", icon: Megaphone },
      { name: "Packages", href: "/packages", icon: Package },
      { name: "Bundles", href: "/bundles", icon: Package },
      { name: "Products", href: "/products", icon: Package },
      { name: "Vouchers", href: "/vouchers", icon: Gift },
      { name: "Purchases", href: "/purchases", icon: ShoppingBasket },
      { name: "Usage Logs", href: "/usage-logs", icon: History },
    ],
  },
  {
    title: "People",
    items: [
      { name: "Staff", href: "/staff", icon: UserCircle },
      { name: "Customers", href: "/customers", icon: Users },
      { name: "Suppliers", href: "/suppliers", icon: Truck },
      { name: "Staff Slots", href: "/staff-slots", icon: Clock },
    ],
  },
  {
    title: "Finance",
    items: [
      { name: "Cash Drawer", href: "/cash-drawer", icon: Wallet },
      { name: "E-Wallet", href: "/wallet", icon: CreditCard },
      { name: "Payroll", href: "/payroll", icon: DollarSign },
      { name: "Expenses", href: "/expenses", icon: DollarSign },
      { name: "QRIS", href: "/payments/qris", icon: QrCode },
      { name: "Reports", href: "/reports", icon: BarChart3 },
      { name: "AI Reports", href: "/ai-reports", icon: Sparkles },
    ],
  },
  {
    title: "Admin",
    items: [
      { name: "Import / Export", href: "/import-export", icon: FileSpreadsheet },
      { name: "Users", href: "/users", icon: Users },
      { name: "Roles", href: "/roles", icon: Shield },
      { name: "Activity Log", href: "/reports/activity-log", icon: Activity },
      { name: "Membership", href: "/membership", icon: Crown },
      { name: "Settings", href: "/settings", icon: Settings },
    ],
  },
];

export default function Sidebar({
  isSidebarOpen,
  isSidebarCollapsed,
  toggleSidebar,
}: SidebarProps) {
  const pathname = usePathname();
  const { canView, canCreate, canEdit } = usePermission();
  const [storeName, setStoreName] = useState("SalonNext");

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await fetch("/api/settings");
      const data = await res.json();
      if (data.success && data.data?.storeName) {
        setStoreName(data.data.storeName);
      }
    } catch (error) {
      console.error("Error fetching settings:", error);
    }
  };

  // Map menu items to their resource keys for permission checking
  const getResourceKey = (name: string): string | null => {
    const map: Record<string, string> = {
      Dashboard: "dashboard",
      Appointments: "appointments",
      POS: "pos",
      Services: "services",
      "WA Templates": "waTemplates",
      "WA Marketing": "customers",
      Packages: "packages",
      Bundles: "bundles",
      Products: "products",
      Membership: "membership",
      Vouchers: "vouchers",
      Purchases: "purchases",
      "Usage Logs": "usageLogs",
      Staff: "staff",
      "Staff Slots": "staffSlots",
      Customers: "customers",
      Suppliers: "suppliers",
      "Cash Drawer": "pos",
      "E-Wallet": "customers",
      Payroll: "payroll",
      Expenses: "expenses",
      QRIS: "invoices",
      Reports: "reports",
      "Import / Export": "settings",
      Users: "users",
      Roles: "roles",
      Settings: "settings",
      Invoices: "invoices",
      "Correction Requests": "corrections",
      "AI Reports": "aiReports",
      "Activity Log": "activityLogs",
      Calendar: "calendarView",
    };
    return map[name] || null;
  };

  // Filter sections and their items based on permissions
  const filteredSections = menuSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        const resource = getResourceKey(item.name);
        if (!resource) return true;
        if (item.name === "Correction Requests") {
          return canView(resource) || canCreate(resource) || canEdit(resource);
        }
        return canView(resource);
      }),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 bg-[#F9F6F0] border-r border-gray-200 transition-all duration-300 transform flex flex-col shadow-xl
        ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"}
        md:translate-x-0
        ${isSidebarCollapsed ? "w-20" : "w-64"}
      `}
    >
      {/* Premium Header */}
      <div
        className={`relative h-20 border-b border-gray-100 ${isSidebarCollapsed ? "px-2" : "px-5"}`}
      >
        <div
          className={`relative h-full flex items-center ${isSidebarCollapsed ? "justify-center" : "justify-between"}`}
        >
          {!isSidebarCollapsed ? (
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900 tracking-tight">
                  {storeName}
                </h1>
                <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">
                  Business Suite
                </p>
              </div>
            </div>
          ) : (
            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
          )}

          {/* Mobile Close Button */}
          <button
            onClick={toggleSidebar}
            className="md:hidden p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
        {filteredSections.map((section, sectionIndex) => (
          <div key={section.title} className={sectionIndex > 0 ? "mt-6" : ""}>
            {/* Section Title */}
            {!isSidebarCollapsed && (
              <div className="px-3 mb-2">
                <h2 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  {section.title}
                </h2>
              </div>
            )}
            {isSidebarCollapsed && sectionIndex > 0 && (
              <div className="my-3 mx-2 border-t border-slate-700/50"></div>
            )}

            <ul className="space-y-1">
              {section.items.map((item) => {
                const isActive =
                  pathname === item.href ||
                  pathname.startsWith(item.href + "/");
                return (
                  <li key={item.name}>
                    <TenantLink
                      href={item.href}
                      title={isSidebarCollapsed ? item.name : ""}
                      className={`group flex items-center px-3 py-2.5 text-sm rounded-xl transition-all duration-200
                                                ${
                                                  isActive
                                                    ? "bg-[#F4ECE1] text-[#2D251C] shadow-sm font-bold border border-[#EBE3D5]"
                                                    : "font-medium text-[#7A6B5D] hover:bg-[#F0EBE1] hover:text-[#2D251C]"
                                                } ${isSidebarCollapsed ? "justify-center" : ""}`}
                    >
                      <item.icon
                        className={`w-5 h-5 flex-shrink-0 transition-transform duration-200 group-hover:scale-110
                                                ${isActive ? "text-[#8B7355]" : "text-[#A89F91] group-hover:text-[#8B7355]"}
                                                ${isSidebarCollapsed ? "" : "mr-3"}`}
                      />
                      {!isSidebarCollapsed && (
                        <span className="truncate">{item.name}</span>
                      )}
                      {isActive && !isSidebarCollapsed && (
                        <div className="ml-auto w-1 h-1 bg-white rounded-full"></div>
                      )}
                    </TenantLink>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer with Logout */}
      <div className="p-3 border-t border-gray-100 bg-gray-50/50">
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className={`flex items-center w-full px-3 py-2.5 text-sm font-medium text-red-500 rounded-xl hover:bg-red-50 hover:text-red-700 transition-all duration-200 ${isSidebarCollapsed ? "justify-center" : ""}`}
          title={isSidebarCollapsed ? "Logout" : ""}
        >
          <LogOut className={`w-5 h-5 ${isSidebarCollapsed ? "" : "mr-3"}`} />
          {!isSidebarCollapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
  );
}
