import { getMasterModels } from '@/lib/masterDb';
import { getTenantModels } from '@/lib/tenantDb';
import type { SaasBillingPeriod } from '@/models/SaasPlan';

// Diekstrak dari app/api/admin/registrations/[id]/route.ts (logic-nya SAMA PERSIS,
// cuma dipindah biar bisa dipanggil dari 2 tempat: route PIN lama (manual approve)
// dan internal API baru /api/internal/saas/registrations/[id]/approve (bakal dipanggil
// PHP admin panel, dan nantinya juga dari payment webhook buat auto-provisioning).
//
// TIDAK ada perubahan behavior buat flow yang sudah ada — cuma nambah langkah opsional
// "assign TenantSubscription" kalau planId dikasih (blueprint section 4, baris terakhir).

export interface ApproveRegistrationOptions {
    planId?: string;
    billingPeriod?: SaasBillingPeriod;
}

export type ApproveRegistrationResult =
    | {
          ok: true;
          storeId: string;
          slug: string;
          storeName: string;
          loginUrl: string;
          subscriptionId?: string;
          subscriptionExpiresAt?: Date;
      }
    | { ok: false; status: number; error: string };

export type RejectRegistrationResult = { ok: true } | { ok: false; status: number; error: string };

export async function approveRegistration(
    registrationId: string,
    options: ApproveRegistrationOptions = {}
): Promise<ApproveRegistrationResult> {
    const master = await getMasterModels();
    const registration = await master.Registration.findById(registrationId).select('+hashedPassword');

    if (!registration) {
        return { ok: false, status: 404, error: 'Pendaftaran tidak ditemukan' };
    }

    if (registration.status !== 'pending') {
        return { ok: false, status: 400, error: 'Pendaftaran sudah diproses' };
    }

    const adminSettings = await master.AdminSettings.findOne();
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';

    // 1. Create Store in Master DB
    const cleanSlug = registration.slug.replace(/[^a-z0-9-]/g, '');

    const existingStore = await master.Store.findOne({ slug: cleanSlug });
    if (existingStore) {
        return { ok: false, status: 400, error: 'Slug cabang sudah digunakan.' };
    }

    const baseUri = process.env.MONGODB_URI;
    if (!baseUri) throw new Error('MONGODB_URI is missing');

    const url = new URL(baseUri);
    const uniqueSuffix = Date.now().toString(36);
    url.pathname = `/salon_${cleanSlug}_${uniqueSuffix}`;
    const dbUri = url.toString();

    // 2. Kalau planId dikasih, siapin subscription data DULU sebelum create Store,
    // biar Store bisa langsung dibuat dengan subscriptionStatus/subscriptionExpiresAt
    // ke-cache dari awal (section 3 blueprint) - gak perlu update terpisah.
    let subscriptionPlan: any = null;
    let pricingOption: any = null;
    let subscriptionExpiresAt: Date | null = null;

    if (options.planId) {
        if (!options.billingPeriod) {
            return { ok: false, status: 400, error: 'billingPeriod wajib diisi kalau planId dikasih.' };
        }
        subscriptionPlan = await master.SaasPlan.findById(options.planId);
        if (!subscriptionPlan || !subscriptionPlan.isActive) {
            return { ok: false, status: 400, error: 'SaasPlan tidak ditemukan atau tidak aktif.' };
        }
        pricingOption = subscriptionPlan.pricingOptions.find(
            (p: any) => p.billingPeriod === options.billingPeriod
        );
        if (!pricingOption) {
            return {
                ok: false,
                status: 400,
                error: `Plan "${subscriptionPlan.name}" tidak punya opsi harga untuk periode "${options.billingPeriod}".`,
            };
        }
        subscriptionExpiresAt = new Date(Date.now() + pricingOption.billingPeriodDays * 24 * 60 * 60 * 1000);
    }

    // Store dibuat dengan subscriptionStatus null DULU (belum "active"). Baru di-flip
    // ke active SETELAH TenantSubscription beneran kebuat (C2) — biar enforcement gak
    // pernah lihat store "active" yang subscription record-nya belum ada. Kalau ada
    // langkah yang gagal di bawah, Store + subscription di-rollback (C1) biar gak orphan.
    const newStore = await master.Store.create({
        name: registration.storeName,
        slug: cleanSlug,
        dbUri,
        isActive: true,
        subscriptionStatus: null,
        subscriptionExpiresAt: null,
    });

    let subscriptionId: string | undefined;

    try {
        // 3. Create Tenant DB + Super Admin (persis logic lama, gak diubah)
        const { User, Role } = await getTenantModels(cleanSlug);

        const standardResources = ['appointments', 'pos', 'services', 'products', 'purchases', 'usageLogs', 'staff', 'staffSlots', 'customers', 'suppliers', 'payroll', 'expenses', 'reports', 'users', 'roles', 'invoices', 'activityLogs', 'calendarView'];
        const allPermissions: any = { dashboard: { view: true }, settings: { view: true, edit: true }, aiReports: { view: true } };
        standardResources.forEach((resource) => {
            allPermissions[resource] = { view: 'all', create: true, edit: true, delete: true };
        });

        const superAdminRole = await Role.findOneAndUpdate(
            { name: 'Super Admin' },
            { $setOnInsert: { name: 'Super Admin', description: 'Full access to all system resources', isSystem: true }, $set: { permissions: allPermissions } },
            { upsert: true, new: true }
        );

        await User.collection.insertOne({
            name: registration.ownerName,
            email: registration.email,
            password: registration.hashedPassword,
            role: superAdminRole._id,
            createdAt: new Date(),
            updatedAt: new Date(),
            __v: 0,
        });

        // 4. Assign TenantSubscription (langkah baru, cuma jalan kalau planId dikasih),
        // DIBUAT SEBELUM Store di-flip ke active.
        if (subscriptionPlan && pricingOption && subscriptionExpiresAt) {
            const subscription = await master.TenantSubscription.create({
                storeId: newStore._id,
                planId: subscriptionPlan._id,
                planSnapshot: {
                    name: subscriptionPlan.name,
                    code: subscriptionPlan.code,
                    limits: subscriptionPlan.limits,
                },
                billingPeriod: options.billingPeriod,
                pricePaid: pricingOption.price,
                status: 'active',
                startDate: new Date(),
                expiresAt: subscriptionExpiresAt,
                activeAddOns: [],
                autoRenew: true,
            });
            subscriptionId = subscription._id.toString();

            // 5. Baru sekarang Store boleh "active" — subscription record udah pasti ada (C2).
            newStore.subscriptionStatus = 'active';
            newStore.subscriptionExpiresAt = subscriptionExpiresAt;
            await newStore.save();
        }

        // 6. Update registration status — PALING AKHIR. Kalau attempt gagal sebelum sini,
        // registration tetep 'pending' (bisa di-approve ulang) + hashedPassword masih utuh.
        registration.status = 'approved';
        registration.hashedPassword = 'cleared';
        await registration.save();
    } catch (err) {
        // Rollback biar gak ninggalin orphan: hapus subscription (kalau terlanjur dibuat)
        // lalu hapus Store. Tenant DB pakai suffix unik (Date.now) jadi approve ulang bikin
        // DB baru — stray DB lama dibiarkan (cleanup ops manual, gak nge-block retry).
        try {
            if (subscriptionId) {
                await master.TenantSubscription.deleteOne({ _id: subscriptionId });
            }
            await master.Store.deleteOne({ _id: newStore._id });
        } catch (rollbackErr) {
            console.error('approveRegistration rollback gagal (butuh cleanup manual):', rollbackErr);
        }
        throw err;
    }

    // 6. Send WA (persis logic lama - masih langsung ke Fonnte, belum lewat lib/waProvider
    // abstraction. Itu bagian dari task terpisah "swap WA provider", bukan task ini.)
    const loginUrl = `${baseUrl}/${registration.slug}/login`;
    if (adminSettings?.fonnteToken && registration.phone) {
        const message = `✅ *Selamat!* Pendaftaran toko *${registration.storeName}* telah disetujui.\n\nSilakan login ke sistem kasir Anda di:\n${loginUrl}\n\nEmail: ${registration.email}\n(Gunakan password yang Anda daftarkan)`;
        fetch('https://api.fonnte.com/send', {
            method: 'POST',
            headers: { Authorization: adminSettings.fonnteToken, 'Content-Type': 'application/json' },
            body: JSON.stringify({ target: registration.phone, message }),
        }).catch((e) => console.error('Fonnte send error:', e));
    }

    return {
        ok: true,
        storeId: newStore._id.toString(),
        slug: cleanSlug,
        storeName: registration.storeName,
        loginUrl,
        subscriptionId,
        subscriptionExpiresAt: subscriptionExpiresAt ?? undefined,
    };
}

export async function rejectRegistration(
    registrationId: string,
    rejectionReason?: string
): Promise<RejectRegistrationResult> {
    const master = await getMasterModels();
    const registration = await master.Registration.findById(registrationId).select('+hashedPassword');

    if (!registration) {
        return { ok: false, status: 404, error: 'Pendaftaran tidak ditemukan' };
    }

    if (registration.status !== 'pending') {
        return { ok: false, status: 400, error: 'Pendaftaran sudah diproses' };
    }

    const adminSettings = await master.AdminSettings.findOne();

    registration.status = 'rejected';
    registration.rejectionReason = rejectionReason || 'Tidak ada alasan.';
    registration.hashedPassword = 'cleared';
    await registration.save();

    if (adminSettings?.fonnteToken && registration.phone) {
        const message = `❌ Mohon maaf, pendaftaran toko *${registration.storeName}* belum dapat disetujui saat ini.\n\nAlasan: ${rejectionReason || '-'}\n\nSilakan hubungi admin untuk informasi lebih lanjut.`;
        fetch('https://api.fonnte.com/send', {
            method: 'POST',
            headers: { Authorization: adminSettings.fonnteToken, 'Content-Type': 'application/json' },
            body: JSON.stringify({ target: registration.phone, message }),
        }).catch((e) => console.error('Fonnte send error:', e));
    }

    return { ok: true };
}
