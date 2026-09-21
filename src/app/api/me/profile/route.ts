import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, signToken, COOKIE } from "@/lib/auth";
import { verifyPassword, hashPassword } from "@/lib/initDb";
import { auditLog, getIp } from "@/lib/audit";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = parseInt(session.sub, 10);
  const rows = await prisma.$queryRaw<{ id: number; name: string | null; email: string; avatar: number | null }[]>`
    SELECT id, name, email, avatar FROM users WHERE id = ${userId} LIMIT 1
  `;
  if (!rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(rows[0]);
}

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = parseInt(session.sub, 10);
  const { name, email, currentPassword, newPassword, avatar } = await req.json();

  // If changing password, verify current one first
  if (newPassword) {
    if (!currentPassword) {
      return NextResponse.json({ error: "Current password required" }, { status: 400 });
    }
    const rows = await prisma.$queryRaw<{ password_hash: string }[]>`
      SELECT password_hash FROM users WHERE id = ${userId} LIMIT 1
    `;
    if (!rows[0] || !(await verifyPassword(currentPassword, rows[0].password_hash))) {
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
    }
  }

  // Build update
  const updates: string[] = [];
  const values: unknown[] = [];

  if (name !== undefined) { updates.push("name = ?"); values.push(name || null); }
  if (email) { updates.push("email = ?"); values.push(email); }
  if (newPassword) {
    const hash = await hashPassword(newPassword);
    updates.push("password_hash = ?");
    values.push(hash);
  }

  if (avatar !== undefined && Number.isInteger(avatar) && avatar >= 1 && avatar <= 127) {
    updates.push("avatar = ?");
    values.push(avatar);
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  updates.push("updated_at = CURRENT_TIMESTAMP");
  values.push(userId);

  await prisma.$executeRawUnsafe(
    `UPDATE users SET ${updates.join(", ")} WHERE id = ?`,
    ...values
  );

  await auditLog({ userId, action: "USER_UPDATED", resource: "users", resourceId: String(userId), ip: getIp(req) });

  // Re-fetch to get latest values for new token
  const updated = await prisma.$queryRaw<{ email: string; role: string; name: string | null }[]>`
    SELECT email, role, name FROM users WHERE id = ${userId} LIMIT 1
  `;
  const u = updated[0];

  const token = await signToken({ sub: String(userId), email: u.email, role: u.role, name: u.name });

  const res = NextResponse.json({ ok: true, name: u.name, email: u.email });
  res.cookies.set(COOKIE, token, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 7 });
  return res;
}
