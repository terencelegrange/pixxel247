import { NextRequest, NextResponse } from "next/server";
import { initDb } from "@/lib/initDb";
import { prisma } from "@/lib/prisma";
import { signToken, hashDeviceToken, COOKIE, THEME_COOKIE } from "@/lib/auth";
import { auditLog, getIp } from "@/lib/audit";

interface DeviceLoginRow {
  device_id: number;
  id: number; email: string; role: string; status: string; theme: string;
  name: string | null; avatar: number | null;
}

// POST — silent login for a "trusted" device: exchanges a device token
// (issued at login time when the user checked "Trust this device") for a
// session, skipping the password step entirely.
export async function POST(req: NextRequest) {
  await initDb();
  const { email, token } = await req.json();

  if (!email || !token) {
    return NextResponse.json({ error: "Email and token required" }, { status: 400 });
  }

  const rows = await prisma.$queryRaw<DeviceLoginRow[]>`
    SELECT dt.id AS device_id, u.id, u.email, u.role, u.status, u.theme, u.name, u.avatar
    FROM device_tokens dt
    JOIN users u ON u.id = dt.user_id
    WHERE dt.token_hash = ${hashDeviceToken(token)} AND u.email = ${email} AND dt.expires_at > CURRENT_TIMESTAMP
    LIMIT 1
  `;
  const user = rows[0] ?? null;

  if (!user) {
    return NextResponse.json({ error: "This device is no longer trusted — please sign in with your password" }, { status: 401 });
  }
  if (user.status !== "approved") {
    return NextResponse.json({ error: "Your account is not active" }, { status: 403 });
  }

  await prisma.$executeRaw`UPDATE device_tokens SET last_used = CURRENT_TIMESTAMP WHERE id = ${user.device_id}`;

  const jwt = await signToken({ sub: String(user.id), email: user.email, role: user.role, name: user.name });
  await auditLog({ userId: user.id, action: "LOGIN", resource: "sessions", details: { method: "trusted_device" }, ip: getIp(req) });

  const res = NextResponse.json({
    ok: true,
    user: { id: user.id, email: user.email, name: user.name, avatar: user.avatar },
  });
  res.cookies.set(COOKIE, jwt, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 7 });
  res.cookies.set(THEME_COOKIE, user.theme, { sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  return res;
}

// DELETE — revokes a device token (the login screen's "forget" action).
export async function DELETE(req: NextRequest) {
  await initDb();
  const { email, token } = await req.json();

  if (!email || !token) {
    return NextResponse.json({ error: "Email and token required" }, { status: 400 });
  }

  await prisma.$executeRaw`
    DELETE dt FROM device_tokens dt
    JOIN users u ON u.id = dt.user_id
    WHERE dt.token_hash = ${hashDeviceToken(token)} AND u.email = ${email}
  `;

  return NextResponse.json({ ok: true });
}
