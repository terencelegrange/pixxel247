import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { auditLog, getIp } from "@/lib/audit";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const userId = parseInt(id, 10);
  if (isNaN(userId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  if (String(userId) === session.sub) {
    return NextResponse.json({ error: "Cannot modify your own account" }, { status: 400 });
  }

  const { status, role } = await req.json();
  const allowedStatus = ["pending", "approved", "rejected"];
  const allowedRole = ["admin", "user"];

  if (status && allowedStatus.includes(status)) {
    await prisma.$executeRaw`UPDATE users SET status = ${status}, updated_at = CURRENT_TIMESTAMP WHERE id = ${userId}`;
    await auditLog({ userId: parseInt(session.sub), action: status.toUpperCase(), resource: "users", resourceId: userId, ip: getIp(req) });
  }
  if (role && allowedRole.includes(role)) {
    await prisma.$executeRaw`UPDATE users SET role = ${role}, updated_at = CURRENT_TIMESTAMP WHERE id = ${userId}`;
    await auditLog({ userId: parseInt(session.sub), action: "UPDATE", resource: "users", resourceId: userId, details: { role }, ip: getIp(req) });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const userId = parseInt(id, 10);
  if (String(userId) === session.sub) {
    return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 });
  }

  await prisma.$executeRaw`DELETE FROM users WHERE id = ${userId}`;
  await auditLog({ userId: parseInt(session.sub), action: "DELETE", resource: "users", resourceId: userId, ip: getIp(req) });
  return NextResponse.json({ ok: true });
}
