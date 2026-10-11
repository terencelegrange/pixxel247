import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { initDb } from "@/lib/initDb";
import { recordAssetCheck, evaluateServiceStatus } from "@/lib/worker";
import { MonitorConfigRow } from "@/lib/monitoring";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ serviceId: string }> }
) {
  await initDb();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const serviceId = parseInt((await params).serviceId, 10);
  if (isNaN(serviceId)) return NextResponse.json({ error: "Invalid service ID" }, { status: 400 });

  const rows = await prisma.$queryRaw<
    (MonitorConfigRow & { asset_id: string; config_id: number | null })[]
  >`
    SELECT a.id AS asset_id, amc.id AS config_id, amc.check_type, amc.url, amc.method,
      amc.expected_status, amc.headers_encrypted, amc.body_encrypted, amc.timeout_ms,
      amc.statuspage_component_id, amc.statuspage_component_name
    FROM business_service_assets bsa
    JOIN assets a ON a.id = bsa.asset_id
    LEFT JOIN asset_monitor_configs amc ON amc.asset_id = a.id
    WHERE bsa.service_id = ${serviceId} AND amc.id IS NOT NULL
  `;

  const results = await Promise.all(
    rows.map(async (row) => {
      return {
        assetId: row.asset_id,
        result: await recordAssetCheck(row.asset_id, row),
      };
    })
  );

  await evaluateServiceStatus(serviceId);

  return NextResponse.json({ ok: true, count: results.length, results });
}
