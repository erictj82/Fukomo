import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import Invoice from "@/models/Invoice";

/**
 * Regression test untuk bug client "komisi 0 / harga 0 masih belum bisa".
 *
 * Root cause: saat satu transaksi punya >1 staff dan salah satu staff hanya
 * mengerjakan service komisi 0 / harga 0, porsi top-level staff itu dihitung
 * dari proporsi komisi (commission / totalCommission * 100) sehingga jadi 0%.
 * Validator schema Invoice dulu menolak porsi 0 ("each percentage must be
 * greater than 0") → Invoice validation failed → checkout gagal.
 *
 * Perbaikan: porsi 0% diperbolehkan (hanya negatif yang ditolak), total tetap
 * wajib 100% dan tidak boleh ada staff duplikat.
 */
const oid = () => new mongoose.Types.ObjectId();

// Ambil error validasi pada path tertentu tanpa perlu koneksi DB.
const validatePath = (doc: any, path: string) =>
  doc.validateSync()?.errors?.[path];

const baseFields = () => ({
  invoiceNumber: "INV-TEST-1",
  subtotal: 0,
  totalAmount: 0,
});

describe("Invoice model — staffAssignments validator", () => {
  it("MENERIMA porsi 0% selama total tetap 100% (bug komisi 0/harga 0)", () => {
    const doc = new Invoice({
      ...baseFields(),
      staffAssignments: [
        { staffId: oid(), porsiPersen: 100, komisiNominal: 10000 },
        { staffId: oid(), porsiPersen: 0, komisiNominal: 0 }, // staff service gratis
      ],
    });
    expect(validatePath(doc, "staffAssignments")).toBeUndefined();
  });

  it("MENERIMA porsi 0% pada split per-item Service", () => {
    const doc = new Invoice({
      ...baseFields(),
      items: [
        {
          item: oid(),
          itemModel: "Service",
          name: "Free Cuci",
          price: 0,
          quantity: 1,
          discount: 0,
          total: 0,
          staffAssignments: [
            { staffId: oid(), porsiPersen: 60, komisiNominal: 6000 },
            { staffId: oid(), porsiPersen: 40, komisiNominal: 4000 },
            { staffId: oid(), porsiPersen: 0, komisiNominal: 0 },
          ],
        },
      ],
    });
    expect(validatePath(doc, "items")).toBeUndefined();
  });

  it("TETAP menolak porsi negatif", () => {
    const doc = new Invoice({
      ...baseFields(),
      staffAssignments: [
        { staffId: oid(), porsiPersen: 110, komisiNominal: 10000 },
        { staffId: oid(), porsiPersen: -10, komisiNominal: 0 },
      ],
    });
    expect(validatePath(doc, "staffAssignments")).toBeDefined();
  });

  it("TETAP menolak total porsi != 100%", () => {
    const doc = new Invoice({
      ...baseFields(),
      staffAssignments: [
        { staffId: oid(), porsiPersen: 100, komisiNominal: 10000 },
        { staffId: oid(), porsiPersen: 10, komisiNominal: 1000 }, // total 110%
      ],
    });
    expect(validatePath(doc, "staffAssignments")).toBeDefined();
  });

  it("TETAP menolak staff duplikat", () => {
    const dup = oid();
    const doc = new Invoice({
      ...baseFields(),
      staffAssignments: [
        { staffId: dup, porsiPersen: 100, komisiNominal: 10000 },
        { staffId: dup, porsiPersen: 0, komisiNominal: 0 },
      ],
    });
    expect(validatePath(doc, "staffAssignments")).toBeDefined();
  });

  it("MENERIMA staffAssignments kosong (transaksi tanpa split)", () => {
    const doc = new Invoice({
      ...baseFields(),
      staffAssignments: [],
    });
    expect(validatePath(doc, "staffAssignments")).toBeUndefined();
  });
});
