import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { auditLog, getIp } from "@/lib/audit";
import { canEditMonitoring } from "@/lib/monitoring";
import { initDb } from "@/lib/initDb";

interface ServiceRow {
  id: number;
  name: string;
  description: string | null;
  created_at: Date;
  updated_at: Date;
  asset_count: bigint;
  configured_asset_count: bigint;
}

export async function GET() {
  await initDb();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const services = await prisma.$queryRaw<ServiceRow[]>`
    SELECT bs.id, bs.name, bs.description, bs.created_at, bs.updated_at,
      COUNT(bsa.asset_id) AS asset_count,
      COUNT(amc.asset_id) AS configured_asset_count
    FROM business_services bs
    LEFT JOIN business_service_assets bsa ON bsa.service_id = bs.id
    LEFT JOIN asset_monitor_configs amc ON amc.asset_id = bsa.asset_id
    GROUP BY bs.id, bs.name, bs.description, bs.created_at, bs.updated_at
    ORDER BY bs.name ASC
  `;

  return NextResponse.json({
    canEdit: canEditMonitoring(session.role),
    services: services.map((service) => ({
      ...service,
      asset_count: Number(service.asset_count),
      configured_asset_count: Number(service.configured_asset_count),
    })),
  });
}

export async function POST(req: NextRequest) {
  await initDb();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEditMonitoring(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() || null : null;
  const assetIds = Array.isArray(body.assetIds) ? [...new Set(body.assetIds.filter((id: unknown) => typeof id === "string"))] as string[] : [];
  if (!name) return NextResponse.json({ error: "Service name is required" }, { status: 400 });

  try {
    const serviceId = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`INSERT INTO business_services (name, description) VALUES (${name}, ${description})`;
      const rows = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM business_services WHERE name = ${name} LIMIT 1`;
      for (const assetId of assetIds) {
        await tx.$executeRaw`INSERT INTO business_service_assets (service_id, asset_id) VALUES (${rows[0].id}, ${assetId})`;
      }
      return rows[0].id;
    });

    await auditLog({ userId: parseInt(session.sub, 10) || null, action: "BUSINESS_SERVICE_CREATED", resource: "business_services", resourceId: serviceId, details: { name, assetIds }, ip: getIp(req) });
    return NextResponse.json({ ok: true, id: serviceId }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error && error.message.includes("Duplicate") ? "A business service with that name already exists" : "Could not create business service";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
