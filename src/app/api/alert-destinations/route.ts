import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { auditLog, getIp } from "@/lib/audit";
import { encryptSecret } from "@/lib/monitoring";
import { initDb } from "@/lib/initDb";

export async function GET() {
  await initDb();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const destinations = await prisma.$queryRaw<{
    id: number;
    name: string;
    type: string;
    enabled: number | boolean;
    created_at: string;
    updated_at: string;
  }[]>`
    SELECT id, name, type, enabled, created_at, updated_at
    FROM alert_destinations
    ORDER BY name ASC
  `;

  return NextResponse.json({
    destinations: destinations.map((d) => ({
      ...d,
      enabled: Boolean(d.enabled),
    })),
    canEdit: session.role === "admin" || session.role === "editor",
  });
}

export async function POST(req: NextRequest) {
  await initDb();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin" && session.role !== "editor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const name = String(body.name || "").trim();
    const type = String(body.type || "").trim().toLowerCase();
    const config = body.config;

    if (!name) throw new Error("Destination name is required");
    if (!["discord", "email", "webhook", "slack"].includes(type)) {
      throw new Error("Supported types are 'discord', 'email', 'webhook', 'slack'");
    }
    if (!config || typeof config !== "object") {
      throw new Error("Configuration object is required");
    }

    const configEncrypted = encryptSecret(JSON.stringify(config));
    const enabled = body.enabled === false ? 0 : 1;

    await prisma.$executeRaw`
      INSERT INTO alert_destinations (name, type, config_encrypted, enabled, created_at, updated_at)
      VALUES (${name}, ${type}, ${configEncrypted}, ${enabled}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `;

    const inserted = await prisma.$queryRaw<{ id: number }[]>`SELECT id FROM alert_destinations WHERE name = ${name} ORDER BY id DESC LIMIT 1`;
    const newId = inserted[0]?.id;

    await auditLog({
      userId: parseInt(session.sub, 10) || null,
      action: "ALERT_DESTINATION_CREATED",
      resource: "alert_destinations",
      resourceId: newId ? String(newId) : undefined,
      details: { name, type, enabled: Boolean(enabled) },
      ip: getIp(req),
    });

    return NextResponse.json({ ok: true, id: newId });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to create destination" }, { status: 400 });
  }
}
