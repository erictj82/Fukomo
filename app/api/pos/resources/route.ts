import { getTenantModels } from "@/lib/tenantDb";
import { NextRequest, NextResponse } from "next/server";
import { checkPermission } from "@/lib/rbac";

export async function GET(request: NextRequest) {
  const tenantSlug = request.headers.get("x-store-slug") || "pusat";
  const {
    Service,
    Product,
    ServicePackage,
    ServiceBundle,
    Customer,
    CustomerPackage,
    Staff,
  } = await getTenantModels(tenantSlug);

  try {
    // 1x RBAC check untuk seluruh data POS
    const permissionError = await checkPermission(request, "pos", "view");
    if (permissionError) return permissionError;

    // Paralel query untuk semua sumber data POS menggunakan .lean()
    const [
      services,
      products,
      packages,
      bundles,
      customers,
      activePackages,
      staffMembers,
    ] = await Promise.all([
      Service.find({ status: "active" })
        .populate("category", "name")
        .select(
          "_id name description price memberPrice image icon duration commissionType commissionValue sellingCommissionType sellingCommissionValue waFollowUp parentService isFavorite category"
        )
        .sort({ name: 1 })
        .lean(),

      Product.find({ status: "active" })
        .populate("category", "name")
        .select(
          "_id name description price memberPrice image icon stock commissionType commissionValue isFavorite category"
        )
        .sort({ name: 1 })
        .lean(),

      ServicePackage.find({ isActive: true })
        .populate("items.service", "name price")
        .sort({ createdAt: -1 })
        .lean(),

      ServiceBundle.find({ isActive: true })
        .populate(
          "services.service",
          "name description price commissionType commissionValue sellingCommissionType sellingCommissionValue duration"
        )
        .sort({ createdAt: -1 })
        .lean(),

      Customer.find({ status: "active" })
        .select(
          "_id name phone membershipTier membershipExpiry loyaltyPoints walletBalance referredBy"
        )
        .sort({ name: 1 })
        .lean(),

      // Tanpa scanning $in customerIds agar index scan maksimal dan cepat
      CustomerPackage.find({
        status: "active",
        $or: [
          { expiresAt: { $exists: false } },
          { expiresAt: null },
          { expiresAt: { $gt: new Date() } },
        ],
      })
        .select("customer")
        .lean(),

      Staff.find({ isActive: true })
        .select("_id name commissionRate")
        .sort({ name: 1 })
        .lean(),
    ]);

    // Map hitungan paket aktif per customer untuk indikator hijau di POS
    const activeCountMap = new Map<string, number>();
    for (const pkg of activePackages as any[]) {
      const key = String(pkg.customer);
      activeCountMap.set(key, (activeCountMap.get(key) || 0) + 1);
    }

    const formattedCustomers = (customers as any[]).map((customer) => ({
      ...customer,
      activePackages: activeCountMap.get(String(customer._id)) || 0,
    }));

    return NextResponse.json({
      success: true,
      data: {
        services,
        products,
        packages,
        bundles,
        customers: formattedCustomers,
        staff: staffMembers,
      },
    });
  } catch (error: any) {
    console.error("POS_RESOURCES_GET_ERROR:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch POS resources: " + (error.message || ""),
      },
      { status: 500 }
    );
  }
}
