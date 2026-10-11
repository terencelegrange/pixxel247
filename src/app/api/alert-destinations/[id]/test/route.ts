import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { auditLog, getIp } from "@/lib/audit";
import { dispatchAlertToDestination, AlertDestinationRow } from "@/lib/alerts";
import { initDb } from "@/lib/initDb";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await initDb();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin" && session.role !== "editor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = Number((await params).id);
  const rows = await prisma.$queryRaw<AlertDestinationRow[]>`
    SELECT id, name, type, config_encrypted, enabled
    FROM alert_destinations
    WHERE id = ${id}
    LIMIT 1
  `;

  const dest = rows[0];
  if (!dest) return NextResponse.json({ error: "Alert destination not found" }, { status: 404 });

  try {
    await dispatchAlertToDestination(dest, {
      serviceName: "Test Notification Service",
      serviceId: 0,
      currentStatus: "healthy",
      detail: `This is a test notification from Pixxel247 sent by ${session.name || session.email}.`,
      timestamp: new Date().toISOString(),
    });

    await auditLog({
      userId: parseInt(session.sub, 10) || null,
      action: "ALERT_DESTINATION_TESTED",
      resource: "alert_destinations",
      resourceId: String(id),
      details: { name: dest.name, type: dest.type },
      ip: getIp(req),
    });

    return NextResponse.json({ ok: true, message: `Test message successfully sent to ${dest.name} (${dest.type})` });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to send test alert" }, { status: 400 });
  }
}
