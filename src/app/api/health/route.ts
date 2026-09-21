import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { initDb } from "@/lib/initDb";

export async function GET() {
  try {
    await initDb();
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, service: "pixxel247", database: "connected" });
  } catch (error) {
    console.error("[health] failed:", error);
    return NextResponse.json({ ok: false, service: "pixxel247", database: "unavailable" }, { status: 503 });
  }
}
