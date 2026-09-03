import { getTenantModels } from "@/lib/tenantDb";
import { NextRequest, NextResponse } from 'next/server';
import { checkPermission, checkPermissionWithSession } from '@/lib/rbac';
import { getWaProviderConfigForPurpose, createBalesOtomatisTemplate, testBalesOtomatisWaba, pickBestMetaTemplates, extractTemplateVariables, appendWaTemplateHistory, parseMetaTimestamp, type MetaTemplateBest, type WaTemplateHistoryEntry } from '@/lib/waProvider';
import { annotateWabaTemplate, applyFolderLabels, belongsToCurrentFolder, bindingFromSettings, groupTemplatesIntoFolders, stampWabaBinding } from '@/lib/wabaBinding';

export async function GET(request: NextRequest, props: any) {
    const tenantSlug = request.headers.get('x-store-slug') || 'pusat';
    const { WaTemplate, Settings } = await getTenantModels(tenantSlug);

    try {
        const { error: posPermErr } = await checkPermissionWithSession(request, 'pos', 'view');
        if (posPermErr) {
            const { error: waPermErr } = await checkPermissionWithSession(request, 'waTemplates', 'view');
            if (waPermErr) return waPermErr;
        }

        let isWaba = false;
        let wabaBinding = bindingFromSettings(null, '');
        try {
            const settings = await Settings.findOne({}).lean();
            const waConfig = getWaProviderConfigForPurpose(settings, 'campaign');
            if (waConfig.provider === 'balesotomatis' && waConfig.balesotomatis?.mode === 'waba') {
                isWaba = true;
                const { secretKey, licensesKey } = waConfig.balesotomatis;
                wabaBinding = bindingFromSettings(settings, licensesKey);
                const result = await testBalesOtomatisWaba(secretKey, licensesKey);
                if (result.success && result.templates && Array.isArray(result.templates)) {
                    // Ciutkan list Meta jadi SATU entri terbaik per nama SEBELUM reconcile, supaya
                    // entri DRAFT duplikat tidak menurunkan status APPROVED (lihat pickBestMetaTemplates).
                    const best = pickBestMetaTemplates(result.templates);
                    const localTemplates = await WaTemplate.find({});
                    const matchedNames = new Set<string>();

                    // 1) Reconcile HANYA template di folder nomor setting ini (atau belum masuk folder).
                    // Jangan pindahkan template folder nomor lain — itu folder terpisah.
                    for (const loc of localTemplates) {
                        if (!belongsToCurrentFolder(loc, wabaBinding)) continue;
                        const cleanLoc = String(loc.name || '').toLowerCase().replace(/[^a-z0-9_]/g, '_');
                        const candidates = [cleanLoc, String(loc.name || '').toLowerCase(), String(loc.metaTemplateName || '').toLowerCase()];
                        let hit: MetaTemplateBest | undefined;
                        let hitName = '';
                        for (const c of candidates) {
                            if (c && best.has(c)) { hit = best.get(c); hitName = c; break; }
                        }
                        if (!hit) continue;
                        matchedNames.add(hitName);
                        const nextId = hit.templateId || undefined;

                        let changed = false;
                        const prevStatus = loc.metaStatus;
                        if (loc.metaStatus !== hit.status) { loc.metaStatus = hit.status; changed = true; }
                        if (loc.metaTemplateName !== hitName) { loc.metaTemplateName = hitName; changed = true; }
                        if (loc.metaTemplateId !== nextId) { loc.metaTemplateId = nextId; changed = true; }
                        const prevFp = loc.wabaLicensesFingerprint;
                        const prevPhone = loc.wabaPhone;
                        stampWabaBinding(loc, wabaBinding);
                        if (loc.wabaLicensesFingerprint !== prevFp || loc.wabaPhone !== prevPhone) changed = true;

                        // Riwayat pendaftaran: kalau belum ada riwayat sama sekali, seed SATU baseline
                        // pakai tanggal registrasi asli dari Meta (bukan "sekarang") supaya template lama
                        // punya titik awal yang benar. Kalau sudah ada riwayat & status benar-benar
                        // berubah, catat transisinya. Reconcile jalan tiap buka halaman, jadi kita HANYA
                        // menambah entri saat ada perubahan nyata (bukan tiap GET).
                        const historyEmpty = !Array.isArray(loc.metaHistory) || loc.metaHistory.length === 0;
                        if (historyEmpty) {
                            loc.metaHistory = appendWaTemplateHistory(undefined, {
                                action: 'synced',
                                status: hit.status,
                                at: parseMetaTimestamp(hit.createdAt) || undefined,
                                note: 'Status awal terpantau (sinkron dari Meta)',
                            });
                            changed = true;
                        } else if (prevStatus !== hit.status) {
                            loc.metaHistory = appendWaTemplateHistory(loc.metaHistory as WaTemplateHistoryEntry[], {
                                action: 'status_change',
                                status: hit.status,
                                note: `Status berubah ${prevStatus || 'LOCAL'} → ${hit.status} (sinkron dari Meta${hit.rawStatus ? `: ${hit.rawStatus}` : ''})`,
                            });
                            changed = true;
                        }

                        // Backfill body + variabel HANYA untuk row STUB hasil sync (message kosong
                        // atau cuma berisi nama template itu sendiri). Ini bikin follow-up WABA punya
                        // jumlah variabel yang benar ({{1}},{{2}}). Free-text asli user TIDAK ditimpa.
                        const curMsg = String(loc.message || '').trim();
                        const isStub = !curMsg
                            || curMsg === hitName
                            || curMsg.toLowerCase() === String(loc.name || '').toLowerCase();
                        if (hit.content && isStub) {
                            if (loc.message !== hit.content) { loc.message = hit.content; changed = true; }
                            const hasVars = Array.isArray(loc.metaVariables) && loc.metaVariables.length > 0;
                            if (!hasVars) {
                                const vars = extractTemplateVariables(hit.content);
                                if (vars.length > 0) { loc.metaVariables = vars; changed = true; }
                            }
                        }
                        if (changed) await loc.save();
                    }

                    // 2) Entri Meta yang belum ada di FOLDER nomor setting ini → buat di folder ini.
                    const currentFolderKey = wabaBinding.phone || '';
                    const namesInCurrentFolder = new Set(
                        localTemplates
                            .filter((loc: any) => belongsToCurrentFolder(loc, wabaBinding))
                            .flatMap((loc: any) => [
                                String(loc.metaTemplateName || '').toLowerCase(),
                                String(loc.name || '').toLowerCase().replace(/[^a-z0-9_]/g, '_'),
                            ].filter(Boolean))
                    );
                    for (const [metaName, b] of best) {
                        if (matchedNames.has(metaName) || namesInCurrentFolder.has(metaName)) continue;
                        if (!currentFolderKey) continue;
                        const bodyText = b.content || metaName;
                        const vars = b.content ? extractTemplateVariables(b.content) : [];
                        await WaTemplate.create({
                            name: metaName,
                            message: bodyText,
                            templateType: 'follow_up',
                            isGreetingEnabled: false,
                            metaStatus: b.status,
                            metaTemplateName: metaName,
                            metaTemplateId: b.templateId || undefined,
                            metaVariables: vars.length ? vars : undefined,
                            wabaPhone: wabaBinding.phone || undefined,
                            wabaLicensesFingerprint: wabaBinding.fingerprint || undefined,
                            metaHistory: appendWaTemplateHistory(undefined, {
                                action: 'synced',
                                status: b.status,
                                at: parseMetaTimestamp(b.createdAt) || undefined,
                                note: 'Ditemukan & disinkron dari Meta',
                            }),
                        });
                    }
                }
            }
        } catch (e) {
            // Ignore sync error so list fetch still succeeds
        }

        // Template tanpa nomor → masuk folder nomor yang sedang dipakai di Pengaturan.
        if (isWaba && wabaBinding.phone) {
            const unfiled = await WaTemplate.find({
                $or: [
                    { wabaPhone: { $exists: false } },
                    { wabaPhone: null },
                    { wabaPhone: '' },
                ],
            });
            for (const loc of unfiled) {
                stampWabaBinding(loc, wabaBinding);
                await loc.save();
            }
        }

        const { searchParams } = new URL(request.url);
        const search = String(searchParams.get('search') || '').trim();
        const type = String(searchParams.get('type') || '').trim();
        const templateType = type === 'greeting' || type === 'follow_up' ? type : '';

        const query: any = {};
        if (search) {
            query.name = { $regex: search, $options: 'i' };
        }

        if (templateType === 'follow_up') {
            query.$or = [
                { templateType: 'follow_up' },
                { templateType: { $exists: false } }, // legacy templates before templateType exists
            ];
        } else if (templateType === 'greeting') {
            query.$or = [
                { templateType: 'greeting' },
                { templateType: { $exists: false }, isGreetingEnabled: true }, // legacy greeting template
            ];
        }

        // Assignment dropdown (mis. follow-up per-service): kalau tenant WABA-mode, follow-up
        // HANYA terkirim dgn template APPROVED (lihat scheduler Fase 1). Sembunyikan yang belum
        // approved supaya user tidak salah pilih. Tenant Fonnte-only tetap free-text → tampil semua.
        const assignable = String(searchParams.get('assignable') || '') === '1';
        if (assignable && isWaba) {
            query.metaStatus = 'APPROVED';
        }

        const templates = await WaTemplate.find(query).sort({ createdAt: -1 });
        let data = templates.map((t: any) => {
            const o = typeof t.toObject === 'function' ? t.toObject() : t;
            return { ...o, ...annotateWabaTemplate(o, wabaBinding) };
        });
        if (assignable && isWaba) {
            data = data.filter((t: any) => t.usable);
        }

        return NextResponse.json({
            success: true,
            data,
            waba: isWaba,
            currentWabaPhone: wabaBinding.phone || '',
            folders: applyFolderLabels(
                groupTemplatesIntoFolders(data, wabaBinding),
                (await Settings.findOne({}).lean() as any)?.wabaTemplateFolderLabels,
            ),
        });
    } catch (error: any) {
        return NextResponse.json(
            { success: false, error: error?.message || 'Failed to fetch WA templates' },
            { status: 500 }
        );
    }
}

export async function POST(request: NextRequest, props: any) {
    const tenantSlug = request.headers.get('x-store-slug') || 'pusat';
    const { WaTemplate, Settings } = await getTenantModels(tenantSlug);

    try {
        const permissionError = await checkPermission(request, 'waTemplates', 'create');
        if (permissionError) return permissionError;



        const body = await request.json();
        const name = String(body?.name || '').trim();
        const message = String(body?.message || '').trim();
        const requestedType = String(body?.templateType || '').trim();
        const templateType = requestedType === 'greeting' || requestedType === 'follow_up'
            ? requestedType
            : (Boolean(body?.isGreetingEnabled) ? 'greeting' : 'follow_up');
        const isGreetingEnabled = Boolean(body?.isGreetingEnabled);
        const submitToMeta = Boolean(body?.submitToMeta);
        const requestedCategory = String(body?.metaCategory || '').trim().toUpperCase();
        const metaCategory = requestedCategory === 'MARKETING' || requestedCategory === 'UTILITY'
            ? requestedCategory
            : 'UTILITY';

        if (!name || !message) {
            return NextResponse.json(
                { success: false, error: 'name and message are required' },
                { status: 400 }
            );
        }

        if (isGreetingEnabled && templateType !== 'greeting') {
            return NextResponse.json(
                { success: false, error: 'Only greeting templates can be set as active greeting' },
                { status: 400 }
            );
        }

        if (isGreetingEnabled) {
            await WaTemplate.updateMany({}, { $set: { isGreetingEnabled: false } });
        }

        let metaStatus: 'LOCAL' | 'PENDING' | 'APPROVED' | 'REJECTED' = 'LOCAL';
        let metaTemplateName = '';
        let metaVariables: string[] | undefined;
        let metaWarning: string | undefined;
        let metaHistory: WaTemplateHistoryEntry[] | undefined;
        let wabaPhone: string | undefined;
        let wabaLicensesFingerprint: string | undefined;

        const settings = await Settings.findOne({}).lean();
        const waConfig = getWaProviderConfigForPurpose(settings, 'campaign');
        const bo = waConfig.balesotomatis;
        const isWaba = waConfig.provider === 'balesotomatis' && bo?.mode === 'waba';
        if (isWaba && bo && bo.mode === 'waba') {
            const bind = bindingFromSettings(settings, bo.licensesKey || '');
            wabaPhone = bind.phone || undefined;
            wabaLicensesFingerprint = bind.fingerprint || undefined;
        }

        if (submitToMeta) {
            if (isWaba && bo && bo.mode === 'waba') {
                const { secretKey, licensesKey } = bo;
                const result = await createBalesOtomatisTemplate(secretKey, licensesKey, name, message, metaCategory);
                if (result.success) {
                    metaStatus = 'PENDING';
                    metaTemplateName = name.toLowerCase().replace(/[^a-z0-9_]/g, '_');
                    metaVariables = result.variables;
                } else {
                    // Jangan bohongin user — simpan lokal (LOCAL) tapi kasih tau kenapa gagal ke Meta.
                    metaWarning = result.error || 'Template gagal diajukan ke Meta, tersimpan sebagai lokal.';
                }
            } else {
                metaWarning = 'WhatsApp Business API (WABA) belum aktif di Pengaturan → WhatsApp Provider. Template tersimpan sebagai lokal.';
            }
            // Catat percobaan pendaftaran (berhasil maupun gagal) sebagai entri riwayat pertama.
            metaHistory = appendWaTemplateHistory(undefined, metaStatus === 'PENDING'
                ? { action: 'submitted', status: 'PENDING', note: 'Template dibuat & diajukan ke Meta' }
                : { action: 'submitted', status: 'LOCAL', note: `Gagal diajukan ke Meta: ${metaWarning}` });
        }

        const template = await WaTemplate.create({
            name,
            message,
            templateType,
            isGreetingEnabled,
            metaStatus,
            metaCategory,
            metaTemplateName: metaTemplateName || undefined,
            metaVariables,
            metaHistory,
            wabaPhone,
            wabaLicensesFingerprint,
        });

        return NextResponse.json({ success: true, data: template, warning: metaWarning });
    } catch (error: any) {
        return NextResponse.json(
            { success: false, error: error?.message || 'Failed to create WA template' },
            { status: 500 }
        );
    }
}