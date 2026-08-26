import { getTenantModels } from "@/lib/tenantDb";
import { NextRequest, NextResponse } from "next/server";
import { checkPermissionWithSession } from "@/lib/rbac";

/**
 * Reprint control untuk nota/invoice (anti-kecurangan cetak ulang).
 *
 * - Cetak PERTAMA gratis (printCount 0 → 1), tanpa password.
 * - Cetak ULANG (printCount > 0) wajib `Settings.reprintInvoicePassword` KALAU di-set.
 *   Kalau password kosong di Settings → fitur mati, cetak ulang bebas (backward compatible).
 * - Tiap cetak (pertama & ulang) dicatat di `invoice.reprintLogs` (siapa/kapan/metode) buat jejak audit.
 *
 * Izin akses disamakan dengan GET /api/invoices/[id]: pos.view ATAU invoices.view ATAU customers.view
 * (halaman cetak bisa dibuka kasir dari POS, dari daftar invoice, atau dari riwayat pelanggan).
 */

async function guard(request: NextRequest) {
    const { error, session } = await checkPermissionWithSession(request, "pos", "view");
    const perms = (session as any)?.user?.permissions;
    const isSA =
        (session as any)?.user?.role === "Super Admin" ||
        (session as any)?.user?.role?.name === "Super Admin";
    const posOk = !error;
    const invOk = isSA || (perms?.invoices?.view && perms.invoices.view !== "none");
    const custOk = isSA || (perms?.customers?.view && perms.customers.view !== "none");
    if (!posOk && !invOk && !custOk) {
        return {
            denied: error || NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 }),
            session: null,
        };
    }
    return { denied: null as any, session };
}

export async function GET(request: NextRequest, props: any) {
    const tenantSlug = request.headers.get("x-store-slug") || "pusat";
    const { Invoice, Settings } = await getTenantModels(tenantSlug);
    const { denied } = await guard(request);
    if (denied) return denied;

    try {
        const { id } = await props.params;
        const invoice = await Invoice.findById(id).select("printCount");
        if (!invoice) {
            return NextResponse.json({ success: false, error: "Invoice not found" }, { status: 404 });
        }
        const settings = await Settings.findOne().select("reprintInvoicePassword");
        const passwordSet = !!(settings?.reprintInvoicePassword && String(settings.reprintInvoicePassword).length > 0);
        const printCount = invoice.printCount || 0;
        return NextResponse.json({
            success: true,
            printCount,
            passwordSet,
            requiresPassword: printCount > 0 && passwordSet,
        });
    } catch (error) {
        console.error("[Reprint:GET] Error:", error);
        return NextResponse.json({ success: false, error: "Gagal cek status cetak" }, { status: 500 });
    }
}

export async function POST(request: NextRequest, props: any) {
    const tenantSlug = request.headers.get("x-store-slug") || "pusat";
    const { Invoice, Settings } = await getTenantModels(tenantSlug);
    const { denied, session } = await guard(request);
    if (denied) return denied;

    try {
        const { id } = await props.params;
        const body = await request.json().catch(() => ({}));
        const password = typeof body?.password === "string" ? body.password : "";
        const method = typeof body?.method === "string" ? body.method.slice(0, 20) : "browser";

        // PENTING (fix korupsi data): JANGAN load full-doc + .save() dengan projection
        // sebagian. `items` & `staffAssignments` itu array Mongoose (default []). Kalau
        // dokumen di-hydrate TANPA field itu di-select, lalu di-.save(), Mongoose nulis
        // ulang array-nya jadi [] → MENGHAPUS line item + komisi staff yang asli.
        // Itu bikin tiap invoice yang dicetak kehilangan item (kolom Service di report jadi
        // "-", Service Analytics & komisi ikut rusak). Sekarang pakai updateOne ATOMIK yang
        // cuma nyentuh field jejak-cetak; array invoice sama sekali tidak disentuh.
        const invoice = await Invoice.findById(id).select("printCount");
        if (!invoice) {
            return NextResponse.json({ success: false, error: "Invoice not found" }, { status: 404 });
        }

        const now = new Date();
        const byId = (session as any)?.user?.id ? String((session as any).user.id) : undefined;
        const byName = (session as any)?.user?.name || (session as any)?.user?.email || undefined;
        const printCount = invoice.printCount || 0;

        if (printCount === 0) {
            // Cetak pertama — gratis, tinggal ditandai.
            await Invoice.updateOne(
                { _id: id },
                {
                    $set: { printCount: 1, firstPrintedAt: now, lastPrintedAt: now },
                    $push: { reprintLogs: { at: now, byId, byName, method: `first:${method}` } },
                }
            );
            return NextResponse.json({ success: true, printCount: 1, reprint: false });
        }

        // Cetak ulang — wajib password kalau di-set di Settings.
        const settings = await Settings.findOne().select("reprintInvoicePassword");
        const configured = settings?.reprintInvoicePassword ? String(settings.reprintInvoicePassword) : "";
        if (configured && configured !== password) {
            return NextResponse.json(
                { success: false, error: "Password cetak ulang salah atau kosong!" },
                { status: 401 }
            );
        }

        await Invoice.updateOne(
            { _id: id },
            {
                $set: { lastPrintedAt: now },
                $inc: { printCount: 1 },
                $push: { reprintLogs: { at: now, byId, byName, method: `reprint:${method}` } },
            }
        );
        return NextResponse.json({ success: true, printCount: printCount + 1, reprint: true });
    } catch (error) {
        console.error("[Reprint:POST] Error:", error);
        return NextResponse.json({ success: false, error: "Gagal memproses cetak" }, { status: 500 });
    }
}
