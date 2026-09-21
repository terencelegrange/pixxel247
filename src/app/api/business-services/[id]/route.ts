import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { auditLog, getIp } from "@/lib/audit";
import { canEditMonitoring } from "@/lib/monitoring";
import { initDb } from "@/lib/initDb";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await initDb();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const serviceId = Number((await params).id);
  if (!Number.isInteger(serviceId)) return NextResponse.json({ error: "Invalid service id" }, { status: 400 });

  const services = await prisma.$queryRaw<{ id: number; name: string; description: string | null }[]>`
    SELECT id, name, description FROM business_services WHERE id = ${serviceId} LIMIT 1
  `;
  if (!services[0]) return NextResponse.json({ error: "Business service not found" }, { status: 404 });
  const assets = await prisma.$queryRaw<{ id: string; name: string; short_code: string | null; category: string | null; monitor_configured: number; check_type: string | null }[]>`
    SELECT a.id, a.name, a.short_code, a.category,
      CASE WHEN amc.id IS NULL THEN 0 ELSE 1 END AS monitor_configured, amc.check_type
    FROM business_service_assets bsa
    JOIN assets a ON a.id = bsa.asset_id
    LEFT JOIN asset_monitor_configs amc ON amc.asset_id = a.id
    WHERE bsa.service_id = ${serviceId}
    ORDER BY a.name
  `;
  return NextResponse.json({ service: { ...services[0], assets: assets.map((a) => ({ ...a, monitor_configured: Boolean(a.monitor_configured) })) }, canEdit: canEditMonitoring(session.role) });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await initDb();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEditMonitoring(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const serviceId = Number((await params).id);
  const body = await req.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() || null : null;
  const assetIds = Array.isArray(body.assetIds) ? [...new Set(body.assetIds.filter((id: unknown) => typeof id === "string"))] as string[] : [];
  if (!Number.isInteger(serviceId) || !name) return NextResponse.json({ error: "A valid service and name are required" }, { status: 400 });

  try {
    await prisma.$transaction(async (tx) => {
      const changed = await tx.$executeRaw`UPDATE business_services SET name = ${name}, description = ${description}, updated_at = CURRENT_TIMESTAMP WHERE id = ${serviceId}`;
      if (!changed) throw new Error("NOT_FOUND");
      await tx.$executeRaw`DELETE FROM business_service_assets WHERE service_id = ${serviceId}`;
      for (const assetId of assetIds) await tx.$executeRaw`INSERT INTO business_service_assets (service_id, asset_id) VALUES (${serviceId}, ${assetId})`;
    });
    await auditLog({ userId: parseInt(session.sub, 10) || null, action: "BUSINESS_SERVICE_UPDATED", resource: "business_services", resourceId: serviceId, details: { name, assetIds }, ip: getIp(req) });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const raw = error instanceof Error ? error.message : "";
    return NextResponse.json({ error: raw === "NOT_FOUND" ? "Business service not found" : raw.includes("Duplicate") ? "A business service with that name already exists" : "Could not update business service" }, { status: raw === "NOT_FOUND" ? 404 : 400 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await initDb();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEditMonitoring(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const serviceId = Number((await params).id);
  if (!Number.isInteger(serviceId)) return NextResponse.json({ error: "Invalid service id" }, { status: 400 });
  const changed = await prisma.$executeRaw`DELETE FROM business_services WHERE id = ${serviceId}`;
  if (!changed) return NextResponse.json({ error: "Business service not found" }, { status: 404 });
  await auditLog({ userId: parseInt(session.sub, 10) || null, action: "BUSINESS_SERVICE_DELETED", resource: "business_services", resourceId: serviceId, ip: getIp(req) });
  return NextResponse.json({ ok: true });
}
