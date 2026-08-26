
"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface Settings {
    storeName: string;
    currency: string;
    timezone: string;
    taxRate: number;
    logoUrl: string;
    symbol: string;
    memberDiscountType?: "percentage" | "nominal";
    memberDiscountValue?: number;
    memberIncludedServices?: string[];
    memberIncludedProducts?: string[];
    memberIncludedBundles?: string[];
    loyaltyPointValue?: number;
    referralRewardPoints?: number;
    referralDiscountType?: "percentage" | "nominal";
    referralDiscountValue?: number;
    showCommissionInPOS?: boolean;
    walletIncludedServices?: string[];
    walletIncludedProducts?: string[];
    walletIncludedBundles?: string[];
    walletExpiryDays?: number;
    financialReportSections?: {
      totalSales: boolean;
      totalCollected: boolean;
      purchases: boolean;
      expenses: boolean;
      payroll: boolean;
      walletTopups: boolean;
      netProfit: boolean;
      cashFlow: boolean;
    };
    allowStaffDoubleBooking?: boolean;
    stockAdjustmentPassword?: string;
    bankTransferPassword?: string;
    ownerTransferPassword?: string;
    acquisitionSources?: string[];
}

interface SettingsContextType {
    settings: Settings;
    loading: boolean;
    refreshSettings: () => Promise<void>;
}

const defaultSettings: Settings = {
    storeName: 'SalonNext',
    currency: 'IDR',
    timezone: 'Asia/Jakarta',
    taxRate: 0,
    logoUrl: '',
    symbol: 'Rp',
    allowStaffDoubleBooking: false,
    stockAdjustmentPassword: '',
    bankTransferPassword: '',
    ownerTransferPassword: '',
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
    const [settings, setSettings] = useState<Settings>(defaultSettings);
    const [loading, setLoading] = useState(true);

    const fetchSettings = async () => {
        try {
            const res = await fetch('/api/settings', { cache: 'no-store' });
            const text = await res.text();
            let data;
            try {
                data = JSON.parse(text);
            } catch (e) {
                console.error(`Settings fetch failed. Status: ${res.status}. Body: "${text}"`);
                setLoading(false);
                return;
            }
            if (data.success) {
                // Get currency symbol from our utility
                const { getCurrencySymbol } = await import('@/lib/currency');
                const symbol = getCurrencySymbol(data.data.currency || 'IDR');

                setSettings({
                    storeName: data.data.storeName || 'SalonNext',
                    currency: data.data.currency || 'IDR',
                    timezone: data.data.timezone || 'Asia/Jakarta',
                    taxRate: data.data.taxRate || 0,
                    logoUrl: data.data.logoUrl || '',
                    symbol: symbol,
                    memberDiscountType: data.data.memberDiscountType || "percentage",
                    memberDiscountValue: data.data.memberDiscountValue || 0,
                    memberIncludedServices: data.data.memberIncludedServices || [],
                    memberIncludedProducts: data.data.memberIncludedProducts || [],
                    memberIncludedBundles: data.data.memberIncludedBundles || [],
                    loyaltyPointValue: data.data.loyaltyPointValue || 0,
                    referralRewardPoints: data.data.referralRewardPoints || 0,
                    referralDiscountType: data.data.referralDiscountType || "nominal",
                    referralDiscountValue: data.data.referralDiscountValue || 0,
                    showCommissionInPOS: data.data.showCommissionInPOS === true,
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
                    stockAdjustmentPassword: data.data.stockAdjustmentPassword || '',
                    bankTransferPassword: data.data.bankTransferPassword || '',
                    ownerTransferPassword: data.data.ownerTransferPassword || '',
                    acquisitionSources: data.data.acquisitionSources || [],
                });
            }
        } catch (error) {
            console.error('Error fetching settings:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSettings();
    }, []);

    return (
        <SettingsContext.Provider value={{ settings, loading, refreshSettings: fetchSettings }}>
            {children}
        </SettingsContext.Provider>
    );
}

export function useSettings() {
    const context = useContext(SettingsContext);
    if (context === undefined) {
        throw new Error('useSettings must be used within a SettingsProvider');
    }
    return context;
}
