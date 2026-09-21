import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { initDb } from "@/lib/initDb";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await initDb();

  const entries = await prisma.$queryRaw<{ id: number; date: string | Date; description: string }[]>`
    SELECT id, date, description
    FROM changelog
    ORDER BY \`date\` DESC, id DESC
  `;

  return NextResponse.json(entries.map((entry) => ({ ...entry, date: entry.date instanceof Date ? entry.date.toISOString().slice(0, 10) : String(entry.date).slice(0, 10) })));
}
