import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getConfiguredDialect } from "@/lib/setup";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [totalRow]   = await prisma.$queryRaw<{ c: bigint }[]>`SELECT COUNT(*) AS c FROM users`;
  const [pendingRow] = await prisma.$queryRaw<{ c: bigint }[]>`SELECT COUNT(*) AS c FROM users WHERE status = 'pending'`;
  const [auditRow]   = await prisma.$queryRaw<{ c: bigint }[]>`SELECT COUNT(*) AS c FROM audit_logs`;

  const newUsers = getConfiguredDialect() === "sqlite"
    ? await prisma.$queryRaw<{ id: number; email: string; name: string | null; status: string; created_at: string }[]>`
        SELECT id, email, name, status, created_at FROM users
        WHERE status = 'pending' OR created_at >= datetime('now', '-7 days')
        ORDER BY created_at DESC LIMIT 5
      `
    : await prisma.$queryRaw<{ id: number; email: string; name: string | null; status: string; created_at: string }[]>`
        SELECT id, email, name, status, created_at FROM users
        WHERE status = 'pending' OR created_at >= CURRENT_TIMESTAMP - INTERVAL 7 DAY
        ORDER BY created_at DESC LIMIT 5
      `;

  const recentAudit = await prisma.$queryRaw<{ id: number; action: string; created_at: string; user_email: string | null }[]>`
    SELECT al.id, al.action, al.created_at, u.email AS user_email
    FROM audit_logs al
    LEFT JOIN users u ON u.id = al.user_id
    ORDER BY al.created_at DESC LIMIT 8
  `;

  return NextResponse.json({
    totalUsers:   Number(totalRow.c),
    pendingUsers: Number(pendingRow.c),
    auditEvents:  Number(auditRow.c),
    newUsers,
    recentAudit,
  });
}
