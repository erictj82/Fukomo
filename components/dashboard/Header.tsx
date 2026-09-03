"use client";

import { useState, useRef, useEffect } from "react";
import { useParams } from "next/navigation";
import { User, Menu, ChevronLeft, ChevronRight, LogOut, Settings, Clock } from "lucide-react";
import TenantLink from '@/components/TenantLink';
import { signOut } from "next-auth/react";
import { usePermission } from "@/hooks/usePermission";
import CorrectionNotificationBell from "@/components/dashboard/CorrectionNotificationBell";

interface HeaderProps {
    toggleSidebar: () => void;
    toggleCollapse: () => void;
    isSidebarCollapsed: boolean;
    user?: {
        name?: string | null;
        email?: string | null;
    };
}

export default function Header({ toggleSidebar, toggleCollapse, isSidebarCollapsed, user }: HeaderProps) {
    const params = useParams();
    const slug = (params?.slug as string) || 'pusat';
    const [isProfileOpen, setIsProfileOpen] = useState(false);
    const [currentTime, setCurrentTime] = useState("");
    const [timezone, setTimezone] = useState("UTC");
    const [waGreetingEnabled, setWaGreetingEnabled] = useState(false);
    const [waGreetingName, setWaGreetingName] = useState("");
    const dropdownRef = useRef<HTMLDivElement>(null);
    const { canView } = usePermission();

    const fetchGreetingStatus = async () => {
        try {
            const res = await fetch('/api/wa/templates');
            const data = await res.json();

            if (!data?.success || !Array.isArray(data?.data)) {
                setWaGreetingEnabled(false);
                setWaGreetingName('');
                return;
            }

            const activeTemplate = data.data.find((tpl: any) => tpl?.isGreetingEnabled);
            if (activeTemplate) {
                setWaGreetingEnabled(true);
                setWaGreetingName(String(activeTemplate.name || 'Template Aktif'));
            } else {
                setWaGreetingEnabled(false);
                setWaGreetingName('');
            }
        } catch (error) {
            console.error('Failed to fetch WA greeting status', error);
            setWaGreetingEnabled(false);
            setWaGreetingName('');
        }
    };

    // Fetch timezone from settings
    useEffect(() => {
        const fetchTimezone = async () => {
            try {
                const res = await fetch('/api/settings', { cache: 'no-store' });
                if (!res.ok) return;
                const text = await res.text();
                if (!text) return;
                const data = JSON.parse(text);
                if (data.success && data.data?.timezone) {
                    setTimezone(data.data.timezone);
                }
            } catch (error) {
                console.error("Failed to fetch timezone", error);
            }
        };
        fetchTimezone();
    }, []);

    useEffect(() => {
        fetchGreetingStatus();

        const onGreetingStatusChanged = () => {
            void fetchGreetingStatus();
        };

        window.addEventListener("wa-greeting-status-changed", onGreetingStatusChanged);
        return () => {
            window.removeEventListener("wa-greeting-status-changed", onGreetingStatusChanged);
        };
    }, []);

    // Update time every second
    useEffect(() => {
        const updateTime = () => {
            const now = new Date();
            const timeString = new Intl.DateTimeFormat('en-US', {
                timeZone: timezone,
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: true
            }).format(now);
            setCurrentTime(timeString);
        };

        updateTime();
        const interval = setInterval(updateTime, 1000);
        return () => clearInterval(interval);
    }, [timezone]);

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsProfileOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    return (
        <header className="sticky top-0 z-30 flex items-center justify-between h-16 px-6 bg-white border-b border-gray-200">
            <div className="flex items-center">
                {/* Mobile menu button */}
                <button
                    onClick={toggleSidebar}
                    className="p-2 mr-4 text-gray-600 rounded-lg md:hidden hover:bg-gray-100"
                >
                    <span className="sr-only">Open menu</span>
                    <Menu className="w-6 h-6" />
                </button>

                {/* Desktop Collapse Button */}
                <button
                    onClick={toggleCollapse}
                    className="hidden md:flex p-2 text-gray-600 rounded-lg hover:bg-gray-100"
                >
                    {isSidebarCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
                </button>
            </div>

            <div className="flex items-center gap-6">
                <CorrectionNotificationBell />
                <TenantLink href="/wa-templates" className="hidden md:flex">
                    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${waGreetingEnabled
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                            : 'bg-red-50 border-red-200 text-red-700'
                        }`}>
                        <span className={`w-2.5 h-2.5 rounded-full ${waGreetingEnabled ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
                        <div className="flex flex-col leading-tight">
                            <span className="text-xs font-bold uppercase tracking-wide">WA Greeting {waGreetingEnabled ? 'ON' : 'OFF'}</span>
                            <span className="text-[11px]">{waGreetingEnabled ? waGreetingName : 'Belum aktif'}</span>
                        </div>
                    </div>
                </TenantLink>

                {/* Time and Timezone Display */}
                <div className="hidden md:flex items-center gap-2 px-4 py-2 bg-blue-50 rounded-lg border border-blue-100">
                    <Clock className="w-4 h-4 text-blue-900" />
                    <div className="flex flex-col">
                        <span className="text-sm font-semibold text-blue-900">{currentTime}</span>
                        <span className="text-xs text-blue-600">{timezone}</span>
                    </div>
                </div>

                {/* Profile Dropdown */}
                <div className="relative" ref={dropdownRef}>
                    <button
                        onClick={() => setIsProfileOpen(!isProfileOpen)}
                        className="flex items-center space-x-2 focus:outline-none"
                    >
                        <div className="w-8 h-8 rounded-full bg-blue-900 flex items-center justify-center text-white font-bold">
                            <User className="w-5 h-5" />
                        </div>
                        {user?.name ? (
                            <span className="text-sm font-medium text-gray-700">{user.name}</span>
                        ) : (
                            <User className="w-5 h-5 text-gray-700" />
                        )}
                    </button>

                    {isProfileOpen && (
                        <div className="absolute right-0 z-10 w-48 mt-2 origin-top-right bg-white border border-gray-200 rounded-md shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                            <div className="py-1">
                                <div className="px-4 py-2 border-b border-gray-100">
                                    <p className="text-sm font-medium text-gray-900">{user?.name || "User"}</p>
                                    <p className="text-xs text-gray-500 truncate">{user?.email || ""}</p>
                                </div>
                                <TenantLink href="/profile" className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                                    <User className="w-4 h-4 mr-2" />
                                    Profile
                                </TenantLink>
                                {canView('settings') && (
                                    <TenantLink href="/settings" className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                                        <Settings className="w-4 h-4 mr-2" />
                                        Settings
                                    </TenantLink>
                                )}

                                <button
                                    onClick={() => signOut({ callbackUrl: `/${slug}/login` })}
                                    className="flex w-full items-center px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                                >
                                    <LogOut className="w-4 h-4 mr-2" />
                                    Logout
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </header >
    );
}
