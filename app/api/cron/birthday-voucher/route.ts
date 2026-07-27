import { getTenantModels } from "@/lib/tenantDb";
import { NextRequest, NextResponse } from "next/server";



import { decryptFonnteToken } from '@/lib/encryption';
import { sendWhatsApp } from "@/lib/fonnte";


// GET /api/cron/birthday-voucher
// Called daily by external cron (crontab / cron-job.org)
export async function GET(request: NextRequest, props: any) {
  const tenantSlug = request.headers.get('x-store-slug') || 'pusat';
  const { Customer, Settings, Voucher } = await getTenantModels(tenantSlug);

  try {
    // Optional: protect with a secret key
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }



    const settings = await Settings.findOne();

    // === OPERATIONAL HOURS CHECK (dynamic dari DB) ===
    const { checkOperationalHours, checkScheduleTime } = await import('@/lib/waOperationalHours');
    const opCheck = checkOperationalHours(settings || {});
    if (!opCheck.allowed) {
        return NextResponse.json({
            success: true,
            message: `Skipped: ${opCheck.reason}`,
            sent: 0,
            skipped: true,
        });
    }

    // === SCHEDULE TIME CHECK ===
    const bdayTime = settings?.waBirthdayNotifTime || '08:00';
    const schedCheck = checkScheduleTime(bdayTime);
    if (!schedCheck.ready) {
        return NextResponse.json({
            success: true,
            message: `Skipped: ${schedCheck.reason}`,
            sent: 0,
            skipped: true,
        });
    }
    // === END CHECK ===

    if (!settings?.birthdayVoucherId) {
      return NextResponse.json({
        success: true,
        message: "Birthday voucher belum diatur di Settings",
        sent: 0,
      });
    }

    // [B09 FIX] Ambil fonnteToken dari settings agar WA bisa terkirim
    const { getWaProviderConfigFromSettings } = require('@/lib/waProvider');
                const waConfig = getWaProviderConfigFromSettings(settings);

    const voucher = await Voucher.findById(settings.birthdayVoucherId);
    if (!voucher || !voucher.isActive) {
      return NextResponse.json({
        success: true,
        message: "Voucher birthday tidak aktif atau tidak ditemukan",
        sent: 0,
      });
    }

    const today = new Date();
    const currentMonth = today.getMonth() + 1; // 1-12
    const currentDay = today.getDate();
    const currentYear = today.getFullYear();

    // Find premium customers whose birthday is today and haven't received voucher this year
    const customers = await Customer.find({
      membershipTier: "premium",
      birthday: { $exists: true, $ne: null },
      status: "active",
      $or: [
        { birthdayVoucherSentYear: { $exists: false } },
        { birthdayVoucherSentYear: { $ne: currentYear } },
      ],
    });

    const birthdayCustomers = customers.filter((c) => {
      const bday = new Date(c.birthday);
      return bday.getMonth() + 1 === currentMonth && bday.getDate() === currentDay;
    });

    let sentCount = 0;
    const errors: string[] = [];

    for (const customer of birthdayCustomers) {
      if (!customer.phone) continue;

      try {
        const message =
          `🎂 *Selamat Ulang Tahun, ${customer.name}!* 🎉\n\n` +
          `Sebagai hadiah dari kami untuk member premium, gunakan kode voucher berikut:\n\n` +
          `🎁 Kode: *${voucher.code}*\n` +
          `💰 Diskon: ${voucher.discountType === "percentage" ? `${voucher.discountValue}%` : `Rp${voucher.discountValue.toLocaleString("id-ID")}`}\n` +
          (voucher.expiresAt ? `📅 Berlaku sampai: ${new Date(voucher.expiresAt).toLocaleDateString("id-ID")}\n` : "") +
          `\nTerima kasih sudah menjadi member premium kami! 💕\n- ${settings.storeName || "Salon"}`;

        const result = await sendWhatsApp(customer.phone, message, waConfig);

        if (result.success) {
          // Mark as sent for this year
          customer.birthdayVoucherSentYear = currentYear;
          await customer.save();
          sentCount++;
        } else {
          errors.push(`${customer.name}: ${result.error}`);
        }
      } catch (err: any) {
        errors.push(`${customer.name}: ${err.message}`);
      }

      // BLOCK-01 FIX: Delay aman 8-15 detik antar pengiriman
      await new Promise((r) => setTimeout(r, 8000 + Math.floor(Math.random() * 7000)));
    }



    return NextResponse.json({
      success: true,
      message: `Birthday voucher sent to ${sentCount} customer(s)`,
      sent: sentCount,
      total: birthdayCustomers.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error("Birthday voucher cron error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Cron failed" },
      { status: 500 }
    );
  }
}