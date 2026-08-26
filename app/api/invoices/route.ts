import { getTenantModels } from "@/lib/tenantDb";
import { NextRequest, NextResponse } from "next/server";
import { checkPermissionWithSession } from "@/lib/rbac";
import { generateInvoiceNumber } from "@/lib/invoiceNumber";





import { logActivity } from "@/lib/logger";
import { scheduleFollowUp } from "@/lib/waFollowUp";
import { normalizeIndonesianPhone } from "@/lib/phone";
import { decryptFonnteToken } from '@/lib/encryption';
import { sendWhatsApp } from "@/lib/fonnte";
import { getStoreIdBySlug, tryConsumeUsage, refundUsage } from "@/lib/subscriptionEnforcement";


import { auth } from "@/auth";

const SPLIT_TOLERANCE = 0.01;

const toNum = (value: unknown): number => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const validateSplitAssignments = (
  assignments: any[],
): { valid: boolean; error?: string } => {
  if (!Array.isArray(assignments) || assignments.length === 0) {
    return { valid: true };
  }

  const ids = assignments
    .map((entry) => String(entry?.staffId || entry?.staff || "").trim())
    .filter(Boolean);

  if (ids.length !== new Set(ids).size) {
    return {
      valid: false,
      error: "Duplicate staff is not allowed in split commission assignments",
    };
  }

  const total = assignments.reduce(
    (sum, entry) => sum + toNum(entry?.porsiPersen ?? entry?.percentage),
    0,
  );
  const hasNegative = assignments.some(
    (entry) => toNum(entry?.porsiPersen ?? entry?.percentage) < 0,
  );
  if (hasNegative) {
    return {
      valid: false,
      error: "Porsi split staff tidak boleh negatif.",
    };
  }

  if (Math.abs(total - 100) > SPLIT_TOLERANCE) {
    return {
      valid: false,
      error: "Split commission percentage must total 100%",
    };
  }

  return { valid: true };
};

const normalizeSplitAssignments = (assignments: any[] = []) => {
  return assignments.map((entry) => {
    const staffId = entry?.staffId || entry?.staff;
    const porsiPersen = toNum(entry?.porsiPersen ?? entry?.percentage);
    const komisiNominal = toNum(entry?.komisiNominal ?? entry?.commission);

    return {
      ...entry,
      staff: staffId,
      staffId,
      percentage: porsiPersen,
      porsiPersen,
      commission: komisiNominal,
      komisiNominal,
    };
  });
};

export async function POST(request: NextRequest, props: any) {
  const tenantSlug = request.headers.get('x-store-slug') || 'pusat';
  const { Invoice, Customer, Product, Service, Settings, CashBalance, CashLog, WalletTransaction, LoyaltyTransaction, Voucher, StockLog, Deposit, Appointment } = await getTenantModels(tenantSlug);

  // A4 refund-guard: diangkat ke luar try biar finally bisa akses. Kuota transaksi
  // di-consume lebih awal (sebelum validasi & create invoice), jadi kalau checkout gagal
  // SEBELUM invoice ke-commit, kuotanya harus dibalikin di finally biar gak kepotong sia-sia.
  let storeId: string | null = null;
  let usageConsumed = false;
  let usageCommitted = false;

  try {


    // Security Check — checkout dilakukan dari POS, bukan halaman manajemen invoice
    // [B14 FIX] Gunakan checkPermissionWithSession — 1 auth() call untuk seluruh POST handler
    const { error: permissionError, session: posSession } = await checkPermissionWithSession(request, "pos", "create");
    if (permissionError) return permissionError;

    // SaaS plan enforcement (blueprint section 4 - "titik create invoice/transaksi").
    // Behavior sesuai keputusan client: kalau limit transaksi bulan ini kelampauan,
    // transaksi BARU diblok total (bukan warning) - frontend POS perlu nangkep
    // error.code === 'TRANSACTION_LIMIT_EXCEEDED' ini dan arahin ke halaman upgrade/add-on.
    storeId = await getStoreIdBySlug(tenantSlug);
    if (storeId) {
        const usageCheck = await tryConsumeUsage(storeId, 'transaction', 1);
        if (!usageCheck.allowed) {
            return NextResponse.json(
                {
                    success: false,
                    error:
                        usageCheck.reason === 'no_active_subscription'
                            ? 'Toko belum punya langganan aktif.'
                            : `Batas transaksi bulan ini (${usageCheck.limit}) sudah tercapai. Upgrade paket atau beli add-on untuk melanjutkan.`,
                    code: usageCheck.reason === 'no_active_subscription' ? 'NO_ACTIVE_SUBSCRIPTION' : 'TRANSACTION_LIMIT_EXCEEDED',
                    currentUsage: usageCheck.currentUsage,
                    limit: usageCheck.limit,
                },
                { status: 403 }
            );
        }
        usageConsumed = true; // kuota transaksi udah kepotong 1 di titik ini
    }
    // storeId null berarti tenant ini belum ke-link ke Store manapun (kondisi ganjil/legacy) -
    // sengaja TIDAK diblokir daripada nge-lockout toko yang datanya belum lengkap.

    const body = await request.json();
    const systemSettingsDoc = await Settings.findOne().lean() as any;
    const settings = systemSettingsDoc || {};

    if (toNum(body.totalAmount) < 0 || toNum(body.amountPaid) < 0 || toNum(body.discount) < 0 || toNum(body.tax) < 0 || toNum(body.loyaltyPointsUsed) < 0) {
      return NextResponse.json({ success: false, error: "Nilai nominal tidak boleh negatif." }, { status: 400 });
    }

    const normalizedBody = {
      ...body,
      followUpPhoneNumber:
        normalizeIndonesianPhone(body?.followUpPhoneNumber) || undefined,
      staffAssignments: normalizeSplitAssignments(body.staffAssignments || []),
      items: Array.isArray(body.items)
        ? body.items.map((item: any) => ({
          ...item,
          splitCommissionMode: item?.splitCommissionMode || "auto",
          staffAssignments: normalizeSplitAssignments(
            item?.staffAssignments || [],
          ),
        }))
        : [],
      // Normalize split payment methods
      ...(Array.isArray(body.paymentMethods) && body.paymentMethods.length > 0
        ? {
          paymentMethods: body.paymentMethods.map((p: any) => {
            const pAmount = toNum(p.amount);
            if (pAmount < 0) throw new Error("Nominal metode pembayaran tidak boleh negatif");
            return {
              method: String(p.method || "Cash"),
              amount: pAmount,
            };
          }),
          // Primary paymentMethod = first entry (for backward compat with reports)
          paymentMethod: String(
            body.paymentMethods[0]?.method || body.paymentMethod || "Cash",
          ),
        }
        : {}),
    };

    const topSplitValidation = validateSplitAssignments(
      normalizedBody.staffAssignments || [],
    );
    if (!topSplitValidation.valid) {
      return NextResponse.json(
        { success: false, error: topSplitValidation.error },
        { status: 400 },
      );
    }

    for (const item of normalizedBody.items) {
      if (item.itemModel !== "Service") continue;
      const itemSplitValidation = validateSplitAssignments(
        item.staffAssignments || [],
      );
      if (!itemSplitValidation.valid) {
        return NextResponse.json(
          {
            success: false,
            error: `${item.name || "Service item"}: ${itemSplitValidation.error}`,
          },
          { status: 400 },
        );
      }
    }

    let invoiceNumber = "";

    // [BUG FIX] Mencegah double omset & Re-use Nomor Invoice Lama
    if (normalizedBody.appointment) {
      const existingInvoices = await Invoice.find({ appointment: normalizedBody.appointment });
      const pendingInvoice = existingInvoices.find((inv: any) => inv.status === 'pending');
      const hasPaid = existingInvoices.some((inv: any) => inv.status === 'paid' || inv.status === 'partially_paid');
      
      if (hasPaid) {
        return NextResponse.json({ 
            success: false, 
            error: "Appointment ini sudah memiliki invoice yang terbayar. Harap cek riwayat transaksi." 
        }, { status: 400 });
      }

      if (pendingInvoice) {
        // Gunakan kembali nomor invoice lama yang dibuat oleh sistem appointment
        invoiceNumber = pendingInvoice.invoiceNumber;
        
        // Hapus invoice auto-generated yang masih pending
        await Invoice.findByIdAndDelete(pendingInvoice._id);
      }
    }

    // Generate Invoice Number baru HANYA jika tidak ada invoice lama yang bisa di-reuse
    if (!invoiceNumber) {
        invoiceNumber = await generateInvoiceNumber(tenantSlug);
    }

    // BUG FIX 6: Check Wallet Balance before creating invoice
    let walletAmountUsed = 0;
    if (normalizedBody.paymentMethods && normalizedBody.paymentMethods.length > 0) {
      walletAmountUsed = normalizedBody.paymentMethods
        .filter((p: any) => p.method && (p.method.toLowerCase() === 'wallet' || p.method.toLowerCase() === 'e-wallet'))
        .reduce((sum: number, p: any) => sum + (parseFloat(p.amount) || 0), 0);
    } else if (normalizedBody.paymentMethod && (normalizedBody.paymentMethod.toLowerCase() === 'wallet' || normalizedBody.paymentMethod.toLowerCase() === 'e-wallet')) {
      walletAmountUsed = normalizedBody.amountPaid || normalizedBody.totalAmount;
    }

    const pointsUsed = toNum(normalizedBody.loyaltyPointsUsed);

    if (walletAmountUsed > 0 || pointsUsed > 0) {
      if (!normalizedBody.customer) {
        return NextResponse.json({ success: false, error: "Transaksi dengan e-wallet atau poin membutuhkan data customer terdaftar." }, { status: 400 });
      }
      const customerDoc = await Customer.findById(normalizedBody.customer);
      if (!customerDoc) {
        return NextResponse.json({ success: false, error: "Customer tidak ditemukan." }, { status: 400 });
      }
      if (walletAmountUsed > 0 && (customerDoc.walletBalance || 0) < walletAmountUsed) {
        return NextResponse.json({ success: false, error: `Saldo e-wallet tidak mencukupi. Saldo saat ini: Rp ${(customerDoc.walletBalance || 0).toLocaleString('id-ID')}` }, { status: 400 });
      }
      if (pointsUsed > 0 && (customerDoc.loyaltyPoints || 0) < pointsUsed) {
        return NextResponse.json({ success: false, error: `Poin loyalty tidak mencukupi. Poin saat ini: ${(customerDoc.loyaltyPoints || 0).toLocaleString('id-ID')}` }, { status: 400 });
      }
    }

    // --- ATOMIC VOUCHER REDEMPTION ---
    let voucherRedeemed: any = null;
    if (normalizedBody.voucherId) {
      const voucherQuery: any = {
        _id: normalizedBody.voucherId,
        isActive: true,
      };
      // Only apply usage limit check if usageLimit > 0 (0 means unlimited)
      const voucherUpdate: any = {
        $inc: { usedCount: 1 },
      };
      if (normalizedBody.customer) {
        voucherUpdate.$push = { usedBy: normalizedBody.customer };
      }

      // First, find the voucher to check usageLimit dynamically
      const voucherDoc = await Voucher.findById(normalizedBody.voucherId);
      if (!voucherDoc || !voucherDoc.isActive) {
        return NextResponse.json({ success: false, error: "Voucher tidak ditemukan atau tidak aktif." }, { status: 400 });
      }
      if (voucherDoc.expiresAt && new Date(voucherDoc.expiresAt) < new Date()) {
        return NextResponse.json({ success: false, error: "Voucher sudah kadaluarsa." }, { status: 400 });
      }
      if (voucherDoc.usageLimit > 0) {
        voucherQuery.usedCount = { $lt: voucherDoc.usageLimit };
      }
      if (normalizedBody.customer && voucherDoc.usedBy?.some((id: any) => String(id) === String(normalizedBody.customer))) {
        return NextResponse.json({ success: false, error: "Voucher sudah pernah digunakan oleh customer ini." }, { status: 400 });
      }

      voucherRedeemed = await Voucher.findOneAndUpdate(voucherQuery, voucherUpdate, { new: true });
      if (!voucherRedeemed) {
        return NextResponse.json({ success: false, error: "Voucher sudah mencapai batas penggunaan." }, { status: 400 });
      }
    }
    // --- END ATOMIC VOUCHER REDEMPTION ---

    const invoice = (await Invoice.create({
      ...normalizedBody,
      invoiceNumber,
    })) as any;

    if (walletAmountUsed > 0 || pointsUsed > 0) {
      const query: any = { _id: normalizedBody.customer };
      if (walletAmountUsed > 0) query.walletBalance = { $gte: walletAmountUsed };
      if (pointsUsed > 0) query.loyaltyPoints = { $gte: pointsUsed };

      const updates: any = { $inc: {} };
      if (walletAmountUsed > 0) updates.$inc.walletBalance = -walletAmountUsed;
      if (pointsUsed > 0) updates.$inc.loyaltyPoints = -pointsUsed;

      const updatedCustomer = await Customer.findOneAndUpdate(
        query,
        updates,
        { new: true }
      );

      if (!updatedCustomer) {
        // Race condition hit: someone else drained the balance in the last few milliseconds

        // Rollback invoice
        await Invoice.findByIdAndDelete(invoice._id);

        // Rollback voucher jika sudah diredeemkan
        if (voucherRedeemed) {
          const voucherRollback: any = { $inc: { usedCount: -1 } };
          if (normalizedBody.customer) {
            voucherRollback.$pull = { usedBy: normalizedBody.customer };
          }
          await Voucher.findByIdAndUpdate(normalizedBody.voucherId, voucherRollback);
        }

        return NextResponse.json({ success: false, error: "Saldo e-wallet atau poin tidak mencukupi saat memproses tagihan." }, { status: 400 });
      }

      // [B14 FIX] Reuse session dari checkPermissionWithSession di atas
      const session: any = posSession;

      if (walletAmountUsed > 0) {
        await WalletTransaction.create({
          customer: updatedCustomer._id,
          type: 'payment',
          amount: walletAmountUsed,
          balanceAfter: updatedCustomer.walletBalance,
          description: `Pembayaran Invoice ${invoiceNumber}`,
          invoice: invoice._id,
          performedBy: session?.user?.id,
        });
      }

      if (pointsUsed > 0) {
        await LoyaltyTransaction.create({
          customer: updatedCustomer._id,
          invoice: invoice._id,
          points: pointsUsed,
          type: 'redeemed',
          description: `Tukar poin untuk Tagihan ${invoiceNumber}`,
          balanceAfter: updatedCustomer.loyaltyPoints
        });
      }
    }

    // Sampai titik ini invoice udah ke-commit & lolos self-rollback wallet/points di atas
    // (satu-satunya path yg ngehapus invoice lagi). Tandai kuota "committed" biar finally
    // gak nge-refund transaksi yg sebenernya sukses. Sisa di bawah (deposit, cash drawer,
    // WA, log) itu side-effect best-effort — gagal di situ gak ngebatalin invoice.
    usageCommitted = true;

    // --- ATOMIC DEPOSIT RECORD CREATION & APPOINTMENT COMPLETION ---
    if (invoice.status === "paid" || invoice.status === "partially_paid") {
      if (normalizedBody.appointment && Appointment) {
        Appointment.findByIdAndUpdate(normalizedBody.appointment, { status: "completed" }).catch((err: any) => console.error("Auto complete appointment error:", err));
      }

      if (Deposit) {
        const depositDocs: any[] = [];
        if (invoice.paymentMethods && invoice.paymentMethods.length > 0) {
          for (const p of invoice.paymentMethods) {
            if (p.amount > 0) {
              depositDocs.push({
                invoice: invoice._id,
                customer: invoice.customer || undefined,
                amount: p.amount,
                paymentMethod: p.method || 'Cash',
                date: invoice.date || new Date(),
                notes: invoice.paymentMethods.length > 1 ? `Split payment (${p.method})` : "Initial payment",
              });
            }
          }
        } else if (invoice.amountPaid > 0) {
          depositDocs.push({
            invoice: invoice._id,
            customer: invoice.customer || undefined,
            amount: invoice.amountPaid,
            paymentMethod: invoice.paymentMethod || 'Cash',
            date: invoice.date || new Date(),
            notes: "Initial payment",
          });
        }
        if (depositDocs.length > 0) {
          await Deposit.insertMany(depositDocs);
        }
      }
    }

    // --- CASH DRAWER INTEGRATION ---
    if (invoice.status === "paid" || invoice.status === "partially_paid") {
      let cashAmount = 0;

      if (invoice.paymentMethods && invoice.paymentMethods.length > 0) {
        const cashPayment = invoice.paymentMethods.find((p: any) => p.method.toLowerCase() === 'cash');
        if (cashPayment) cashAmount = cashPayment.amount;
      } else if (invoice.paymentMethod && invoice.paymentMethod.toLowerCase() === 'cash') {
        cashAmount = invoice.amountPaid || invoice.totalAmount;
      }

      if (cashAmount > 0) {
        // [B14 FIX] Reuse session
        const userId = (posSession as any)?.user?.id;

        let balance = await CashBalance.findOneAndUpdate(
          {},
          { $inc: { kasirBalance: cashAmount }, $set: { lastUpdatedAt: new Date() } },
          { new: true, upsert: true }
        );


        await CashLog.create({
          type: 'sale',
          amount: cashAmount,
          sourceLocation: 'customer',
          destinationLocation: 'kasir',
          performedBy: userId,
          description: `Sales Payment for Invoice ${invoiceNumber}`,
          referenceModel: 'Invoice',
          referenceId: invoice._id,
          balanceAfter: {
            kasir: balance.kasirBalance,
            brankas: balance.brankasBalance,
            bank: balance.bankBalance
          }
        });
      }
    }
    // -------------------------------

    // Auto-deduct product stock and send low-stock WA notification if needed
    for (const item of normalizedBody.items) {
      if (item.itemModel !== "Product") continue;

      const itemId = item.item || item._id || item.itemId;
      const quantity = toNum(item.quantity ?? 1);

      try {
        // Validasi stok sebelum mengurangi — cegah stok negatif
        const currentProduct = await Product.findById(itemId);
        if (!currentProduct) continue;

        if (currentProduct.stock < quantity) {
          return NextResponse.json(
            {
              success: false,
              error: `Stok "${currentProduct.name}" tidak mencukupi. Stok tersedia: ${currentProduct.stock}, dibutuhkan: ${quantity}.`,
            },
            { status: 400 },
          );
        }

        const updatedProduct = await Product.findByIdAndUpdate(
          itemId,
          { $inc: { stock: -quantity } },
          { new: true },
        );

        if (!updatedProduct) continue;

        // Log to StockLog
        await StockLog.create({
          product: updatedProduct._id,
          storeSlug: tenantSlug,
          type: "out",
          quantity: quantity, // StockLog logic: change is just magnitude, or should we use the sign? Wait, the UI expects positive change for IN and negative for OUT usually, or just look at 'type'. In previous implementation, UI does `change = log.type === 'in' ? '+' + log.quantity : '-' + log.quantity`. So quantity should be positive.
          balanceAfter: updatedProduct.stock,
          note: `Penjualan via POS`,
          invoice: invoice._id,
          performedBy: (posSession as any)?.user?.id,
        });

        if (!updatedProduct) continue;

        if (
          updatedProduct.stock <= updatedProduct.alertQuantity &&
          !updatedProduct.lowStockNotifSent &&
          updatedProduct.lowStockAlertEnabled !== false
        ) {
          // Send WA low-stock notification to admin — error must NOT fail invoice creation
          try {
            const adminPhone = settings?.waAdminNumber || settings?.phone;

            if (adminPhone) {
              const message =
                `⚠️ *Stok Hampir Habis!*\n\nProduk: ${updatedProduct.name}\n` +
                `Stok saat ini: ${updatedProduct.stock}\n` +
                `Batas minimum: ${updatedProduct.alertQuantity}\n\n` +
                `Segera lakukan pemesanan stok.`;

              const { getWaProviderConfigForPurpose } = require('@/lib/waProvider');
              const waConfig = getWaProviderConfigForPurpose(settings, 'notification');
              sendWhatsApp(adminPhone, message, waConfig).catch((err: any) => console.error(`[LowStock] WA error for ${itemId}:`, err));
            }
          } catch (waError) {
            console.error(
              `[LowStock] WA notification error for product ${itemId}:`,
              waError,
            );
          }

          // Mark notif as sent to prevent duplicates
          Product.findByIdAndUpdate(itemId, { lowStockNotifSent: true }).catch((err: any) => console.error(err));
        } else if (updatedProduct.stock > updatedProduct.alertQuantity) {
          // Stock recovered — reset flag so future drops trigger notification again
          Product.findByIdAndUpdate(itemId, { lowStockNotifSent: false }).catch((err: any) => console.error(err));
        }
      } catch (stockError) {
        console.error(
          `[LowStock] Failed to update stock for product ${itemId}:`,
          stockError,
        );
      }
    }

    // Auto-deduct product stock for SERVICE materials
    for (const item of normalizedBody.items) {
      if (item.itemModel !== "Service") continue;
      try {
        const serviceDoc = await Service.findById(item.item || item._id || item.itemId).lean() as any;
        if (!serviceDoc?.materialsUsed?.length) continue;
        const invoiceQty = toNum(item.quantity ?? 1);
        for (const mat of serviceDoc.materialsUsed) {
          const deductQty = mat.quantityPerService * invoiceQty;
          const updatedProduct = await Product.findByIdAndUpdate(
            mat.product,
            { $inc: { stock: -deductQty } },
            { new: true }
          );

          if (!updatedProduct) continue;

          // Log to StockLog
          await StockLog.create({
            product: updatedProduct._id,
            storeSlug: tenantSlug,
            type: "out",
            quantity: deductQty,
            balanceAfter: updatedProduct.stock,
            note: `Pemakaian material service: ${serviceDoc.name}`,
            invoice: invoice._id,
            performedBy: (posSession as any)?.user?.id,
          });

          if (!updatedProduct) continue;
          
          if (
            updatedProduct.stock <= updatedProduct.alertQuantity &&
            !updatedProduct.lowStockNotifSent &&
            updatedProduct.lowStockAlertEnabled !== false
          ) {
            try {
              const adminPhone = settings?.waAdminNumber || settings?.phone;
              if (adminPhone) {
                const message =
                  `⚠️ *Stok Hampir Habis!*\n\nProduk: ${updatedProduct.name}\n` +
                  `Stok saat ini: ${updatedProduct.stock}\n` +
                  `Batas minimum: ${updatedProduct.alertQuantity}\n\n` +
                  `Segera lakukan pemesanan stok.`;
                const { getWaProviderConfigForPurpose } = require('@/lib/waProvider');
                const waConfig = getWaProviderConfigForPurpose(settings, 'notification');
                sendWhatsApp(adminPhone, message, waConfig).catch((err: any) => console.error(`[LowStock] WA error for ${mat.product}:`, err));
              }
            } catch (waError) {
              console.error(`[LowStock] WA notification error for product ${mat.product}:`, waError);
            }
            Product.findByIdAndUpdate(mat.product, { lowStockNotifSent: true }).catch((err: any) => console.error(err));
          } else if (updatedProduct.stock > updatedProduct.alertQuantity) {
            Product.findByIdAndUpdate(mat.product, { lowStockNotifSent: false }).catch((err: any) => console.error(err));
          }
        }
      } catch (matErr) {
        console.error("Material deduction error:", matErr);
      }
    }

    // Process Wallet Top-Up items
    if (invoice.status === "paid" && invoice.customer) {
      for (const item of normalizedBody.items) {
        if (item.itemModel === "TopUp") {
          const topUpAmount = toNum(item.total || (item.price * item.quantity));

          if (topUpAmount > 0) {
            // Find settings for bonus
            const tiers = (settings?.walletBonusTiers || [])
              .filter((t: any) => t.minAmount && t.bonusPercent)
              .sort((a: any, b: any) => b.minAmount - a.minAmount);

            let bonusPercent = 0;
            let bonusAmount = 0;

            for (const tier of tiers) {
              if (topUpAmount >= tier.minAmount) {
                bonusPercent = tier.bonusPercent;
                bonusAmount = Math.round(topUpAmount * (tier.bonusPercent / 100));
                break;
              }
            }

            const totalCredited = topUpAmount + bonusAmount;

            // Update customer wallet balance
            const cust = await Customer.findById(invoice.customer);
            if (cust) {
              cust.walletBalance = (cust.walletBalance || 0) + totalCredited;
              await cust.save();

              // [B14 FIX] Reuse session
              // Create WalletTransaction
              await WalletTransaction.create({
                customer: cust._id,
                type: 'topup',
                amount: totalCredited,
                balanceAfter: cust.walletBalance,
                description: `Top-Up via POS Invoice ${invoiceNumber}`,
                topupMethod: invoice.paymentMethod || 'Cash',
                bonusPercent,
                bonusAmount,
                invoice: invoice._id,
                performedBy: (posSession as any)?.user?.id,
              });
            }
          }
        }
      }
    }

    // Loyalty Point Logic: Calculate points if status is 'paid'
    let pointsToGain = 0;
    if (invoice.status === "paid" && invoice.customer) {
      const spendRule = settings?.loyaltyPointPerSpend || 0;
      if (spendRule > 0) {
        pointsToGain = Math.floor(invoice.totalAmount / spendRule);
      }

      const loyaltyUpdates: any = {
        $inc: { totalPurchases: invoice.totalAmount },
      };

      if (pointsToGain > 0) {
        loyaltyUpdates.$inc.loyaltyPoints = pointsToGain;
      }

      // Deduct used loyalty points if provided (Already done atomically above)
      const pointsUsed = toNum(normalizedBody.loyaltyPointsUsed);

      if (Object.keys(loyaltyUpdates.$inc).length > 0) {
        const updatedCust = await Customer.findByIdAndUpdate(invoice.customer, loyaltyUpdates, { new: true });

        if (updatedCust) {
          let currentBalance = updatedCust.loyaltyPoints || 0;
          if (pointsToGain > 0) {
            await LoyaltyTransaction.create({
              customer: updatedCust._id,
              invoice: invoice._id,
              points: pointsToGain,
              type: 'earned',
              description: `Poin dari transaksi ${invoiceNumber}`,
              balanceAfter: currentBalance
            });
          }
        }

        // Update the invoice to reflect earned points (used points already saved in Invoice.create)
        if (pointsToGain > 0) {
          await Invoice.findByIdAndUpdate(invoice._id, {
            loyaltyPointsEarned: pointsToGain,
          });
        }
      }
    }

    // Referral reward: if a referral code was submitted, reward the referrer
    const referralCodeSubmitted = normalizedBody.referralCode;
    if (referralCodeSubmitted && invoice.status === "paid") {
      try {
        const referrer = await Customer.findOne({
          referralCode: String(referralCodeSubmitted).toUpperCase().trim(),
        });
        if (referrer) {
          // Set referredBy on the customer if not already set
          const currentCustomer = await Customer.findById(invoice.customer);
          if (currentCustomer && !currentCustomer.referredBy) {
            await Customer.findByIdAndUpdate(currentCustomer._id, {
              referredBy: referrer._id
            });
          }

          // Reward logic:
          const isVIP = referrer.membershipExpiry && new Date(referrer.membershipExpiry).getTime() > new Date().getTime();
          if (isVIP) {
            const rewardPoints = settings?.referralRewardPoints || 0;
            if (rewardPoints > 0) {
              const updatedReferrer = await Customer.findByIdAndUpdate(referrer._id, {
                $inc: { loyaltyPoints: rewardPoints },
              }, { new: true });

              if (updatedReferrer) {
                await LoyaltyTransaction.create({
                  customer: updatedReferrer._id,
                  points: rewardPoints,
                  type: 'earned',
                  description: `Bonus referral dari transaksi customer ${currentCustomer?.name || 'baru'} (${invoiceNumber})`,
                  balanceAfter: updatedReferrer.loyaltyPoints || 0
                });
              }
            }
          } else {
            console.log("[Referral] Referrer is not VIP, skipped reward.");
          }
        }
      } catch (refErr) {
        console.error("[Referral] Error rewarding referrer:", refErr);
      }
    }

    scheduleFollowUp(invoice._id, tenantSlug).catch((err: any) => console.error("Follow up error:", err));

    logActivity({
      req: request,
      action: "create",
      resource: "invoice",
      resourceId: invoice._id as string,
      details: `Created invoice ${invoiceNumber} for amount $${invoice.totalAmount}`,
    }).catch((err: any) => console.error("Log activity error:", err));

    return NextResponse.json({ success: true, data: invoice });
  } catch (error: any) {
    console.error("INVOICE_CREATE_ERROR:", error);
    if (error.name === "ValidationError") {
      return NextResponse.json(
        {
          success: false,
          error:
            "Validation failed: " +
            Object.values(error.errors)
              .map((e: any) => e.message)
              .join(", "),
        },
        { status: 400 },
      );
    }
    if (error.code === 11000) {
      return NextResponse.json(
        {
          success: false,
          error: "Duplicate invoice number. Please try again.",
        },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { success: false, error: "Failed to create invoice" },
      { status: 500 },
    );
  } finally {
    // A4: kalau kuota kepotong tapi invoice GAK jadi ke-commit (throw di tengah sebelum
    // usageCommitted, atau return path error LEWAT DARI titik consume — perhatikan: tiap
    // return sebelum invoice.create mesti juga gak mau di-refund, dan semua return SETELAH
    // usageCommitted gak di-refund). Best-effort: refundUsage gak akan nglempar. Ini hanya
    // jalan kalau SAAS_ENABLED aktif; kalau mati, consume tadi ga jalan juga, jadi no-op.
    if (storeId && usageConsumed && !usageCommitted) {
      await refundUsage(storeId, 'transaction', 1);
    }
  }
}

export async function GET(request: NextRequest, props: any) {
  const tenantSlug = request.headers.get('x-store-slug') || 'pusat';
  const { Invoice, Customer, Product, Settings, CashBalance, CashLog } = await getTenantModels(tenantSlug);

  try {


    // Security Check — kasir (pos.view) butuh akses untuk customer lookup & receipt
    // [B14 FIX] Gunakan checkPermissionWithSession untuk 1 auth() call
    const { error: posPermErr, session: getSession } = await checkPermissionWithSession(request, "pos", "view");
    const getPerms = (getSession as any)?.user?.permissions;
    const getIsSA = (getSession as any)?.user?.role === 'Super Admin' || (getSession as any)?.user?.role?.name === 'Super Admin';
    const invPermErr = (!getIsSA && !getPerms) ? true : (!getIsSA && getPerms?.invoices?.view === 'none');
    // return posPermErr (NextResponse), bukan invPermErr (boolean) — fix TypeScript type error
    if (posPermErr && invPermErr) return posPermErr;



    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status") || "all";
    const customerId = searchParams.get("customerId");

    const skip = (page - 1) * limit;

    const query: any = {};

    if (customerId) {
      query.customer = customerId;
    }

    // Scope Check (Own vs All) - Optional refinement
    // const scope = await getViewScope('invoices');
    // if (scope === 'own') query.staff = session.user.id;

    if (status !== "all") {
      query.status = status;
    }

    if (search) {
      // Search in invoiceNumber
      const searchQueries: any[] = [
        { invoiceNumber: { $regex: search, $options: "i" } },
      ];

      // Or search by customer name if we can find customer IDs
      const customers = await Customer.find({
        name: { $regex: search, $options: "i" },
      }).select("_id");
      if (customers.length > 0) {
        searchQueries.push({ customer: { $in: customers.map((c: any) => c._id) } });
      }

      query.$or = searchQueries;
    }

    const total = await Invoice.countDocuments(query);
    const invoices = await Invoice.find(query)
      .populate("customer", "name phone")
      .populate("staff", "name")
      .populate("staffAssignments.staff", "name")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    return NextResponse.json({
      success: true,
      data: invoices,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("API Error Invoices GET:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch invoices" },
      { status: 500 },
    );
  }
}