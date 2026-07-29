import { getTenantModels } from "@/lib/tenantDb";
import { NextRequest, NextResponse } from "next/server";
import { checkPermission } from "@/lib/rbac";

// Endpoint khusus POS — hanya butuh pos.view (bukan products.view)
// Hanya return field yang dibutuhkan POS: _id, name, price, stock
// Kasir bisa pilih product untuk transaksi tanpa akses ke data sensitif product
export async function GET(request: NextRequest) {
    const tenantSlug = request.headers.get("x-store-slug") || "pusat";
    const { Product } = await getTenantModels(tenantSlug);

    try {
        const permissionError = await checkPermission(request, "pos", "view");
        if (permissionError) return permissionError;

        const products = await Product.find({ status: "active" })
            .populate("category", "name")
            .select("_id name price memberPrice image icon stock commissionType commissionValue isFavorite category")
            .sort({ name: 1 })
            .lean();

        return NextResponse.json({ success: true, data: products });
    } catch (error) {
        return NextResponse.json(
            { success: false, error: "Failed to fetch products list" },
            { status: 500 }
        );
    }
}