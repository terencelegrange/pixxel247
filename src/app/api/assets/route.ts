import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { initDb } from "@/lib/initDb";
import { auditLog, getIp } from "@/lib/audit";

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

export async function POST(req: NextRequest) {
  await initDb();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const id = (body.id || body.pixxel_asset_id || body.short_code || body.name?.toLowerCase().replace(/[^a-z0-9]/g, "-"))?.trim();
  const name = body.name?.trim();
  if (!id || !name) {
    return NextResponse.json({ error: "Asset ID and Name are required" }, { status: 400 });
  }

  const assetData = {
    name,
    short_code: body.short_code || null,
    category: body.category || "Application",
    type: body.type || "Service",
    lifecycle_status: body.lifecycle_status || "Active",
    description: body.description || null,
    business_owner: body.business_owner || null,
    technical_owner: body.technical_owner || null,
    vendor: body.vendor || null,
    app_url: body.app_url || null,
    doc_url: body.doc_url || null,
  };

  const existing = await prisma.asset.findUnique({ where: { id } });
  let asset;
  if (existing) {
    asset = await prisma.asset.update({ where: { id }, data: assetData });
  } else {
    asset = await prisma.asset.create({ data: { id, pixxel_asset_id: id, ...assetData } });
  }

  await auditLog({
    userId: parseInt(session.sub, 10) || null,
    action: existing ? "ASSET_UPDATED" : "ASSET_CREATED",
    resource: "assets",
    resourceId: id,
    details: assetData,
    ip: getIp(req),
  });

  return NextResponse.json({ ok: true, asset }, { status: existing ? 200 : 201 });
}
