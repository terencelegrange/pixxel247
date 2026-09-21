import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { auditLog, getIp } from "@/lib/audit";
import { MonitorConfigRow, runMonitorCheck } from "@/lib/monitoring";
import { initDb } from "@/lib/initDb";

interface VerificationRow extends MonitorConfigRow {
  asset_name: string;
  short_code: string | null;
  config_id: number | null;
}

export async function POST(req: NextRequest) {
  await initDb();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { serviceId: rawServiceId } = await req.json();
  const serviceId = Number(rawServiceId);
  if (!Number.isInteger(serviceId)) return NextResponse.json({ error: "A valid business service is required" }, { status: 400 });
  const services = await prisma.$queryRaw<{ id: number; name: string }[]>`SELECT id, name FROM business_services WHERE id = ${serviceId} LIMIT 1`;
  if (!services[0]) return NextResponse.json({ error: "Business service not found" }, { status: 404 });

  const rows = await prisma.$queryRaw<VerificationRow[]>`
    SELECT a.id AS asset_id, a.name AS asset_name, a.short_code, amc.id AS config_id,
      amc.check_type, amc.url, amc.method, amc.expected_status, amc.headers_encrypted,
      amc.body_encrypted, amc.timeout_ms, amc.statuspage_component_id, amc.statuspage_component_name
    FROM business_service_assets bsa
    JOIN assets a ON a.id = bsa.asset_id
    LEFT JOIN asset_monitor_configs amc ON amc.asset_id = a.id
    WHERE bsa.service_id = ${serviceId}
    ORDER BY a.name
  `;

  const results = await Promise.all(rows.map(async (row) => {
    if (!row.config_id) return { assetId: row.asset_id, assetName: row.asset_name, shortCode: row.short_code, checkType: null, status: "unknown" as const, message: "No monitoring configuration", responseCode: null, responseTimeMs: 0, checkedAt: new Date().toISOString() };
    return { assetId: row.asset_id, assetName: row.asset_name, shortCode: row.short_code, checkType: row.check_type, ...(await runMonitorCheck(row)) };
  }));

  const statuses = results.map((result) => result.status);
  const overallStatus = statuses.length === 0 || statuses.includes("unknown") || (statuses.includes("healthy") && statuses.some((status) => status !== "healthy"))
    ? "degraded"
    : statuses.every((status) => status === "healthy")
      ? "healthy"
      : statuses.every((status) => status === "down")
        ? "down"
        : "degraded";

  await auditLog({ userId: parseInt(session.sub, 10) || null, action: "SERVICE_VERIFIED", resource: "business_services", resourceId: serviceId, details: { overallStatus, assetCount: results.length }, ip: getIp(req) });
  return NextResponse.json({ service: services[0], overallStatus, checkedAt: new Date().toISOString(), results });
}
