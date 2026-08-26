import { describe, it, expect, vi, beforeEach } from 'vitest';
import zlib from 'zlib';
import {
    parseBackupJson,
    decodeUploadedBackup,
    previewRestore,
    restoreBackup,
} from '@/lib/backup';

// Restore menyentuh getTenantModels; kita mock jadi model palsu yang newable + punya
// static deleteMany/countDocuments/collection.insertMany/bulkWrite.
vi.mock('@/lib/tenantDb', () => ({
    getTenantModels: vi.fn(),
}));

// Model palsu: `new Model(doc)` menyimpan doc, toObject() mengembalikannya (simulasi cast passthrough).
function makeModel(currentCount: number) {
    function Model(this: any, doc: any) {
        this._doc = doc;
    }
    (Model as any).prototype.toObject = function () {
        return this._doc;
    };
    (Model as any).deleteMany = vi.fn(async () => ({ deletedCount: currentCount }));
    (Model as any).countDocuments = vi.fn(async () => currentCount);
    const inserted: any[] = [];
    (Model as any).collection = {
        insertMany: vi.fn(async (docs: any[]) => {
            inserted.push(...docs);
            return { insertedCount: docs.length };
        }),
        bulkWrite: vi.fn(async (ops: any[]) => ({ upsertedCount: ops.length, modifiedCount: 0, insertedCount: 0 })),
    };
    (Model as any).__inserted = inserted;
    return Model as any;
}

describe('lib/backup — parseBackupJson', () => {
    it('parses a valid { Model: [...] } object', () => {
        const obj = parseBackupJson(JSON.stringify({ Customer: [{ _id: '1' }], Invoice: [] }));
        expect(Object.keys(obj)).toEqual(['Customer', 'Invoice']);
        expect(obj.Customer).toHaveLength(1);
    });

    it('accepts a Buffer input', () => {
        const obj = parseBackupJson(Buffer.from(JSON.stringify({ Staff: [] })));
        expect(obj.Staff).toEqual([]);
    });

    it('rejects invalid JSON', () => {
        expect(() => parseBackupJson('{not json')).toThrow(/bukan JSON/i);
    });

    it('rejects a top-level array', () => {
        expect(() => parseBackupJson('[]')).toThrow(/tidak dikenali/i);
    });

    it('rejects null', () => {
        expect(() => parseBackupJson('null')).toThrow(/tidak dikenali/i);
    });

    it('rejects a field whose value is not an array', () => {
        expect(() => parseBackupJson(JSON.stringify({ Customer: { nope: true } }))).toThrow(/bukan array/i);
    });
});

describe('lib/backup — decodeUploadedBackup', () => {
    it('decodes plain JSON bytes', async () => {
        const buf = Buffer.from(JSON.stringify({ Customer: [{ _id: 'a' }] }));
        const obj = await decodeUploadedBackup(buf);
        expect(obj.Customer).toHaveLength(1);
    });

    it('auto-detects & gunzips a .json.gz upload', async () => {
        const raw = JSON.stringify({ Invoice: [{ _id: 'x' }, { _id: 'y' }] });
        const gz = zlib.gzipSync(Buffer.from(raw));
        expect(gz[0]).toBe(0x1f); // magic bytes
        expect(gz[1]).toBe(0x8b);
        const obj = await decodeUploadedBackup(gz);
        expect(obj.Invoice).toHaveLength(2);
    });

    it('rejects garbage bytes that are neither gzip nor JSON', async () => {
        await expect(decodeUploadedBackup(Buffer.from('totally not json'))).rejects.toThrow(/bukan JSON/i);
    });
});

describe('lib/backup — previewRestore', () => {
    beforeEach(() => vi.clearAllMocks());

    it('reports incoming vs current counts, flags unknown keys, sorts by incoming desc', async () => {
        const { getTenantModels } = await import('@/lib/tenantDb');
        (getTenantModels as any).mockResolvedValue({
            Customer: makeModel(5),
            Invoice: makeModel(10),
        });

        const preview = await previewRestore('pusat', {
            Customer: [{ _id: '1' }],
            Invoice: [{ _id: 'a' }, { _id: 'b' }, { _id: 'c' }],
            NotAModel: [{ _id: 'z' }],
        });

        expect(preview.slug).toBe('pusat');
        expect(preview.unknownKeys).toEqual(['NotAModel']);
        expect(preview.totalIncoming).toBe(4); // 1 + 3 (unknown tidak dihitung)
        expect(preview.totalCurrent).toBe(15); // 5 + 10
        // Urut incoming desc → Invoice (3) sebelum Customer (1)
        expect(preview.items.map((i) => i.model)).toEqual(['Invoice', 'Customer']);
        expect(preview.items[0]).toMatchObject({ model: 'Invoice', incoming: 3, current: 10 });
    });
});

describe('lib/backup — restoreBackup (replace)', () => {
    beforeEach(() => vi.clearAllMocks());

    it('wipes each collection then inserts casted docs (validators bypassed via native collection)', async () => {
        const Customer = makeModel(5);
        const Invoice = makeModel(2);
        const { getTenantModels } = await import('@/lib/tenantDb');
        (getTenantModels as any).mockResolvedValue({ Customer, Invoice });

        const res = await restoreBackup(
            'pusat',
            {
                Customer: [{ _id: '1', name: 'A' }, { _id: '2', name: 'B' }],
                Invoice: [{ _id: 'x' }],
            },
            { safety: false } // lewati safety-backup (FS) untuk unit test logika inti
        );

        expect(res.ok).toBe(true);
        expect(res.mode).toBe('replace');
        expect(res.safetyBackup).toBeNull();

        // deleteMany dipanggil (replace) untuk tiap model
        expect(Customer.deleteMany).toHaveBeenCalledTimes(1);
        expect(Invoice.deleteMany).toHaveBeenCalledTimes(1);

        // insert lewat native collection (BUKAN Model.insertMany → validator dilewati)
        expect(Customer.collection.insertMany).toHaveBeenCalledTimes(1);
        expect(Customer.__inserted).toHaveLength(2);
        expect(Invoice.__inserted).toHaveLength(1);

        const cust = res.perModel.find((m) => m.model === 'Customer')!;
        expect(cust).toMatchObject({ deleted: 5, inserted: 2, failedCast: 0 });
    });

    it('skips keys that do not match a registered model (reports as unknownKeys, no writes)', async () => {
        const Customer = makeModel(0);
        const { getTenantModels } = await import('@/lib/tenantDb');
        (getTenantModels as any).mockResolvedValue({ Customer });

        const res = await restoreBackup(
            'pusat',
            { Customer: [{ _id: '1' }], Ghost: [{ _id: 'g' }] },
            { safety: false }
        );

        expect(res.unknownKeys).toEqual(['Ghost']);
        expect(res.perModel.map((m) => m.model)).toEqual(['Customer']);
    });

    it('counts docs that fail to cast without aborting the whole model', async () => {
        // Model yang meledak saat di-`new` untuk dokumen tertentu (mis. tipe korup).
        function Model(this: any, doc: any) {
            if (doc.bad) throw new Error('cast fail');
            this._doc = doc;
        }
        (Model as any).prototype.toObject = function () {
            return this._doc;
        };
        (Model as any).deleteMany = vi.fn(async () => ({ deletedCount: 0 }));
        (Model as any).countDocuments = vi.fn(async () => 0);
        const inserted: any[] = [];
        (Model as any).collection = {
            insertMany: vi.fn(async (docs: any[]) => {
                inserted.push(...docs);
                return { insertedCount: docs.length };
            }),
        };
        const { getTenantModels } = await import('@/lib/tenantDb');
        (getTenantModels as any).mockResolvedValue({ Customer: Model });

        const res = await restoreBackup(
            'pusat',
            { Customer: [{ _id: '1' }, { _id: '2', bad: true }, { _id: '3' }] },
            { safety: false }
        );

        const cust = res.perModel.find((m) => m.model === 'Customer')!;
        expect(cust.failedCast).toBe(1);
        expect(cust.inserted).toBe(2); // 2 sukses, 1 dilewati
        expect(inserted).toHaveLength(2);
    });
});

describe('lib/backup — restoreBackup (merge)', () => {
    beforeEach(() => vi.clearAllMocks());

    it('does NOT delete; upserts via bulkWrite by _id', async () => {
        const Customer = makeModel(100);
        const { getTenantModels } = await import('@/lib/tenantDb');
        (getTenantModels as any).mockResolvedValue({ Customer });

        const res = await restoreBackup(
            'pusat',
            { Customer: [{ _id: '1' }, { _id: '2' }] },
            { mode: 'merge', safety: false }
        );

        expect(res.mode).toBe('merge');
        expect(Customer.deleteMany).not.toHaveBeenCalled(); // merge = tidak menghapus
        expect(Customer.collection.bulkWrite).toHaveBeenCalledTimes(1);
        const cust = res.perModel.find((m) => m.model === 'Customer')!;
        expect(cust.deleted).toBe(0);
        expect(cust.inserted).toBe(2); // upsertedCount(2) + modified(0)
    });
});
