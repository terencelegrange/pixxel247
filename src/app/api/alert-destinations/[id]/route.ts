import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { auditLog, getIp } from "@/lib/audit";
import { encryptSecret, decryptSecret } from "@/lib/monitoring";
import { initDb } from "@/lib/initDb";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await initDb();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = Number((await params).id);
  const rows = await prisma.$queryRaw<{
    id: number;
    name: string;
    type: string;
    config_encrypted: string;
    enabled: number | boolean;
  }[]>`
    SELECT id, name, type, config_encrypted, enabled
    FROM alert_destinations
    WHERE id = ${id}
    LIMIT 1
  `;

  const dest = rows[0];
  if (!dest) return NextResponse.json({ error: "Alert destination not found" }, { status: 404 });

  let config: Record<string, any> = {};
  try {
    const decrypted = decryptSecret(dest.config_encrypted);
    if (decrypted) config = JSON.parse(decrypted);
  } catch (e) {
    console.error(e);
  }

  return NextResponse.json({
    destination: {
      id: dest.id,
      name: dest.name,
      type: dest.type,
      config,
      enabled: Boolean(dest.enabled),
    },
    canEdit: session.role === "admin" || session.role === "editor",
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await initDb();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin" && session.role !== "editor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = Number((await params).id);
  try {
    const existing = await prisma.$queryRaw<{ id: number; config_encrypted: string }[]>`
      SELECT id, config_encrypted FROM alert_destinations WHERE id = ${id} LIMIT 1
    `;
    if (!existing[0]) return NextResponse.json({ error: "Alert destination not found" }, { status: 404 });

    const body = await req.json();
    const name = body.name !== undefined ? String(body.name).trim() : undefined;
    const type = body.type !== undefined ? String(body.type).trim().toLowerCase() : undefined;
    const enabled = body.enabled !== undefined ? (body.enabled ? 1 : 0) : undefined;

    let configEncrypted: string | undefined;
    if (body.config && typeof body.config === "object") {
      configEncrypted = encryptSecret(JSON.stringify(body.config));
    }

    if (name) {
      await prisma.$executeRaw`UPDATE alert_destinations SET name = ${name}, updated_at = CURRENT_TIMESTAMP WHERE id = ${id}`;
    }
    if (type) {
      await prisma.$executeRaw`UPDATE alert_destinations SET type = ${type}, updated_at = CURRENT_TIMESTAMP WHERE id = ${id}`;
    }
    if (configEncrypted) {
      await prisma.$executeRaw`UPDATE alert_destinations SET config_encrypted = ${configEncrypted}, updated_at = CURRENT_TIMESTAMP WHERE id = ${id}`;
    }
    if (enabled !== undefined) {
      await prisma.$executeRaw`UPDATE alert_destinations SET enabled = ${enabled}, updated_at = CURRENT_TIMESTAMP WHERE id = ${id}`;
    }

    await auditLog({
      userId: parseInt(session.sub, 10) || null,
      action: "ALERT_DESTINATION_UPDATED",
      resource: "alert_destinations",
      resourceId: String(id),
      details: { name, type, enabled: enabled !== undefined ? Boolean(enabled) : undefined },
      ip: getIp(req),
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to update destination" }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await initDb();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = Number((await params).id);
  await prisma.$executeRaw`DELETE FROM alert_destinations WHERE id = ${id}`;

  await auditLog({
    userId: parseInt(session.sub, 10) || null,
    action: "ALERT_DESTINATION_DELETED",
    resource: "alert_destinations",
    resourceId: String(id),
    ip: getIp(req),
  });

  return NextResponse.json({ ok: true });
}
