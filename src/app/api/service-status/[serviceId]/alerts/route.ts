import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { auditLog, getIp } from "@/lib/audit";
import { initDb } from "@/lib/initDb";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ serviceId: string }> }
) {
  await initDb();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const serviceId = parseInt((await params).serviceId, 10);
  if (isNaN(serviceId)) return NextResponse.json({ error: "Invalid service ID" }, { status: 400 });

  const [assignedRows, allDestinations] = await Promise.all([
    prisma.$queryRaw<{ destination_id: number }[]>`
      SELECT destination_id FROM service_alert_destinations WHERE service_id = ${serviceId}
    `,
    prisma.$queryRaw<{ id: number; name: string; type: string; enabled: number | boolean }[]>`
      SELECT id, name, type, enabled FROM alert_destinations ORDER BY name ASC
    `,
  ]);

  return NextResponse.json({
    selectedIds: assignedRows.map((r) => r.destination_id),
    destinations: allDestinations.map((d) => ({ ...d, enabled: Boolean(d.enabled) })),
    canEdit: session.role === "admin" || session.role === "editor",
  });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ serviceId: string }> }
) {
  await initDb();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin" && session.role !== "editor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const serviceId = parseInt((await params).serviceId, 10);
  if (isNaN(serviceId)) return NextResponse.json({ error: "Invalid service ID" }, { status: 400 });

  const body = await req.json();
  const destinationIds: number[] = Array.isArray(body.destinationIds)
    ? body.destinationIds.map(Number).filter((n: number) => !isNaN(n))
    : [];

  // Remove existing
  await prisma.$executeRaw`DELETE FROM service_alert_destinations WHERE service_id = ${serviceId}`;

  // Insert selected
  for (const destId of destinationIds) {
    await prisma.$executeRaw`
      INSERT INTO service_alert_destinations (service_id, destination_id)
      VALUES (${serviceId}, ${destId})
    `;
  }

  await auditLog({
    userId: parseInt(session.sub, 10) || null,
    action: "SERVICE_ALERTS_UPDATED",
    resource: "business_services",
    resourceId: String(serviceId),
    details: { destinationIds },
    ip: getIp(req),
  });

  return NextResponse.json({ ok: true, count: destinationIds.length });
}
