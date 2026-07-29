import { getTenantModels } from "@/lib/tenantDb";
import { NextRequest, NextResponse } from "next/server";
import { checkPermission } from "@/lib/rbac";

// Endpoint khusus POS — hanya butuh pos.view (bukan staff.view)
// Hanya return field yang dibutuhkan POS: _id, name, commissionRate
// Kasir bisa assign staff tanpa akses ke data sensitif (gaji, jadwal, dll)
export async function GET(request: NextRequest) {
    const tenantSlug = request.headers.get("x-store-slug") || "pusat";
    const { Staff } = await getTenantModels(tenantSlug);

    try {
        const permissionError = await checkPermission(request, "pos", "view");
        if (permissionError) return permissionError;

        const staffMembers = await Staff.find({ isActive: true })
            .select("_id name commissionRate")
            .sort({ name: 1 })
            .lean();

        return NextResponse.json({ success: true, data: staffMembers });
    } catch (error) {
        return NextResponse.json(
            { success: false, error: "Failed to fetch staff list" },
            { status: 500 }
        );
    }
}