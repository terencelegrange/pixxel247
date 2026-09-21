import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { auditLog, getIp } from "@/lib/audit";
import { initDb } from "@/lib/initDb";
import { createHash, randomBytes } from "crypto";

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await initDb();

  const keys = await prisma.$queryRaw<{
    id: number; prefix: string; name: string; contact: string;
    expires_at: Date | null; created_at: Date; last_used: Date | null; active: number;
    created_by_email: string | null;
  }[]>`
    SELECT k.id, k.prefix, k.name, k.contact, k.expires_at, k.created_at, k.last_used, k.active,
           u.email AS created_by_email
    FROM api_keys k
    LEFT JOIN users u ON u.id = k.created_by
    ORDER BY k.created_at DESC
  `;

  return NextResponse.json(keys.map((k) => ({ ...k, active: k.active === 1 })));
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await initDb();

  const { name, contact, expiresAt } = await req.json();
  if (!name?.trim() || !contact?.trim()) {
    return NextResponse.json({ error: "Name and contact are required" }, { status: 400 });
  }

  // Generate key: bp_<32 hex chars>
  const rawKey = "bp_" + randomBytes(16).toString("hex");
  const prefix = rawKey.slice(0, 12);
  const keyHash = hashKey(rawKey);
  const userId = parseInt(session.sub, 10);
  const expires = expiresAt ? new Date(expiresAt) : null;

  await prisma.$executeRaw`
    INSERT INTO api_keys (key_hash, prefix, name, contact, expires_at, created_by, created_at)
    VALUES (${keyHash}, ${prefix}, ${name.trim()}, ${contact.trim()}, ${expires}, ${userId}, CURRENT_TIMESTAMP)
  `;

  const [inserted] = await prisma.$queryRaw<{ id: number }[]>`
    SELECT id FROM api_keys WHERE prefix = ${prefix} LIMIT 1
  `;

  await auditLog({
    userId,
    action: "API_KEY_CREATED",
    resource: "api_keys",
    resourceId: String(inserted.id),
    details: { name: name.trim(), contact: contact.trim() },
    ip: getIp(req),
  });

  // Return the raw key ONCE — never stored in plaintext
  return NextResponse.json({ ok: true, id: inserted.id, key: rawKey, prefix });
}
