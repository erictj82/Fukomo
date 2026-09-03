import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock deps SEBELUM import modul under test ───────────────────────────────
const {
    mockGetMasterModels,
    mockGetTenantModels,
    mockGetWaProviderConfigForPurpose,
    mockGetBalesOtomatisTemplateId,
    mockSendTemplateViaBalesOtomatis,
    mockBuildTemplateParameters,
    mockExtractTemplateVariables,
    mockSendWhatsApp,
    mockSettingsFindOne,
    mockFindOneAndUpdate,
    mockFindByIdAndUpdate,
    mockWaScheduleFind,
    state,
} = vi.hoisted(() => {
    const state: any = {
        pending: [{ _id: 's1' }],
        scheduleDoc: null,
    };

    // Query thenable: mendukung chaining .select()/.populate() lalu di-await.
    const makeQuery = (value: any) => {
        const q: any = {
            select: () => q,
            populate: () => q,
            lean: () => q,
            then: (resolve: any, reject: any) => Promise.resolve(value).then(resolve, reject),
        };
        return q;
    };

    const mockWaScheduleFind = vi.fn(() => makeQuery(state.pending));
    const mockFindOneAndUpdate = vi.fn(() => makeQuery(state.scheduleDoc));
    const mockFindByIdAndUpdate = vi.fn().mockResolvedValue({});
    const mockSettingsFindOne = vi.fn(async () => state.settings);

    const tenantModels = {
        Settings: { findOne: mockSettingsFindOne },
        WaSchedule: {
            find: mockWaScheduleFind,
            findOneAndUpdate: mockFindOneAndUpdate,
            findByIdAndUpdate: mockFindByIdAndUpdate,
        },
    };

    const mockGetTenantModels = vi.fn().mockResolvedValue(tenantModels);
    const mockGetMasterModels = vi.fn().mockResolvedValue({
        Store: { find: () => ({ select: () => ({ lean: async () => [{ slug: 'coba1' }] }) }) },
    });

    return {
        mockGetMasterModels,
        mockGetTenantModels,
        mockGetWaProviderConfigForPurpose: vi.fn(),
        mockGetBalesOtomatisTemplateId: vi.fn(),
        mockSendTemplateViaBalesOtomatis: vi.fn(),
        mockBuildTemplateParameters: vi.fn(() => [{ type: 'text', text: 'X' }]),
        mockExtractTemplateVariables: vi.fn(() => []),
        mockSendWhatsApp: vi.fn(),
        mockSettingsFindOne,
        mockFindOneAndUpdate,
        mockFindByIdAndUpdate,
        mockWaScheduleFind,
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

import { processPendingWaSchedules } from '@/lib/scheduler';
import { wabaLicensesFingerprint } from '@/lib/wabaBinding';

const WABA_CONFIG = { provider: 'balesotomatis', balesotomatis: { mode: 'waba', secretKey: 'sk', licensesKey: 'lk' } };
const FONNTE_CONFIG = { provider: 'fonnte', fonnteToken: 'ft' };
const LK_FP = wabaLicensesFingerprint('lk');

const makeScheduleDoc = (templateOverrides: Record<string, any> = {}) => ({
    _id: 's1',
    phoneNumber: '6283161337565',
    serviceName: 'Korean Glass Skin',
    customerId: { name: 'Andi' },
    templateId: {
        name: 'Follow Up 1',
        message: 'Halo {{nama_customer}}, gimana hasil {{nama_service}}?',
        metaTemplateName: 'fu_ke1',
        metaLanguage: 'id',
        metaVariables: ['nama_customer', 'nama_service'],
        metaStatus: 'APPROVED',
        wabaLicensesFingerprint: LK_FP,
        wabaPhone: '628111111111',
        ...templateOverrides,
    },
    transactionId: { items: [{ itemModel: 'Service', name: 'Korean Glass Skin' }] },
});

describe('processPendingWaSchedules — routing follow-up ke WABA', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        state.pending = [{ _id: 's1' }];
        state.settings = { storeName: 'Salon Fukomo', balesotomatisWabaPhone: '628111111111' };
        state.scheduleDoc = makeScheduleDoc();
        mockGetMasterModels.mockResolvedValue({
            Store: { find: () => ({ select: () => ({ lean: async () => [{ slug: 'coba1' }] }) }) },
        });
    });

    it('tenant WABA + template APPROVED → kirim via Send Template, BUKAN Fonnte', async () => {
        mockGetWaProviderConfigForPurpose.mockImplementation((_s: any, purpose: string) =>
            purpose === 'campaign' ? WABA_CONFIG : FONNTE_CONFIG,
        );
        mockGetBalesOtomatisTemplateId.mockResolvedValue('999123');
        mockSendTemplateViaBalesOtomatis.mockResolvedValue({ success: true });

        const res = await processPendingWaSchedules(new Date('2026-08-18T03:00:00Z'));

        expect(mockGetBalesOtomatisTemplateId).toHaveBeenCalledWith('sk', 'lk', 'fu_ke1');
        expect(mockSendTemplateViaBalesOtomatis).toHaveBeenCalledTimes(1);
        const [cfg, phone, tplId, lang] = mockSendTemplateViaBalesOtomatis.mock.calls[0];
        expect(cfg).toEqual(WABA_CONFIG.balesotomatis);
        expect(phone).toBe('6283161337565');
        expect(tplId).toBe('999123');
        expect(lang).toBe('id');
        // Param dibangun dgn ctx yang bawa serviceName
        expect(mockBuildTemplateParameters).toHaveBeenCalledWith(
            ['nama_customer', 'nama_service'],
            {},
            expect.objectContaining({ customerName: 'Andi', serviceName: 'Korean Glass Skin', storeName: 'Salon Fukomo' }),
        );
        // Fonnte TIDAK dipakai
        expect(mockSendWhatsApp).not.toHaveBeenCalled();
        expect(mockFindByIdAndUpdate).toHaveBeenCalledWith('s1', expect.objectContaining({ status: 'sent' }));
        expect(res).toEqual({ total: 1, sent: 1, failed: 0 });
    });

    it('tenant WABA + template BELUM APPROVED → failed dgn error jelas, tanpa kirim apapun', async () => {
        mockGetWaProviderConfigForPurpose.mockImplementation((_s: any, purpose: string) =>
            purpose === 'campaign' ? WABA_CONFIG : FONNTE_CONFIG,
        );
        mockGetBalesOtomatisTemplateId.mockResolvedValue(null); // tidak APPROVED / tidak ketemu

        const res = await processPendingWaSchedules(new Date('2026-08-18T03:00:00Z'));

        expect(mockSendTemplateViaBalesOtomatis).not.toHaveBeenCalled();
        expect(mockSendWhatsApp).not.toHaveBeenCalled(); // JANGAN fallback ke Fonnte
        const failCall = mockFindByIdAndUpdate.mock.calls.find((c) => c[1]?.status === 'failed');
        expect(failCall).toBeTruthy();
        expect(String(failCall![1].error)).toMatch(/APPROVED|tidak ditemukan/i);
        expect(res).toEqual({ total: 1, sent: 0, failed: 1 });
    });

    it('tenant non-WABA (Fonnte) → fallback free-text via Fonnte, tanpa Send Template', async () => {
        mockGetWaProviderConfigForPurpose.mockReturnValue(FONNTE_CONFIG); // campaign & notification sama2 fonnte
        mockSendWhatsApp.mockResolvedValue({ success: true });

        const res = await processPendingWaSchedules(new Date('2026-08-18T03:00:00Z'));

        expect(mockGetBalesOtomatisTemplateId).not.toHaveBeenCalled();
        expect(mockSendTemplateViaBalesOtomatis).not.toHaveBeenCalled();
        expect(mockSendWhatsApp).toHaveBeenCalledTimes(1);
        const [phone, message, cfg] = mockSendWhatsApp.mock.calls[0];
        expect(phone).toBe('6283161337565');
        expect(message).toContain('Andi'); // {{nama_customer}} ter-fill
        expect(message).toContain('Korean Glass Skin'); // {{nama_service}} ter-fill
        expect(cfg).toEqual(FONNTE_CONFIG);
        expect(mockFindByIdAndUpdate).toHaveBeenCalledWith('s1', expect.objectContaining({ status: 'sent' }));
        expect(res).toEqual({ total: 1, sent: 1, failed: 0 });
    });

    it('mengcache resolusi templateId per-tick (2 schedule, template sama → 1 hit API)', async () => {
        // Dua schedule pending; keduanya resolve ke doc dgn metaTemplateName sama ('fu_ke1'),
        // jadi getBalesOtomatisTemplateId cukup dipanggil sekali (cache per-tick).
        state.pending = [{ _id: 's1' }, { _id: 's2' }];
        mockGetWaProviderConfigForPurpose.mockImplementation((_s: any, purpose: string) =>
            purpose === 'campaign' ? WABA_CONFIG : FONNTE_CONFIG,
        );
        mockGetBalesOtomatisTemplateId.mockResolvedValue('999123');
        mockSendTemplateViaBalesOtomatis.mockResolvedValue({ success: true });

        const res = await processPendingWaSchedules(new Date('2026-08-18T03:00:00Z'));

        expect(mockGetBalesOtomatisTemplateId).toHaveBeenCalledTimes(1); // cache: 2 schedule, 1 resolve
        expect(mockSendTemplateViaBalesOtomatis).toHaveBeenCalledTimes(2);
        expect(res).toEqual({ total: 2, sent: 2, failed: 0 });
    });

    it('tenant WABA + template nomor lain → failed, tidak kirim', async () => {
        state.scheduleDoc = makeScheduleDoc({
            wabaLicensesFingerprint: wabaLicensesFingerprint('other-license'),
            wabaPhone: '628999999999',
        });
        mockGetWaProviderConfigForPurpose.mockImplementation((_s: any, purpose: string) =>
            purpose === 'campaign' ? WABA_CONFIG : FONNTE_CONFIG,
        );

        const res = await processPendingWaSchedules(new Date('2026-08-18T03:00:00Z'));

        expect(mockSendTemplateViaBalesOtomatis).not.toHaveBeenCalled();
        expect(mockSendWhatsApp).not.toHaveBeenCalled();
        const failCall = mockFindByIdAndUpdate.mock.calls.find((c) => c[1]?.status === 'failed');
        expect(String(failCall![1].error)).toMatch(/folder nomor lain/i);
        expect(res).toEqual({ total: 1, sent: 0, failed: 1 });
    });
});
