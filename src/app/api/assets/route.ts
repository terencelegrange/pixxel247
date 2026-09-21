import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { initDb } from "@/lib/initDb";

export async function GET() {
  await initDb();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await prisma.$queryRaw<Array<Record<string, unknown> & { monitor_configured: number }>>`
    SELECT a.*, CASE WHEN amc.id IS NULL THEN 0 ELSE 1 END AS monitor_configured, amc.check_type
    FROM assets a
    LEFT JOIN asset_monitor_configs amc ON amc.asset_id = a.id
    ORDER BY a.name ASC
  `;
  const assets = rows.map((asset) => ({ ...asset, monitor_configured: Boolean(asset.monitor_configured) }));

  return NextResponse.json({ assets });
}
