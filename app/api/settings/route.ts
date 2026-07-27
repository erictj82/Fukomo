import { getTenantModels } from "@/lib/tenantDb";
import { NextRequest, NextResponse } from 'next/server';

import { auth } from '@/auth';
import { checkPermissionWithSession } from '@/lib/rbac';
import { encryptFonnteToken, decryptFonnteToken } from '@/lib/encryption';

// GET /api/settings - Get store settings
export async function GET(request: NextRequest, props: any) {
    const tenantSlug = request.headers.get('x-store-slug') || 'pusat';
    const { Settings } = await getTenantModels(tenantSlug);

    try {
        

        // Check if user is authenticated for full settings access
        const session = await auth();

        // Find the first settings document
        let settings = await Settings.findOne();

        if (!settings) {
            settings = await Settings.create({
                storeName: 'SalonNext',
                currency: 'IDR',
                timezone: 'Asia/Jakarta',
                taxRate: 0
            });
        }

        // If not authenticated, only return basic public info
        if (!session) {
            return NextResponse.json({
                success: true,
                data: {
                    storeName: settings.storeName,
                    logoUrl: settings.logoUrl,
                    address: settings.address,
                    phone: settings.phone,
                    email: settings.email,
                    website: settings.website,
                    businessHours: settings.businessHours,
                    currency: settings.currency,
                    timezone: settings.timezone,
                    taxRate: settings.taxRate,
                    memberDiscountType: settings.memberDiscountType,
                    memberDiscountValue: settings.memberDiscountValue,
                    memberIncludedServices: settings.memberIncludedServices,
                    memberIncludedProducts: settings.memberIncludedProducts,
                    memberIncludedBundles: settings.memberIncludedBundles,
                    loyaltyPointValue: settings.loyaltyPointValue,
                    referralRewardPoints: settings.referralRewardPoints,
                    referralDiscountType: settings.referralDiscountType,
                    referralDiscountValue: settings.referralDiscountValue,
                    showCommissionInPOS: settings.showCommissionInPOS,
                    walletIncludedServices: settings.walletIncludedServices,
                    walletIncludedProducts: settings.walletIncludedProducts,
                    walletIncludedBundles: settings.walletIncludedBundles,
                    walletExpiryDays: settings.walletExpiryDays,
                    allowStaffDoubleBooking: settings.allowStaffDoubleBooking,
                    financialReportSections: settings.financialReportSections
                }
            });
        }

        // [B14 FIX] Inline permission check — session sudah ada dari auth() di atas, tidak perlu auth() kedua
        const isSuperAdmin = (session as any)?.user?.role === 'Super Admin' || (session as any)?.user?.role?.name === 'Super Admin';
        const canViewSettings = isSuperAdmin || ((session as any)?.user?.permissions?.settings?.view ?? 'none') !== 'none';
        if (!canViewSettings) {
            return NextResponse.json({ success: false, error: 'Access Denied: Cannot view settings' }, { status: 403 });
        }

        if (settings.fonnteToken) {
            settings.fonnteToken = decryptFonnteToken(settings.fonnteToken);
        }
        try {
            if (settings.balesotomatisApiKey) settings.balesotomatisApiKey = decryptFonnteToken(settings.balesotomatisApiKey);
            if (settings.balesotomatisSecretKey) settings.balesotomatisSecretKey = decryptFonnteToken(settings.balesotomatisSecretKey);
        } catch (e) {
            // field lama/kosong yang belum pernah dienkripsi - biarin apa adanya, jangan sampai GET /api/settings gagal total
        }
        return NextResponse.json({ success: true, data: settings });
    } catch (error: any) {
        console.error('Error fetching settings:', error);

        if (error?.name === 'MongooseServerSelectionError') {
            return NextResponse.json(
                {
                    success: false,
                    error: 'Database is unavailable. Please ensure MongoDB is running and MONGODB_URI is correct.'
                },
                { status: 503 }
            );
        }

        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}

// PUT /api/settings - Update store settings
export async function PUT(request: NextRequest, props: any) {
    const tenantSlug = request.headers.get('x-store-slug') || 'pusat';
    const { Settings } = await getTenantModels(tenantSlug);

    try {
        // [B14 FIX] Gunakan checkPermissionWithSession — 1 auth() call, bukan 2
        const { error: permissionError } = await checkPermissionWithSession(request, 'settings', 'edit');
        if (permissionError) return permissionError;

        const body = await request.json();

        const ALLOWED_FIELDS = [
            'storeName', 'address', 'phone', 'email', 'website', 'taxId', 'currency', 'timezone',
            'taxRate', 'logoUrl', 'businessHours', 'receiptFooter', 'showStaffOnReceipt',
            'showTaxAndTaxableAmountOnReceipt', 'showCommissionInPOS', 'walletBonusTiers',
            'walletIncludedServices', 'walletIncludedProducts', 'walletIncludedBundles',
            'termsAndConditions', 'membershipPrice', 'membershipDurationDays', 'birthdayVoucherId',
            'memberDiscountType', 'memberDiscountValue', 'memberIncludedServices',
            'memberIncludedProducts', 'memberIncludedBundles', 'loyaltyPointPerSpend',
            'loyaltyPointValue', 'referralRewardPoints', 'referralDiscountType', 'referralDiscountValue',
            'fonnteToken', 'waBlastNumber', 'waAdminNumber', 'waOwnerNumber', 'greetingEnabled',
            'membershipExpiryReminderDays', 'packageExpiryReminderDays', 'dailyReportTime',
            'waMembershipReminderTime', 'waPackageReminderTime', 'waStockAlertTime', 'waBirthdayNotifTime',
            'waTemplateStockAlert', 'waTemplateDailyReport', 'waTemplateMembershipExpiry',
            'waTemplatePackageExpiry', 'waOperationalHoursStart', 'waOperationalHoursEnd',
            'fonnteMaxDailyMessages', 'fonnteDeviceRegisteredAt', 'smsEnabled', 'twilioAccountSid',
            'twilioAuthToken', 'twilioPhoneNumber', 'emailEnabled', 'smtpHost', 'smtpPort',
            'smtpSecure', 'smtpUser', 'smtpPassword', 'smtpFrom', 'reminderDaysBefore',
            'reminderMethod', 'aiEnabled', 'openaiApiKey', 'openaiModel', 'walletExpiryDays',
            'financialReportSections', 'allowStaffDoubleBooking', 'stockAdjustmentPassword',
            'bankTransferPassword', 'ownerTransferPassword',
            'waAppointmentReminderEnabled', 'waAppointmentReminderMinutesBefore',
            'waAppointmentReminderDefaultTemplate', 'waNotaTemplate', 'waAdminNotaPrefix',
            'waProvider', 'balesotomatisMode', 'balesotomatisApiKey', 'balesotomatisNumberId',
            'balesotomatisSecretKey', 'balesotomatisLicensesKey'
        ];

        Object.keys(body).forEach(key => {
            if (!ALLOWED_FIELDS.includes(key)) {
                delete body[key];
            }
        });

        // Sanitize Mongoose ObjectIds that might be sent as empty strings
        if (body.fonnteToken) {
            body.fonnteToken = encryptFonnteToken(body.fonnteToken);
        }
        // encryptFonnteToken/decryptFonnteToken sebenernya generic AES encrypt/decrypt (lihat
        // lib/encryption.ts) - dipakein juga buat kredensial BalesOtomatis biar konsisten
        // disimpan terenkripsi, bukan bikin fungsi encrypt baru buat 2 field ini doang.
        if (body.balesotomatisApiKey) {
            body.balesotomatisApiKey = encryptFonnteToken(body.balesotomatisApiKey);
        }
        if (body.balesotomatisSecretKey) {
            body.balesotomatisSecretKey = encryptFonnteToken(body.balesotomatisSecretKey);
        }

        if (body.birthdayVoucherId === "") {
            body.birthdayVoucherId = null;
        }

        // Update the first document found (singleton pattern)
        // upsert: true ensures it creates one if it doesn't exist (though GET handles creation usually)
        const settings = await Settings.findOneAndUpdate(
            {},
            body,
            { new: true, upsert: true, runValidators: true }
        );

        if (settings.fonnteToken) {
            settings.fonnteToken = decryptFonnteToken(settings.fonnteToken);
        }
        try {
            if (settings.balesotomatisApiKey) {
                settings.balesotomatisApiKey = decryptFonnteToken(settings.balesotomatisApiKey);
            }
            if (settings.balesotomatisSecretKey) {
                settings.balesotomatisSecretKey = decryptFonnteToken(settings.balesotomatisSecretKey);
            }
        } catch (e) {
            console.error('Error decrypting balesotomatis credentials in PUT:', e);
        }
        return NextResponse.json({ success: true, data: settings });
    } catch (error: any) {
        console.error('Error updating settings:', error);

        if (error?.name === 'MongooseServerSelectionError') {
            return NextResponse.json(
                {
                    success: false,
                    error: 'Database is unavailable. Please ensure MongoDB is running and MONGODB_URI is correct.'
                },
                { status: 503 }
            );
        }

        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}
