import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { initDb } from "@/lib/initDb";
import { getConfiguredDialect, isSetupComplete } from "@/lib/setup";
import { startBackgroundWorker } from "@/lib/worker";

export async function GET() {
  if (!isSetupComplete()) {
    return NextResponse.json({ ok: true, service: "pixxel247", setup: false, database: "not configured" });
  }
  try {
    await initDb();
    await prisma.$queryRaw`SELECT 1`;
    startBackgroundWorker();
    return NextResponse.json({ ok: true, service: "pixxel247", setup: true, database: "connected", dialect: getConfiguredDialect() });
  } catch (error) {
    console.error("[health] failed:", error);
    return NextResponse.json({ ok: false, service: "pixxel247", database: "unavailable" }, { status: 503 });
  }
}
