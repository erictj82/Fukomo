import { getTenantModels } from "@/lib/tenantDb";
import { NextRequest, NextResponse } from 'next/server';
import { checkPermission } from '@/lib/rbac';

interface PackageInputItem {
  service: string;
  quota: number;
  serviceName?: string;
}

interface PackageBody {
  name: string;
  code: string;
  description?: string;
  price: number;
  image?: string;
  icon?: string;
  items: PackageInputItem[];
  isActive?: boolean;
  commissionType?: 'percentage' | 'fixed';
  commissionValue?: number;
  sellingCommissionType?: 'percentage' | 'fixed';
  sellingCommissionValue?: number;
  validityDays?: number;
}

function sanitizeCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, '-');
}

function validateItems(items: PackageInputItem[]): string | null {
  if (!Array.isArray(items) || items.length === 0) {
    return 'Package must contain at least one service item';
  }

  const seen = new Set<string>();
  for (const item of items) {
    if (!item?.service) return 'Each item must include a service';
    if (!item?.quota || Number(item.quota) <= 0) return 'Each item quota must be greater than 0';

    const key = String(item.service);
    if (seen.has(key)) return 'Duplicate service in package items is not allowed';
    seen.add(key);
  }

  return null;
}

export async function GET(request: NextRequest, props: any) {
  const tenantSlug = request.headers.get('x-store-slug') || 'pusat';
  const { ServicePackage } = await getTenantModels(tenantSlug);

  try {
    const permissionError = await checkPermission(request, 'pos', 'view');
    if (permissionError) return permissionError;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const active = searchParams.get('active');

    const query: Record<string, unknown> = {};
    if (active === 'true') query.isActive = true;
    if (active === 'false') query.isActive = false;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } },
      ];
    }

    const packages = await ServicePackage.find(query)
      .populate('items.service', 'name price')
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ success: true, data: packages });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch service packages';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest, props: any) {
  const tenantSlug = request.headers.get('x-store-slug') || 'pusat';
  const { ServicePackage, Service } = await getTenantModels(tenantSlug);

  try {
    const permissionError = await checkPermission(request, 'packages', 'create');
    if (permissionError) return permissionError;

    const body = (await request.json()) as PackageBody;

    if (!body.name?.trim()) return NextResponse.json({ success: false, error: 'Package name is required' }, { status: 400 });
    if (!body.code?.trim()) return NextResponse.json({ success: false, error: 'Package code is required' }, { status: 400 });
    if (body.price === undefined || Number(body.price) < 0) return NextResponse.json({ success: false, error: 'Valid price is required' }, { status: 400 });

    const itemValidationError = validateItems(body.items);
    if (itemValidationError) return NextResponse.json({ success: false, error: itemValidationError }, { status: 400 });

    const serviceIds = body.items.map((item) => item.service);
    const services = await Service.find({ _id: { $in: serviceIds } }).select('_id name');

    if (services.length !== serviceIds.length) {
      return NextResponse.json({ success: false, error: 'One or more services are invalid' }, { status: 400 });
    }

    const serviceNameMap = new Map<string, string>(services.map((svc) => [String(svc._id), String(svc.name)]));
    const processedItems = body.items.map((item) => ({
      service: item.service,
      serviceName: serviceNameMap.get(String(item.service)) || item.serviceName || 'Service',
      quota: Number(item.quota),
    }));

    const packageCode = sanitizeCode(body.code);

    const newPackage = await ServicePackage.create({
      name: body.name.trim(),
      code: packageCode,
      description: body.description?.trim() || '',
      price: Number(body.price),
      image: body.image?.trim() || undefined,
      icon: body.icon?.trim() || undefined,
      isActive: body.isActive !== false,
      commissionType: body.commissionType || 'percentage',
      commissionValue: Number(body.commissionValue || 0),
      sellingCommissionType: body.sellingCommissionType || 'fixed',
      sellingCommissionValue: Number(body.sellingCommissionValue || 0),
      validityDays: Number(body.validityDays || 0),
      items: processedItems,
    });

    return NextResponse.json({ success: true, data: newPackage }, { status: 201 });
  } catch (error: unknown) {
    const typedError = error as { code?: number };
    if (typedError.code === 11000) {
      return NextResponse.json({ success: false, error: 'Package code already exists' }, { status: 400 });
    }

    const message = error instanceof Error ? error.message : 'Failed to create service package';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}