import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mock deps SEBELUM import modul under test ───────────────────────────────
// Menguji processAutomations: kategori customer-facing (birthday / membership_expiry /
// package_expiry) HARUS kirim via WABA Send Template kalau (a) tenant WABA DAN
// (b) rule punya waTemplateId ter-link. Kalau salah satu tidak terpenuhi → jalur
// lama Fonnte free-text dipertahankan (NON-REGRESI).
const {
    mockGetMasterModels,
    mockGetTenantModels,
    mockGetWaProviderConfigForPurpose,
    mockGetBalesOtomatisTemplateId,
    mockSendTemplateViaBalesOtomatis,
    mockBuildTemplateParameters,
    mockExtractTemplateVariables,
    mockSendWhatsApp,
    mockWaAutomationFind,
    mockWaAutomationFOU,
    mockWaAutomationFBIU,
    mockCustomerFind,
    mockCustomerPackageFind,
    state,
} = vi.hoisted(() => {
    const state: any = {
        rules: [],
        customers: [],
        packages: [],
        settings: { storeName: 'Salon Fukomo' },
    };

    // Query thenable: mendukung chaining .select()/.populate()/.lean() lalu di-await.
    const makeQuery = (getValue: () => any) => {
        const q: any = {
            select: () => q,
            populate: () => q,
            lean: () => q,
            sort: () => q,
            then: (resolve: any, reject: any) => Promise.resolve(getValue()).then(resolve, reject),
        };
        return q;
    };

    const mockWaAutomationFind = vi.fn(() => makeQuery(() => state.rules));
    const mockWaAutomationFOU = vi.fn(async () => state.rules[0] || { _id: 'r1' }); // lock claim → truthy
    const mockWaAutomationFBIU = vi.fn().mockResolvedValue({}); // rollback lock on fail
    const mockCustomerFind = vi.fn(() => makeQuery(() => state.customers));
    const mockCustomerPackageFind = vi.fn(() => makeQuery(() => state.packages));

    const tenantModels = {
        WaAutomation: {
            find: mockWaAutomationFind,
            findOneAndUpdate: mockWaAutomationFOU,
            findByIdAndUpdate: mockWaAutomationFBIU,
        },
        Settings: { findOne: vi.fn(async () => state.settings) },
        Customer: { find: mockCustomerFind },
        Product: { find: vi.fn(() => makeQuery(() => [])), updateMany: vi.fn() },
        Invoice: { find: vi.fn(() => makeQuery(() => [])) },
        CustomerPackage: { find: mockCustomerPackageFind },
    };

    return {
        mockGetMasterModels: vi.fn().mockResolvedValue({
            Store: { find: () => ({ select: () => ({ lean: async () => [{ slug: 'coba1' }] }) }) },
        }),
        mockGetTenantModels: vi.fn().mockResolvedValue(tenantModels),
        mockGetWaProviderConfigForPurpose: vi.fn(),
        mockGetBalesOtomatisTemplateId: vi.fn(),
        mockSendTemplateViaBalesOtomatis: vi.fn(),
        mockBuildTemplateParameters: vi.fn(() => [{ type: 'text', text: 'X' }]),
        mockExtractTemplateVariables: vi.fn(() => []),
        mockSendWhatsApp: vi.fn(),
        mockWaAutomationFind,
        mockWaAutomationFOU,
        mockWaAutomationFBIU,
        mockCustomerFind,
        mockCustomerPackageFind,
        state,
    };
});

vi.mock('@/lib/masterDb', () => ({ getMasterModels: mockGetMasterModels }));
vi.mock('@/lib/tenantDb', () => ({ getTenantModels: mockGetTenantModels }));
vi.mock('@/lib/fonnte', () => ({ sendWhatsApp: mockSendWhatsApp }));
vi.mock('@/lib/waProvider', () => ({
    getWaProviderConfigForPurpose: mockGetWaProviderConfigForPurpose,
    getBalesOtomatisTemplateId: mockGetBalesOtomatisTemplateId,
    sendTemplateViaBalesOtomatis: mockSendTemplateViaBalesOtomatis,
    buildTemplateParameters: mockBuildTemplateParameters,
    extractTemplateVariables: mockExtractTemplateVariables,
}));

import { processAutomations } from '@/lib/scheduler';

const WABA_CONFIG = { provider: 'balesotomatis', balesotomatis: { mode: 'waba', secretKey: 'sk', licensesKey: 'lk' } };
const FONNTE_CONFIG = { provider: 'fonnte', fonnteToken: 'ft' };

const APPROVED_TEMPLATE = {
    name: 'Ultah',
    message: 'Selamat ulang tahun {{nama_customer}} dari {{storeName}}',
    metaTemplateName: 'ultah_promo',
    metaLanguage: 'id',
    metaVariables: ['nama_customer'],
    metaStatus: 'APPROVED',
};

const makeRule = (overrides: Record<string, any> = {}) => ({
    _id: 'r1',
    name: 'Ucapan Ultah',
    category: 'birthday',
    targetRole: 'customer',
    frequency: 'daily',
    isActive: true,
    messageTemplate: 'Selamat ulang tahun {{nama_customer}} dari {{storeName}}',
    waTemplateId: null, // default: TIDAK ter-link → jalur Fonnte
    lastRunDate: undefined,
    ...overrides,
});

const routeWaba = () =>
    mockGetWaProviderConfigForPurpose.mockImplementation((_s: any, purpose: string) =>
        purpose === 'campaign' ? WABA_CONFIG : FONNTE_CONFIG,
    );
const routeFonnteOnly = () => mockGetWaProviderConfigForPurpose.mockReturnValue(FONNTE_CONFIG);

const NOW = new Date('2026-08-18T05:00:00Z');

describe('processAutomations — routing reminder & ultah ke WABA', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Buang delay 10 detik antar-kirim biar test tidak nunggu wall-clock.
        vi.stubGlobal('setTimeout', (fn: any) => { fn(); return 0 as any; });
        state.settings = { storeName: 'Salon Fukomo' };
        state.customers = [];
        state.packages = [];
        state.rules = [];
        mockBuildTemplateParameters.mockReturnValue([{ type: 'text', text: 'X' }]);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('birthday: tenant WABA + template ter-link & APPROVED → Send Template, BUKAN Fonnte', async () => {
        routeWaba();
        state.rules = [makeRule({ category: 'birthday', waTemplateId: { ...APPROVED_TEMPLATE } })];
        state.customers = [{ name: 'Andi', phone: '6283161337565', waNotifEnabled: true }];
        mockGetBalesOtomatisTemplateId.mockResolvedValue('999123');
        mockSendTemplateViaBalesOtomatis.mockResolvedValue({ success: true });

        await processAutomations(NOW, 'coba1');

        expect(mockGetBalesOtomatisTemplateId).toHaveBeenCalledWith('sk', 'lk', 'ultah_promo');
        expect(mockSendTemplateViaBalesOtomatis).toHaveBeenCalledTimes(1);
        const [cfg, phone, tplId, lang] = mockSendTemplateViaBalesOtomatis.mock.calls[0];
        expect(cfg).toEqual(WABA_CONFIG.balesotomatis);
        expect(phone).toBe('6283161337565');
        expect(tplId).toBe('999123');
        expect(lang).toBe('id');
        // param dibangun dari metaVariables template + values-map + ctx (nama & toko)
        expect(mockBuildTemplateParameters).toHaveBeenCalledWith(
            ['nama_customer'],
            expect.objectContaining({ nama_customer: 'Andi', storename: 'Salon Fukomo' }),
            expect.objectContaining({ customerName: 'Andi', storeName: 'Salon Fukomo' }),
        );
        // Fonnte TIDAK dipakai untuk jalur WABA
        expect(mockSendWhatsApp).not.toHaveBeenCalled();
    });

    it('birthday: tenant WABA TAPI rule TANPA template ter-link → tetap Fonnte free-text (NON-REGRESI)', async () => {
        routeWaba();
        state.rules = [makeRule({ category: 'birthday', waTemplateId: null })];
        state.customers = [{ name: 'Andi', phone: '6283161337565', waNotifEnabled: true }];
        mockSendWhatsApp.mockResolvedValue({ success: true });

        await processAutomations(NOW, 'coba1');

        expect(mockSendTemplateViaBalesOtomatis).not.toHaveBeenCalled();
        expect(mockGetBalesOtomatisTemplateId).not.toHaveBeenCalled();
        expect(mockSendWhatsApp).toHaveBeenCalledTimes(1);
        const [phone, message, cfg] = mockSendWhatsApp.mock.calls[0];
        expect(phone).toBe('6283161337565');
        expect(message).toContain('Andi'); // {{nama_customer}} ter-fill
        expect(message).toContain('Salon Fukomo'); // {{storeName}} ter-fill
        expect(cfg).toEqual(FONNTE_CONFIG);
    });

    it('birthday: tenant non-WABA (Fonnte) walau template ter-link → tetap Fonnte free-text', async () => {
        routeFonnteOnly();
        // rule ter-link template, tapi tenant bukan WABA → wabaConfig null → Fonnte
        state.rules = [makeRule({ category: 'birthday', waTemplateId: { ...APPROVED_TEMPLATE } })];
        state.customers = [{ name: 'Andi', phone: '6283161337565', waNotifEnabled: true }];
        mockSendWhatsApp.mockResolvedValue({ success: true });

        await processAutomations(NOW, 'coba1');

        expect(mockSendTemplateViaBalesOtomatis).not.toHaveBeenCalled();
        expect(mockSendWhatsApp).toHaveBeenCalledTimes(1);
        expect(mockSendWhatsApp.mock.calls[0][2]).toEqual(FONNTE_CONFIG);
    });

    it('membership_expiry: WABA + template → values-map bawa membershipTier/daysLeft/expiryDate', async () => {
        routeWaba();
        state.rules = [makeRule({
            category: 'membership_expiry',
            daysBefore: 7,
            waTemplateId: { ...APPROVED_TEMPLATE, metaVariables: ['nama_customer', 'membershipTier', 'daysLeft'] },
        })];
        state.customers = [{
            name: 'Sinta', phone: '628111', waNotifEnabled: true,
            membershipTier: 'Gold', membershipExpiry: new Date('2026-08-25T00:00:00Z'),
        }];
        mockGetBalesOtomatisTemplateId.mockResolvedValue('555');
        mockSendTemplateViaBalesOtomatis.mockResolvedValue({ success: true });

        await processAutomations(NOW, 'coba1');

        expect(mockSendTemplateViaBalesOtomatis).toHaveBeenCalledTimes(1);
        expect(mockSendWhatsApp).not.toHaveBeenCalled();
        const [vars, values] = mockBuildTemplateParameters.mock.calls[0];
        expect(vars).toEqual(['nama_customer', 'membershipTier', 'daysLeft']);
        expect(values).toMatchObject({
            nama_customer: 'Sinta',
            membershiptier: 'Gold',
            daysleft: '7',
        });
        expect(values).toHaveProperty('expirydate'); // tanggal kadaluarsa ter-format
    });

    it('package_expiry: WABA + template → values-map bawa packageName & remainingQuota', async () => {
        routeWaba();
        state.rules = [makeRule({
            category: 'package_expiry',
            daysBefore: 3,
            waTemplateId: { ...APPROVED_TEMPLATE, metaVariables: ['nama_customer', 'packageName', 'remainingQuota'] },
        })];
        state.packages = [{
            packageSnapshot: { name: 'Paket Facial 10x' },
            expiresAt: new Date('2026-08-21T00:00:00Z'),
            remainingCount: 4,
            customer: { name: 'Rina', phone: '628222', waNotifEnabled: true },
        }];
        mockGetBalesOtomatisTemplateId.mockResolvedValue('777');
        mockSendTemplateViaBalesOtomatis.mockResolvedValue({ success: true });

        await processAutomations(NOW, 'coba1');

        expect(mockSendTemplateViaBalesOtomatis).toHaveBeenCalledTimes(1);
        expect(mockSendWhatsApp).not.toHaveBeenCalled();
        const [, values] = mockBuildTemplateParameters.mock.calls[0];
        expect(values).toMatchObject({
            nama_customer: 'Rina',
            packagename: 'Paket Facial 10x',
            remainingquota: '4',
        });
    });

    it('WABA + template belum APPROVED → tidak kirim apapun, TIDAK fallback ke Fonnte', async () => {
        routeWaba();
        state.rules = [makeRule({ category: 'birthday', waTemplateId: { ...APPROVED_TEMPLATE } })];
        state.customers = [{ name: 'Andi', phone: '628333', waNotifEnabled: true }];
        mockGetBalesOtomatisTemplateId.mockResolvedValue(null); // tidak APPROVED / tidak ketemu

        await processAutomations(NOW, 'coba1');

        expect(mockSendTemplateViaBalesOtomatis).not.toHaveBeenCalled();
        expect(mockSendWhatsApp).not.toHaveBeenCalled(); // JANGAN fallback ke Fonnte
        // rule gagal total → lock di-rollback biar retry tick berikutnya
        expect(mockWaAutomationFBIU).toHaveBeenCalledWith('r1', { $unset: { lastRunDate: 1 } });
    });

    it('cache templateId per-tick: 2 customer, 1 template → getBalesOtomatisTemplateId 1x', async () => {
        routeWaba();
        state.rules = [makeRule({ category: 'birthday', waTemplateId: { ...APPROVED_TEMPLATE } })];
        state.customers = [
            { name: 'Andi', phone: '628444', waNotifEnabled: true },
            { name: 'Budi', phone: '628555', waNotifEnabled: true },
        ];
        mockGetBalesOtomatisTemplateId.mockResolvedValue('999123');
        mockSendTemplateViaBalesOtomatis.mockResolvedValue({ success: true });

        await processAutomations(NOW, 'coba1');

        expect(mockGetBalesOtomatisTemplateId).toHaveBeenCalledTimes(1); // cache per-tick
        expect(mockSendTemplateViaBalesOtomatis).toHaveBeenCalledTimes(2);
    });
});
