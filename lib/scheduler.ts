import { decryptFonnteToken } from '@/lib/encryption';
import { getMasterModels } from './masterDb';
import { getTenantModels } from './tenantDb';
import { sendWhatsApp } from '@/lib/fonnte';
import { getWaProviderConfigForPurpose, sendTemplateViaBalesOtomatis, getBalesOtomatisTemplateId, buildTemplateParameters, extractTemplateVariables, type BalesOtomatisWabaConfig } from '@/lib/waProvider';
import { addMessageVariation } from '@/lib/messageVariation';
import { validateMessageContent } from '@/lib/messageValidator';
import { runDueBackups } from './backup';
// cronDedup removed — atomic lock via lastRunDate is sufficient

let schedulerStarted = false;

const DEFAULT_SCHEDULER_TIMEZONE = 'Asia/Jakarta';
const DEFAULT_SCHEDULER_CRON = '*/5 * * * *';

interface ProcessResult {
    total: number;
    sent: number;
    failed: number;
}

const fillTemplate = (template: string, vars: Record<string, string>): string => {
    return template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key: string) => vars[key] ?? '');
};

/**
 * Get all active tenant slugs from the master Store collection.
 */
async function getAllTenantSlugs(): Promise<string[]> {
    try {
        const master = await getMasterModels();
        const stores = await master.Store.find({ isActive: true }).select('slug').lean();
        const slugs = stores.map((s: any) => s.slug).filter(Boolean);
        return slugs.length > 0 ? slugs : ['pusat'];
    } catch (e) {
        console.error('Failed to fetch tenant slugs:', e);
        // Fallback to 'pusat' if master DB is not available
        return ['pusat'];
    }
}

/**
 * Get the Fonnte token for a given tenant.
 */
async function getTenantFonnteToken(slug: string): Promise<string> {
    try {
        const models = await getTenantModels(slug);
        const settings: any = await models.Settings.findOne({});
        if (settings?.fonnteToken) {
            return decryptFonnteToken(String(settings.fonnteToken).trim());
        }
    } catch (e) {
        console.error(`Failed to get fonnteToken for tenant "${slug}":`, e);
    }
    return String(process.env.FONNTE_TOKEN || '').trim();
}

export async function processPendingCampaigns(now: Date = new Date()) {
    // BLAST-03: Hanya kirim antara jam operasional (default 08:00-20:00 WIB)
    const hourWIB = parseInt(
        new Intl.DateTimeFormat('en-US', {
            timeZone: 'Asia/Jakarta',
            hour: 'numeric',
            hour12: false,
        }).format(now)
    );

    const slugs = await getAllTenantSlugs();

    for (const slug of slugs) {
        try {
            const models = await getTenantModels(slug);
            const { WaCampaignQueue, WaBlastLog, Customer, Settings } = models;
            // Load settings for operational hours and daily limits
            const settings: any = await Settings.findOne() || {};
            const waConfig = getWaProviderConfigForPurpose(settings, 'campaign');
            const opStart = settings.waOperationalHoursStart ?? 8;
            const opEnd = settings.waOperationalHoursEnd ?? 20;

            if (hourWIB < opStart || hourWIB >= opEnd) {
                console.log(`[CAMPAIGN:${slug}] Outside operational hours (${hourWIB}:xx WIB, allowed ${opStart}-${opEnd}), skipping`);
                continue;
            }

            // BLAST-02: Daily & Hourly volume limits
            const tz = 'Asia/Jakarta';
            const year = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric' }).format(now);
            const month = new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'numeric' }).format(now);
            const day = new Intl.DateTimeFormat('en-US', { timeZone: tz, day: 'numeric' }).format(now);
            const todayStart = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00.000+07:00`);

            const sentTodayAgg = await WaCampaignQueue.aggregate([
                { $match: { 
                    createdAt: { $gte: todayStart },
                    status: { $in: ['processing', 'completed', 'partially_failed'] }
                }},
                { $unwind: '$targets' },
                { $match: { 'targets.status': 'sent' }},
                { $group: { _id: null, total: { $sum: 1 } }}
            ]);
            const totalSentToday = sentTodayAgg[0]?.total || 0;

            const hourStart = new Date(now);
            hourStart.setMinutes(0, 0, 0);
            const sentHourAgg = await WaCampaignQueue.aggregate([
                { $match: { 
                    createdAt: { $gte: hourStart },
                    status: { $in: ['processing', 'completed', 'partially_failed'] }
                }},
                { $unwind: '$targets' },
                { $match: { 'targets.status': 'sent' }},
                { $group: { _id: null, total: { $sum: 1 } }}
            ]);
            const totalSentThisHour = sentHourAgg[0]?.total || 0;
            const hourlyLimit = 50; // Max 50 per hour per tenant

            if (totalSentThisHour >= hourlyLimit) {
                console.log(`[CAMPAIGN:${slug}] Hourly limit reached (${totalSentThisHour}/${hourlyLimit}), skipping`);
                continue;
            }

            // Calculate daily limit based on warm-up (device age)
            let dailyLimit = settings.fonnteMaxDailyMessages || 0;
            if (dailyLimit === 0) {
                // Auto-calculate based on device registration date
                const registeredAt = settings.fonnteDeviceRegisteredAt;
                if (registeredAt) {
                    const ageDays = Math.floor((now.getTime() - new Date(registeredAt).getTime()) / (1000 * 60 * 60 * 24));
                    if (ageDays <= 7) dailyLimit = 10;
                    else if (ageDays <= 14) dailyLimit = 20;
                    else if (ageDays <= 30) dailyLimit = 50;
                    else dailyLimit = 100;
                } else {
                    dailyLimit = 50; // default conservative
                }
            }

            if (totalSentToday >= dailyLimit) {
                console.log(`[CAMPAIGN:${slug}] Daily limit reached (${totalSentToday}/${dailyLimit}), skipping`);
                continue;
            }

            let currentSentToday = totalSentToday;
            let currentSentThisHour = totalSentThisHour;

            const MAX_CAMPAIGNS_PER_TICK = 3; // FIX B-11
            for (let campaignIndex = 0; campaignIndex < MAX_CAMPAIGNS_PER_TICK; campaignIndex++) {
                const remainingQuota = Math.min(dailyLimit - currentSentToday, hourlyLimit - currentSentThisHour);
                if (remainingQuota <= 0) break;

                // BLAST-06: Atomic claim — prevent tick overlap
                console.log(`[CAMPAIGN:${slug}] Looking for pending campaigns <= ${now.toISOString()}`);
                const campaign = await WaCampaignQueue.findOneAndUpdate(
                {
                    $or: [
                        { status: 'pending', scheduledAt: { $lte: now } },
                        // Only re-claim processing campaigns that have been stuck for > 5 minutes
                        { status: 'processing', processingAt: { $lt: new Date(now.getTime() - 5 * 60_000) } },
                    ]
                },
                { $set: { status: 'processing', processingAt: now } },
                { new: true, sort: { scheduledAt: 1 } }
            );

            if (!campaign) {
                console.log(`[CAMPAIGN:${slug}] No pending campaigns found`);
                continue;
            }
            
            console.log(`[CAMPAIGN:${slug}] Claimed campaign ${campaign._id} (${campaign.campaignName})`);

            // Find targets that are still pending — limit by remaining daily quota (unlimited speed per tick)
            const maxPerTick = remainingQuota;
            const pendingTargets = campaign.targets.filter((t: any) => t.status === 'pending').slice(0, maxPerTick);

            if (pendingTargets.length === 0) {
                const hasFailed = campaign.targets.some((t: any) => t.status === 'failed');
                campaign.status = hasFailed ? 'partially_failed' : 'completed';
                await campaign.save();

                const sentCount = campaign.targets.filter((t: any) => t.status === 'sent').length;
                const failedCount = campaign.targets.filter((t: any) => t.status === 'failed').length;

                // Save Blast Log
                await WaBlastLog.create({
                    campaignName: campaign.campaignName,
                    message: campaign.message,
                    targetCount: campaign.targets.length,
                    sentCount,
                    failedCount,
                    filters: campaign.filters,
                    recipients: campaign.targets.map((t: any) => ({
                        customerId: t.customerId,
                        phone: t.phone,
                        status: t.status,
                        error: t.error
                    })),
                    sentBy: campaign.sentBy,
                });
                continue;
            }

            // BLAST-06 cont: Check failure rate — auto-stop if > 30%
            const sentSoFar = campaign.targets.filter((t: any) => t.status === 'sent').length;
            const failedSoFar = campaign.targets.filter((t: any) => t.status === 'failed').length;
            const processedSoFar = sentSoFar + failedSoFar;

            if (processedSoFar >= 10) {
                const failRate = failedSoFar / processedSoFar;
                if (failRate > 0.3) {
                    campaign.status = 'failed';
                    await campaign.save();
                    console.error(`[CAMPAIGN:${slug}] High failure rate (${Math.round(failRate * 100)}%), stopping campaign ${campaign._id}`);

                    // Still log it
                    await WaBlastLog.create({
                        campaignName: campaign.campaignName,
                        message: campaign.message,
                        targetCount: campaign.targets.length,
                        sentCount: sentSoFar,
                        failedCount: failedSoFar + campaign.targets.filter((t: any) => t.status === 'pending').length,
                        filters: campaign.filters,
                        recipients: campaign.targets.map((t: any) => ({
                            customerId: t.customerId,
                            phone: t.phone,
                            status: t.status === 'pending' ? 'failed' : t.status,
                            error: t.status === 'pending' ? 'Campaign stopped: high failure rate' : t.error
                        })),
                        sentBy: campaign.sentBy,
                    });
                    continue;
                }
            }

            // We need customer names for template replacing
            const customerIds = pendingTargets.map((t: any) => t.customerId);
            const customers = await Customer.find({ _id: { $in: customerIds } }).select('name').lean();
            const customerMap = new Map(customers.map((c: any) => [String(c._id), c.name]));

            // WABA TEMPLATE MODE: campaign yang bawa waTemplateName dikirim via Send Template
            // (/send_message_template) pakai template pre-approved Meta — WAJIB untuk blast promo
            // di luar window 24 jam. Hanya aktif kalau config campaign resolve ke BalesOtomatis WABA;
            // kalau engga (Fonnte / unofficial) jatuh ke jalur free-text lama supaya tetap kompatibel.
            const wabaConfig =
                waConfig.provider === 'balesotomatis' && waConfig.balesotomatis?.mode === 'waba'
                    ? waConfig.balesotomatis
                    : null;
            const useTemplate = Boolean(campaign.waTemplateName) && Boolean(wabaConfig);
            const templateVars: string[] =
                (Array.isArray(campaign.waTemplateVariables) && campaign.waTemplateVariables.length > 0)
                    ? campaign.waTemplateVariables
                    : extractTemplateVariables(campaign.message);
            const templateValues: Record<string, string> = campaign.waTemplateValues
                ? Object.fromEntries(Object.entries(campaign.waTemplateValues).map(([k, v]) => [k.toLowerCase(), String(v)]))
                : {};

            // Resolusi ID NUMERIK Meta SEKALI per campaign (bukan per-penerima):
            // /send_message_template minta field `template` = ID numerik, BUKAN nama
            // (kirim nama ditolak "Template not found"). Kalau gagal resolve (template
            // dihapus di dashboard / belum APPROVED) → tandai campaign + target pending
            // failed dgn pesan jelas, lalu skip campaign ini (jangan loop retry senyap).
            let resolvedTemplateId: string | null = null;
            if (useTemplate && wabaConfig) {
                resolvedTemplateId = await getBalesOtomatisTemplateId(
                    wabaConfig.secretKey,
                    wabaConfig.licensesKey,
                    campaign.waTemplateName
                );
                if (!resolvedTemplateId) {
                    const errMsg = `Template WABA "${campaign.waTemplateName}" tidak ditemukan / belum APPROVED di BalesOtomatis. Cek status atau daftarkan ulang di menu Template WhatsApp.`;
                    console.error(`[CAMPAIGN:${slug}] ${errMsg} — campaign ${campaign._id} ditandai failed.`);
                    await WaCampaignQueue.updateOne(
                        { _id: campaign._id },
                        {
                            $set: {
                                status: 'failed',
                                'targets.$[t].status': 'failed',
                                'targets.$[t].error': errMsg,
                            },
                        },
                        { arrayFilters: [{ 't.status': 'pending' }] }
                    );
                    continue;
                }
            }

            let consecutiveErrors = 0;
            let loopSent = 0;

            for (const target of pendingTargets) {
                // BLAST-04: Dedup check has been REMOVED as per user requirement.
                // Every scheduled campaign target will be processed without 24h limits.

                const customerName = customerMap.get(String(target.customerId)) || 'Pelanggan';
                // BUG-02 FIX: Replace semua variabel yang dikenal, bukan hanya nama_customer
                const campaignDateStr = new Intl.DateTimeFormat('id-ID', {
                    timeZone: 'Asia/Jakarta', dateStyle: 'long'
                }).format(now);

                try {
                    let result;
                    if (useTemplate && wabaConfig && resolvedTemplateId) {
                        // Personalisasi parameter per penerima, urut sesuai variabel template.
                        const parameters = buildTemplateParameters(templateVars, templateValues, {
                            customerName,
                            storeName: settings.storeName || 'Salon',
                            date: campaignDateStr,
                        });
                        result = await sendTemplateViaBalesOtomatis(
                            wabaConfig,
                            target.phone,
                            resolvedTemplateId,
                            campaign.waTemplateLanguage || 'id',
                            parameters
                        );
                    } else {
                        // Jalur free-text lama (Fonnte / unofficial).
                        let personalizedMsg = campaign.message
                            .replace(/{{nama_customer}}|{{customerName}}/gi, customerName)
                            .replace(/{{storeName}}/gi, settings.storeName || 'Salon')
                            .replace(/{{date}}/gi, campaignDateStr);

                        // Add message variation to avoid identical-content spam detection
                        personalizedMsg = addMessageVariation(personalizedMsg);

                        // BUG-10 FIX: Validasi konten pesan sebelum kirim
                        const validation = validateMessageContent(personalizedMsg);
                        if (!validation.safe) {
                            console.warn(`[CAMPAIGN:${slug}] Message flagged: ${validation.warnings.join(', ')}`);
                        }

                        result = await sendWhatsApp(target.phone, personalizedMsg, waConfig);
                    }

                    if (result.success) {
                        target.status = 'sent';
                        consecutiveErrors = 0; // reset
                        loopSent++;
                        console.log(`[CAMPAIGN:${slug}] ✅ Sent to ${target.phone}${useTemplate ? ' (template)' : ''}`);
                    } else {
                        target.status = 'failed';
                        target.error = result.error;
                        consecutiveErrors++;
                        console.log(`[CAMPAIGN:${slug}] ❌ Failed to send to ${target.phone}: ${result.error}`);
                    }
                } catch (err: any) {
                    target.status = 'failed';
                    target.error = err.message;
                    consecutiveErrors++;
                    console.log(`[CAMPAIGN:${slug}] ❌ Error sending to ${target.phone}: ${err.message}`);
                }

                // BLAST-05: Save with sentAt timestamp
                await WaCampaignQueue.updateOne(
                    { _id: campaign._id, "targets._id": target._id },
                    {
                        $set: {
                            "targets.$.status": target.status,
                            "targets.$.error": target.error,
                            "targets.$.sentAt": target.status === 'sent' ? new Date() : undefined,
                        }
                    }
                );

                if (consecutiveErrors >= 3) {
                    console.error(`[CAMPAIGN:${slug}] 3 consecutive errors. Stopping campaign ${campaign._id}`);
                    campaign.status = 'failed';
                    await campaign.save();
                    break;
                }

                if (target.status === 'failed') {
                    // Exponential backoff or longer delay on error
                    const backoffDelay = 30000 + Math.random() * 30000; // 30-60 seconds
                    await new Promise(resolve => setTimeout(resolve, backoffDelay));
                } else {
                    // Safe random delay (8-15 seconds) to prevent spam detection
                    const baseDelay = 8000;
                    const jitter = Math.floor(Math.random() * 7000);
                    await new Promise((resolve) => setTimeout(resolve, baseDelay + jitter));
                }
            }

            // After processing the batch, check if any targets are still pending
            const updatedCampaign = await WaCampaignQueue.findById(campaign._id);
            if (updatedCampaign) {
                const stillPending = updatedCampaign.targets.some((t: any) => t.status === 'pending');
                if (stillPending) {
                    updatedCampaign.status = 'pending';
                    await updatedCampaign.save();
                    console.log(`[CAMPAIGN:${slug}] Campaign ${campaign._id} partially processed, set back to pending`);
                } else {
                    const hasFailed = updatedCampaign.targets.some((t: any) => t.status === 'failed');
                    updatedCampaign.status = hasFailed ? 'partially_failed' : 'completed';
                    await updatedCampaign.save();
                    console.log(`[CAMPAIGN:${slug}] Campaign ${campaign._id} finished processing (${updatedCampaign.status})`);
                }
            }
                
            currentSentToday += loopSent;
            currentSentThisHour += loopSent;
        }
        } catch (e) {
            console.error(`processPendingCampaigns error for tenant "${slug}":`, e);
        }
    }
}

/**
 * Kirim satu pesan automation via WABA Send Template (template Meta-approved).
 * Dipakai kategori customer-facing (membership_expiry / package_expiry / birthday)
 * saat tenant WABA DAN rule punya template ter-link (rule.waTemplateId).
 *
 * Resolusi ID NUMERIK Meta di-cache per-tick lewat `templateIdCache` — banyak
 * customer share satu template rule, jadi /get-template-list cukup dihit sekali.
 * `values` menyuplai nilai per variabel (key WAJIB lowercase); apapun nama variabel
 * di template (mis. {{nama_customer}}, {{membershipTier}}, {{daysLeft}}) ke-fill dari
 * sini, sisanya fallback ke `ctx` (nama_customer/storeName) via buildTemplateParameters.
 * Balikin { ok, error } — TIDAK fallback ke Fonnte (konsisten dgn follow-up murni WABA).
 */
async function sendAutomationViaWaba(
    wabaConfig: BalesOtomatisWabaConfig,
    template: any,
    phone: string,
    values: Record<string, string>,
    ctx: { customerName?: string; storeName?: string; date?: string; serviceName?: string },
    templateIdCache: Map<string, string | null>
): Promise<{ ok: boolean; error?: string }> {
    const metaName = String(template?.metaTemplateName || template?.name || '').trim();
    if (!metaName) {
        return { ok: false, error: 'Template WABA belum punya nama Meta (metaTemplateName kosong). Daftarkan & approve di menu Template WhatsApp.' };
    }

    let resolvedTemplateId: string | null;
    if (templateIdCache.has(metaName)) {
        resolvedTemplateId = templateIdCache.get(metaName) ?? null;
    } else {
        resolvedTemplateId = await getBalesOtomatisTemplateId(wabaConfig.secretKey, wabaConfig.licensesKey, metaName);
        templateIdCache.set(metaName, resolvedTemplateId);
    }

    if (!resolvedTemplateId) {
        return { ok: false, error: `Template WABA "${metaName}" belum APPROVED / tidak ditemukan di BalesOtomatis (status lokal: ${template?.metaStatus || 'LOCAL'}).` };
    }

    const templateVars: string[] =
        (Array.isArray(template.metaVariables) && template.metaVariables.length > 0)
            ? template.metaVariables
            : extractTemplateVariables(template.message || '');
    const parameters = buildTemplateParameters(templateVars, values, ctx);
    const result = await sendTemplateViaBalesOtomatis(
        wabaConfig,
        phone,
        resolvedTemplateId,
        template.metaLanguage || 'id',
        parameters
    );
    return { ok: !!result.success, error: result.success ? undefined : result.error };
}

export async function processAutomations(now: Date = new Date(), targetSlug?: string) {
    const slugs = targetSlug ? [targetSlug] : await getAllTenantSlugs();

    const todayStr = now.toLocaleDateString('en-US', { timeZone: DEFAULT_SCHEDULER_TIMEZONE });


    // FLOW-09 FIX (B-04): Time Window tidak lagi berbasis 60-min window substring match.
    // Mengecek apakah tzNow >= ruleTime. Waktu eksekusi telat tidak masalah karena ada lastRunDate.

    for (const slug of slugs) {
        try {
            const models = await getTenantModels(slug);
            const { WaAutomation, Settings, Customer, Product, Invoice, CustomerPackage } = models;
            const activeRules = await WaAutomation.find({ isActive: true })
                .populate('waTemplateId', 'name message metaTemplateName metaLanguage metaVariables metaStatus');
            const settings: any = await Settings.findOne() || {};

            // === OPERATIONAL HOURS CHECK REMOVED ===
            // Rules have their own `scheduleTime` that need to execute regardless of WA Blast operational boundaries
            

            const waConfig = getWaProviderConfigForPurpose(settings, 'notification');

            // Kandidat WABA untuk reminder/ultah (customer-facing). Deteksi sama persis
            // dgn follow-up: purpose 'campaign' → WABA saat hybrid ON, atau provider tunggal
            // balesotomatis-waba saat hybrid OFF. Kalau bukan WABA → null (tenant Fonnte).
            const wabaCandidate = getWaProviderConfigForPurpose(settings, 'campaign');
            const wabaConfig: BalesOtomatisWabaConfig | null =
                wabaCandidate.provider === 'balesotomatis' && wabaCandidate.balesotomatis?.mode === 'waba'
                    ? wabaCandidate.balesotomatis
                    : null;
            const storeName = settings.storeName || 'Salon';
            // Cache resolusi ID NUMERIK Meta per-tick per-tenant (dipakai lintas rule/customer).
            const templateIdCache = new Map<string, string | null>();

            for (const rule of activeRules) {
                // Check if rule already ran today (in memory first)
                const lastRunStr = rule.lastRunDate ? rule.lastRunDate.toLocaleDateString('en-US', { timeZone: DEFAULT_SCHEDULER_TIMEZONE }) : '';
                if (lastRunStr === todayStr) continue;

                // Frequency check
                const freq = rule.frequency || 'daily';
                const scheduleDays: number[] = rule.scheduleDays || [];

                if (freq === 'weekly' && scheduleDays.length > 0) {
                    const tz = 'Asia/Jakarta';
                    // Intl.DateTimeFormat 'short' for weekday returns 'Mon', 'Tue', etc.
                    const dayStr = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(now);
                    const daysMap: Record<string, number> = { 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6, 'Sun': 7 };
                    const isoDay = daysMap[dayStr] || 1;
                    if (!scheduleDays.includes(isoDay)) continue;
                } else if (freq === 'monthly' && scheduleDays.length > 0) {
                    const tz = 'Asia/Jakarta';
                    const dayOfMonth = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: tz, day: 'numeric' }).format(now));
                    if (!scheduleDays.includes(dayOfMonth)) continue;
                }

                // Determine targets based on targetRole
                let targetPhones: string[] = [];
                if (rule.targetRole === 'owner' && settings.waOwnerNumber) targetPhones.push(settings.waOwnerNumber);
                if (rule.targetRole === 'admin' && settings.waAdminNumber) targetPhones.push(settings.waAdminNumber);

                // BUG-C3 FIX: Keluar awal jika setting nomor (owner/admin) kosong
                const needsPhoneTarget = ['daily_report', 'stock_alert'].includes(rule.category);
                if (needsPhoneTarget && targetPhones.length === 0) {
                    console.warn(`[AUTOMATION:${rule.category}][${slug}] Skipping: Owner/Admin phone missing in Settings. Lock skipped.`);
                    continue; // Skip without locking so it retries later when phone is configured
                }

                // Time check — date >= scheduled time for today (B-04)
                if (rule.scheduleTime) {
                    const [hh, mm] = rule.scheduleTime.split(':').map(Number);
                    const tzNowStr = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
                    const ruleTime = new Date(tzNowStr);
                    ruleTime.setHours(hh, mm, 0, 0);
                    if (tzNowStr.getTime() < ruleTime.getTime()) {
                        continue; // Not yet time to run today
                    }
                }

                // Atomic Claim to prevent race conditions across PM2 instances or manual triggers
                const tzWib = 'Asia/Jakarta';
                const yearWib = new Intl.DateTimeFormat('en-US', { timeZone: tzWib, year: 'numeric' }).format(now);
                const monthWib = new Intl.DateTimeFormat('en-US', { timeZone: tzWib, month: 'numeric' }).format(now);
                const dayWib = new Intl.DateTimeFormat('en-US', { timeZone: tzWib, day: 'numeric' }).format(now);
                const startOfToday = new Date(`${yearWib}-${monthWib.padStart(2, '0')}-${dayWib.padStart(2, '0')}T00:00:00.000+07:00`);

                const lockedRule = await WaAutomation.findOneAndUpdate(
                    {
                        _id: rule._id,
                        $or: [
                            { lastRunDate: { $lt: startOfToday } },
                            { lastRunDate: { $exists: false } },
                            { lastRunDate: null }
                        ]
                    },
                    { $set: { lastRunDate: now } }, // Lock it by pretending it already ran
                    { new: true }
                );

                if (!lockedRule) {
                    console.log(`[AUTOMATION] Rule ${rule.category} already claimed by another instance.`);
                    continue; // Someone else already claimed and ran this rule today
                }

                let ruleSuccess = false;

                try {
                    if (rule.category === 'daily_report') {



                        const tz = 'Asia/Jakarta';
                        const year = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric' }).format(now);
                        const month = new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'numeric' }).format(now);
                        const day = new Intl.DateTimeFormat('en-US', { timeZone: tz, day: 'numeric' }).format(now);
                        
                        const startOfDayStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00.000+07:00`;
                        const startOfDay = new Date(startOfDayStr);
                        const endOfDayStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T23:59:59.999+07:00`;
                        const endOfDay = new Date(endOfDayStr);

                        const invoices = await Invoice.find({
                            date: { $gte: startOfDay, $lte: endOfDay },
                            status: 'paid',
                        }).lean();

                        const totalRevenue = invoices.reduce((sum: number, inv: any) => sum + (inv.totalAmount || 0), 0);
                        const totalTransactions = invoices.length;
                        const totalCustomers = new Set(invoices.map((inv: any) => String(inv.customer))).size;


                        // BUG-03 FIX: Format angka murni tanpa prefix "Rp" untuk hindari double "RpRp"
                        const formattedRevenue = new Intl.NumberFormat('id-ID').format(totalRevenue);
                        
                        // FLOW-03 FIX: Selalu memprioritaskan messageTemplate dari Automation Rule yang ada di page baru
                        const templateStr = rule.messageTemplate || `Halo, ini laporan harian. Pendapatan hari ini: {{total_revenue}} ({{total_transactions}} transaksi).`;
                        
                        const dateStr = new Intl.DateTimeFormat('id-ID', { timeZone: tz, dateStyle: 'long' }).format(now);
                        const message = templateStr
                            .replace(/{{total_revenue}}|{{totalAmount}}/gi, formattedRevenue)
                            .replace(/{{total_transactions?}}|{{totalTransactions}}/gi, String(totalTransactions))
                            .replace(/{{total_customers?}}|{{totalCustomers}}/gi, String(totalCustomers))
                            .replace(/{{storeName}}/gi, settings.storeName || 'Salon')
                            .replace(/{{date}}/gi, dateStr);


                        let allSuccess = true;
                        for (const phone of targetPhones) {
                            const result = await sendWhatsApp(phone, message, waConfig);
                            if (!result.success) {
                                console.error(`[AUTOMATION:daily_report] Gagal kirim ke ${phone}: ${result.error}`);
                                allSuccess = false;
                            }
                            await new Promise(r => setTimeout(r, 10000));
                        }

                        if (allSuccess) {
                            ruleSuccess = true;
                        }

                    }
                    else if (rule.category === 'stock_alert') {


                        const products = await Product.find({
                            status: 'active',
                            lowStockAlertEnabled: true,
                            lowStockNotifSent: { $ne: true },
                            $expr: { $lte: ['$stock', '$alertQuantity'] }
                        }).lean();
                        if (products.length === 0) {
                            ruleSuccess = true;
                            continue;
                        }


                        const itemList = products.map((p: any) => `- ${p.name} (Sisa: ${p.stock})`).join('\n');
                        const message = rule.messageTemplate
                            .replace(/{{items}}|{{productList}}/gi, itemList)
                            .replace(/{{storeName}}/gi, settings.storeName || 'Salon')
                            .replace(/{{count}}/gi, String(products.length));

                        let sent = false;
                        for (const phone of targetPhones) {
                            const result = await sendWhatsApp(phone, message, waConfig);
                            if (result.success) sent = true;
                            else console.error(`[AUTOMATION:stock_alert] Gagal kirim ke ${phone}: ${result.error}`);
                            await new Promise(r => setTimeout(r, 10000));
                        }

                        // Tandai produk sebagai sudah dinotif hanya jika WA berhasil terkirim
                        if (sent) {
                            const ids = products.map((p: any) => p._id);
                            await Product.updateMany({ _id: { $in: ids } }, { $set: { lowStockNotifSent: true } });
                            ruleSuccess = true;
                        }
                    }
                    else if (rule.category === 'membership_expiry' && rule.targetRole === 'customer') {
                        const daysBefore = rule.daysBefore || 0;
                        
                        // FIX B-12: Timezone aware expiration dates
                        const tzWib = 'Asia/Jakarta';
                        const yearWib = new Intl.DateTimeFormat('en-US', { timeZone: tzWib, year: 'numeric' }).format(now);
                        const monthWib = new Intl.DateTimeFormat('en-US', { timeZone: tzWib, month: 'numeric' }).format(now);
                        const dayWib = new Intl.DateTimeFormat('en-US', { timeZone: tzWib, day: 'numeric' }).format(now);
                        
                        const baseDate = new Date(`${yearWib}-${monthWib.padStart(2, '0')}-${dayWib.padStart(2, '0')}T00:00:00+07:00`);
                        baseDate.setDate(baseDate.getDate() + daysBefore);

                        const startOfTarget = new Date(baseDate);
                        const endOfTarget = new Date(baseDate.getTime() + (23 * 3600_000) + (59 * 60_000) + 59_000); // end of day

                        const customers = await Customer.find({
                            membershipExpiry: { $gte: startOfTarget, $lte: endOfTarget },
                            waNotifEnabled: true,
                            phone: { $exists: true, $ne: '' }
                        });

                        let memberSentCount = 0;
                        const memberTemplate: any = (rule as any).waTemplateId || null;
                        const memberUseWaba = Boolean(wabaConfig) && Boolean(memberTemplate);
                        for (const customer of customers) {
                            const expiryDateStr = customer.membershipExpiry ? new Date(customer.membershipExpiry).toLocaleDateString('id-ID') : '';
                            let result: { success: boolean; error?: string };
                            if (memberUseWaba) {
                                const r = await sendAutomationViaWaba(wabaConfig!, memberTemplate, customer.phone, {
                                    nama_customer: customer.name, customername: customer.name, customer_name: customer.name, nama: customer.name,
                                    membershiptier: customer.membershipTier || '',
                                    storename: storeName, store_name: storeName, nama_toko: storeName, toko: storeName, salon: storeName,
                                    daysleft: String(daysBefore),
                                    expirydate: expiryDateStr,
                                }, { customerName: customer.name, storeName, date: expiryDateStr }, templateIdCache);
                                result = { success: r.ok, error: r.error };
                            } else {
                                const msg = rule.messageTemplate
                                    .replace(/{{nama_customer}}|{{customerName}}/gi, customer.name)
                                    .replace(/{{membershipTier}}/gi, customer.membershipTier || '')
                                    .replace(/{{storeName}}/gi, settings.storeName || 'Salon')
                                    .replace(/{{daysLeft}}/gi, String(daysBefore))
                                    .replace(/{{expiryDate}}/gi, expiryDateStr);
                                result = await sendWhatsApp(customer.phone, msg, waConfig);
                            }
                            if (result.success) {
                                memberSentCount++;
                            } else {
                                console.error(`[AUTOMATION:membership_expiry] Gagal kirim ke ${customer.name} (${customer.phone}): ${result.error}`);
                            }
                            await new Promise(r => setTimeout(r, 10000));
                        }
                        if (memberSentCount > 0 || customers.length === 0) {
                            ruleSuccess = true;
                        }
                        console.log(`[AUTOMATION:membership_expiry] sent: ${memberSentCount} / ${customers.length}`);
                    }
                    else if (rule.category === 'package_expiry' && rule.targetRole === 'customer') {
                        const daysBefore = rule.daysBefore || 0;
                        
                        // FIX B-12: Timezone aware expiration dates
                        const tzWib = 'Asia/Jakarta';
                        const yearWib = new Intl.DateTimeFormat('en-US', { timeZone: tzWib, year: 'numeric' }).format(now);
                        const monthWib = new Intl.DateTimeFormat('en-US', { timeZone: tzWib, month: 'numeric' }).format(now);
                        const dayWib = new Intl.DateTimeFormat('en-US', { timeZone: tzWib, day: 'numeric' }).format(now);
                        
                        const baseDate = new Date(`${yearWib}-${monthWib.padStart(2, '0')}-${dayWib.padStart(2, '0')}T00:00:00+07:00`);
                        baseDate.setDate(baseDate.getDate() + daysBefore);

                        const startOfTarget = new Date(baseDate);
                        const endOfTarget = new Date(baseDate.getTime() + (23 * 3600_000) + (59 * 60_000) + 59_000); // end of day

                        const expiringPackages = await CustomerPackage.find({
                            status: 'active',
                            expiresAt: { $gte: startOfTarget, $lte: endOfTarget }
                        }).populate('customer', 'name phone waNotifEnabled').lean();

                        let pkgSentCount = 0;
                        let pkgTotal = 0;
                        const pkgTemplate: any = (rule as any).waTemplateId || null;
                        const pkgUseWaba = Boolean(wabaConfig) && Boolean(pkgTemplate);
                        for (const pkg of expiringPackages) {
                            const customer: any = pkg.customer;
                            if (!customer || !customer.phone || !customer.waNotifEnabled) continue;
                            pkgTotal++;

                            const packageName = pkg.packageSnapshot?.name || 'Paket';
                            const expiryDateStr = pkg.expiresAt ? new Date(pkg.expiresAt).toLocaleDateString('id-ID') : '';
                            let result: { success: boolean; error?: string };
                            if (pkgUseWaba) {
                                const r = await sendAutomationViaWaba(wabaConfig!, pkgTemplate, customer.phone, {
                                    nama_customer: customer.name, customername: customer.name, customer_name: customer.name, nama: customer.name,
                                    packagename: packageName,
                                    storename: storeName, store_name: storeName, nama_toko: storeName, toko: storeName, salon: storeName,
                                    daysleft: String(daysBefore),
                                    expirydate: expiryDateStr,
                                    remainingquota: String(pkg.remainingCount || 0),
                                }, { customerName: customer.name, storeName, date: expiryDateStr }, templateIdCache);
                                result = { success: r.ok, error: r.error };
                            } else {
                                const msg = rule.messageTemplate
                                    .replace(/{{nama_customer}}|{{customerName}}/gi, customer.name)
                                    .replace(/{{packageName}}/gi, packageName)
                                    .replace(/{{storeName}}/gi, settings.storeName || 'Salon')
                                    .replace(/{{daysLeft}}/gi, String(daysBefore))
                                    .replace(/{{expiryDate}}/gi, expiryDateStr)
                                    .replace(/{{remainingQuota}}/gi, String(pkg.remainingCount || 0));
                                result = await sendWhatsApp(customer.phone, msg, waConfig);
                            }
                            if (result.success) {
                                pkgSentCount++;
                            } else {
                                console.error(`[AUTOMATION:package_expiry] Gagal kirim ke ${customer.name} (${customer.phone}): ${result.error}`);
                            }
                            await new Promise(r => setTimeout(r, 10000));
                        }
                        if (pkgSentCount > 0 || expiringPackages.length === 0) {
                            ruleSuccess = true;
                        }
                        console.log(`[AUTOMATION:package_expiry] sent: ${pkgSentCount} / ${pkgTotal}`);
                    }
                    else if (rule.category === 'birthday' && rule.targetRole === 'customer') {
                        // BUG-06 FIX: Gunakan WIB timezone agar birthday match benar walau server UTC
                        const tz = 'Asia/Jakarta';
                        const month = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'numeric' }).format(now));
                        const day = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: tz, day: 'numeric' }).format(now));

                        const birthdayCustomers = await Customer.find({
                            waNotifEnabled: true,
                            phone: { $exists: true, $ne: '' },
                            birthday: { $exists: true, $ne: null },
                            $expr: {
                                $and: [
                                    { $eq: [{ $month: { date: '$birthday', timezone: 'Asia/Jakarta' } }, month] },
                                    { $eq: [{ $dayOfMonth: { date: '$birthday', timezone: 'Asia/Jakarta' } }, day] }
                                ]
                            }
                        }).lean();

                        let bdaySentCount = 0;
                        const bdayTemplate: any = (rule as any).waTemplateId || null;
                        const bdayUseWaba = Boolean(wabaConfig) && Boolean(bdayTemplate);
                        for (const customer of birthdayCustomers) {
                            let result: { success: boolean; error?: string };
                            if (bdayUseWaba) {
                                const r = await sendAutomationViaWaba(wabaConfig!, bdayTemplate, customer.phone, {
                                    nama_customer: customer.name, customername: customer.name, customer_name: customer.name, nama: customer.name,
                                    storename: storeName, store_name: storeName, nama_toko: storeName, toko: storeName, salon: storeName,
                                }, { customerName: customer.name, storeName }, templateIdCache);
                                result = { success: r.ok, error: r.error };
                            } else {
                                // BUG-06 FIX: Replace semua variabel termasuk storeName
                                const msg = rule.messageTemplate
                                    .replace(/{{nama_customer}}|{{customerName}}/gi, customer.name)
                                    .replace(/{{storeName}}/gi, settings.storeName || 'Salon');
                                result = await sendWhatsApp(customer.phone, msg, waConfig);
                            }
                            if (result.success) {
                                bdaySentCount++;
                            } else {
                                console.error(`[AUTOMATION:birthday] Gagal kirim ke ${customer.name} (${customer.phone}): ${result.error}`);
                            }
                            await new Promise(r => setTimeout(r, 10000));
                        }
                        if (bdaySentCount > 0 || birthdayCustomers.length === 0) {
                            ruleSuccess = true;
                        }
                        console.log(`[AUTOMATION:birthday] sent: ${bdaySentCount} / ${birthdayCustomers.length}`);
                    }

                    // If it failed completely, rollback the lock so it retries next tick
                    if (!ruleSuccess) {
                        await WaAutomation.findByIdAndUpdate(rule._id, { $unset: { lastRunDate: 1 } });
                        console.log(`[AUTOMATION] Rule ${rule.category} failed, lock removed for retry.`);
                    }

                } catch (e: any) {
                    try {
                        await WaAutomation.findByIdAndUpdate(rule._id, { $unset: { lastRunDate: 1 } });
                    } catch (rollbackErr: any) {
                        console.error(`[AUTOMATION] Failed to rollback lock for rule ${rule._id}:`, rollbackErr.message);
                    }
                    console.error(`[AUTOMATION:${rule.category}][${slug}] Error:`, e.message);
                }
            }
        } catch (e) {
            console.error(`processAutomations error for tenant "${slug}":`, e);
        }
    }
}

export async function processPendingWaSchedules(now: Date = new Date()): Promise<ProcessResult> {
    const slugs = await getAllTenantSlugs();
    let totalSent = 0;
    let totalFailed = 0;
    let totalCount = 0;

    for (const slug of slugs) {
        try {
            const models = await getTenantModels(slug);
            const { WaSchedule } = models;
            const followUpSettings: any = await models.Settings.findOne() || {};

            // FOLLOW-UP MIGRASI KE WABA (permintaan klien): kalau tenant punya BalesOtomatis
            // WABA terkonfigurasi, follow-up dikirim via Send Template (template pre-approved
            // Meta), BUKAN free-text — karena follow-up hampir selalu jatuh di luar window
            // 24 jam sehingga free-text pasti ditolak. Deteksi via purpose 'campaign' (selalu
            // route ke WABA saat hybrid ON, atau provider tunggal balesotomatis-waba saat
            // hybrid OFF). Kalau bukan WABA → tenant non-WABA → tetap jalur free-text Fonnte
            // (backward compat, jangan merusak tenant lain yang cuma pakai Fonnte).
            const wabaCandidate = getWaProviderConfigForPurpose(followUpSettings, 'campaign');
            const wabaConfig =
                wabaCandidate.provider === 'balesotomatis' && wabaCandidate.balesotomatis?.mode === 'waba'
                    ? wabaCandidate.balesotomatis
                    : null;
            const fallbackConfig = getWaProviderConfigForPurpose(followUpSettings, 'notification');
            const storeName = followUpSettings.storeName || 'Salon';

            // Cache resolusi ID NUMERIK Meta per-tick per-tenant: banyak schedule bisa share
            // template yang sama, jadi jangan hammer /get-template-list. Hasil null juga
            // di-cache supaya template yang gagal resolve gak dihit API berulang tick ini.
            const templateIdCache = new Map<string, string | null>();

            const pendingSchedules = await WaSchedule.find({
                scheduledAt: { $lte: now },
                status: 'pending',
            }).select('_id');

            for (const sched of pendingSchedules) {
                // Atomic claim to prevent race conditions
                const schedule = await WaSchedule.findOneAndUpdate(
                    { _id: sched._id, status: 'pending' },
                    { $set: { status: 'processing', processedAt: new Date() } },
                    { new: true }
                )
                    .populate('customerId', 'name')
                    .populate('templateId', 'name message metaTemplateName metaLanguage metaVariables metaStatus')
                    .populate({
                        path: 'transactionId',
                        select: 'items',
                    });

                if (!schedule) continue; // Already claimed by another worker

                totalCount += 1;
                try {
                    const template: any = schedule.templateId;
                    if (!template) {
                        const errMsg = `Template tidak ditemukan (templateId: ${schedule.templateId})`;
                        console.error(`[WaSchedule:${slug}] Schedule ${schedule._id} failed: ${errMsg}`);
                        await WaSchedule.findByIdAndUpdate(schedule._id, { status: 'failed', error: errMsg });
                        totalFailed += 1;
                        continue;
                    }

                    const customer: any = schedule.customerId;
                    const transaction: any = schedule.transactionId;
                    const serviceNames = (transaction?.items || [])
                        .filter((item: any) => item?.itemModel === 'Service')
                        .map((item: any) => String(item?.name || '').trim())
                        .filter(Boolean);
                    const selectedServiceName = String((schedule as any).serviceName || '').trim();
                    const customerName = String(customer?.name || 'Pelanggan');
                    const serviceName = selectedServiceName || (serviceNames.length > 0 ? serviceNames.join(', ') : 'Layanan');
                    const followUpDateStr = new Intl.DateTimeFormat('id-ID', {
                        timeZone: 'Asia/Jakarta', dateStyle: 'long',
                    }).format(now);

                    let result;
                    if (wabaConfig) {
                        // ---- JALUR WABA: Send Template (pre-approved Meta) ----
                        const metaName = String(template.metaTemplateName || template.name || '').trim();
                        if (!metaName) {
                            const errMsg = 'Template WABA belum punya nama Meta (metaTemplateName kosong). Daftarkan & approve template di menu Template WhatsApp.';
                            console.error(`[WaSchedule:${slug}] Schedule ${schedule._id} failed: ${errMsg}`);
                            await WaSchedule.findByIdAndUpdate(schedule._id, { status: 'failed', error: errMsg });
                            totalFailed += 1;
                            continue;
                        }

                        // Resolusi ID numerik Meta (cached per-tick). /send_message_template minta
                        // field `template` = ID numerik, BUKAN nama. Kalau gagal resolve (belum
                        // APPROVED / dihapus di dashboard) → tandai failed dgn pesan jelas. JANGAN
                        // fallback ke Fonnte free-text: klien minta follow-up murni WABA.
                        let resolvedTemplateId: string | null;
                        if (templateIdCache.has(metaName)) {
                            resolvedTemplateId = templateIdCache.get(metaName) ?? null;
                        } else {
                            resolvedTemplateId = await getBalesOtomatisTemplateId(
                                wabaConfig.secretKey,
                                wabaConfig.licensesKey,
                                metaName
                            );
                            templateIdCache.set(metaName, resolvedTemplateId);
                        }

                        if (!resolvedTemplateId) {
                            const errMsg = `Template WABA "${metaName}" belum APPROVED / tidak ditemukan di BalesOtomatis (status lokal: ${template.metaStatus || 'LOCAL'}). Cek & daftarkan/approve di menu Template WhatsApp.`;
                            console.error(`[WaSchedule:${slug}] Schedule ${schedule._id} failed: ${errMsg}`);
                            await WaSchedule.findByIdAndUpdate(schedule._id, { status: 'failed', error: errMsg });
                            totalFailed += 1;
                            continue;
                        }

                        const templateVars: string[] =
                            (Array.isArray(template.metaVariables) && template.metaVariables.length > 0)
                                ? template.metaVariables
                                : extractTemplateVariables(template.message || '');
                        // Follow-up gak punya nilai eksplisit (beda dgn campaign yg diisi user di UI),
                        // jadi values kosong → buildTemplateParameters fallback ke token by-nama.
                        const parameters = buildTemplateParameters(templateVars, {}, {
                            customerName,
                            storeName,
                            date: followUpDateStr,
                            serviceName,
                        });
                        result = await sendTemplateViaBalesOtomatis(
                            wabaConfig,
                            schedule.phoneNumber,
                            resolvedTemplateId,
                            template.metaLanguage || 'id',
                            parameters
                        );
                    } else {
                        // ---- JALUR FALLBACK: free-text Fonnte (tenant non-WABA, backward compat) ----
                        if (!template.message) {
                            const errMsg = `Template message kosong (templateId: ${schedule.templateId})`;
                            console.error(`[WaSchedule:${slug}] Schedule ${schedule._id} failed: ${errMsg}`);
                            await WaSchedule.findByIdAndUpdate(schedule._id, { status: 'failed', error: errMsg });
                            totalFailed += 1;
                            continue;
                        }
                        const message = fillTemplate(template.message, {
                            nama_customer: customerName,
                            nama_service: serviceName,
                        });
                        result = await sendWhatsApp(schedule.phoneNumber, message, fallbackConfig);
                    }

                    if (result.success) {
                        await WaSchedule.findByIdAndUpdate(schedule._id, {
                            status: 'sent',
                            sentAt: new Date(),
                        });
                        totalSent += 1;
                        console.log(`[WaSchedule:${slug}] ✅ Sent to ${schedule.phoneNumber}${wabaConfig ? ' (WABA template)' : ' (Fonnte)'}`);
                    } else {
                        await WaSchedule.findByIdAndUpdate(schedule._id, {
                            status: 'failed',
                            error: result.error || 'Gagal mengirim (unknown)',
                        });
                        totalFailed += 1;
                        console.log(`[WaSchedule:${slug}] ❌ Failed to send to ${schedule.phoneNumber}: ${result.error}`);
                    }
                } catch (error: any) {
                    await WaSchedule.findByIdAndUpdate(schedule._id, {
                        status: 'failed',
                        error: error?.message || 'Exception saat pengiriman follow-up',
                    });
                    totalFailed += 1;
                    console.error(`[WaSchedule:${slug}] ❌ Error sending schedule ${schedule._id}: ${error?.message}`);
                }
            }
        } catch (e) {
            console.error(`processPendingWaSchedules error for tenant "${slug}":`, e);
        }
    }

    return {
        total: totalCount,
        sent: totalSent,
        failed: totalFailed,
    };
}

export function startWaScheduler() {
    if (schedulerStarted) return;

    // Vercel functions are ephemeral. Use Vercel Cron or external scheduler in production.
    if (process.env.VERCEL === '1') {
        return;
    }

    const rawTimezone = (process.env.TZ || '').trim();
    const normalizedTimezone = rawTimezone.startsWith(':') ? rawTimezone.slice(1) : rawTimezone;

    let schedulerTimezone = DEFAULT_SCHEDULER_TIMEZONE;
    if (normalizedTimezone) {
        try {
            new Intl.DateTimeFormat('en-US', { timeZone: normalizedTimezone });
            schedulerTimezone = normalizedTimezone;
        } catch {
            schedulerTimezone = DEFAULT_SCHEDULER_TIMEZONE;
        }
    }

    // Dynamic import to avoid Vercel edge/serverless function issues
    const cron = require('node-cron');

    const configuredCron = String(process.env.WA_SCHEDULER_CRON || DEFAULT_SCHEDULER_CRON).trim();
    const schedulerCron = cron.validate(configuredCron) ? configuredCron : DEFAULT_SCHEDULER_CRON;

    console.log(`[SCHEDULER] Starting with cron="${schedulerCron}" timezone="${schedulerTimezone}"`);

    cron.schedule(
        schedulerCron,
        async () => {
            const tick = new Date().toISOString();
            console.log(`[SCHEDULER] tick at ${tick}`);
            try {
                const result = await processPendingWaSchedules();
                if (result.total > 0 || result.sent > 0 || result.failed > 0) {
                    console.log(`[SCHEDULER] WaSchedule — total: ${result.total}, sent: ${result.sent}, failed: ${result.failed}`);
                }
            } catch (e) {
                console.error('[SCHEDULER] processPendingWaSchedules error:', e);
            }
            try {
                console.log('[SCHEDULER] Running processPendingCampaigns...');
                await processPendingCampaigns();
                console.log('[SCHEDULER] processPendingCampaigns done');
            } catch (e) {
                console.error('[SCHEDULER] processPendingCampaigns error:', e);
            }
            try {
                await processAutomations();
            } catch (e) {
                console.error('[SCHEDULER] processAutomations error:', e);
            }
            try {
                const backup = await runDueBackups();
                if (backup.written.length > 0) {
                    console.log(`[SCHEDULER] Backup ditulis: ${backup.written.join(', ')}`);
                }
            } catch (e) {
                console.error('[SCHEDULER] runDueBackups error:', e);
            }
        },
        {
            timezone: schedulerTimezone,
        }
    );

    schedulerStarted = true;
    console.log('[SCHEDULER] ✅ Scheduler started successfully');
}