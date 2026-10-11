import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { initDb } from "@/lib/initDb";
import { startBackgroundWorker } from "@/lib/worker";

const SEGMENTS = 90;

function uptimePct(checks: { is_up: number | boolean }[]): number | null {
  if (!checks.length) return null;
  const upCount = checks.filter((c) => Boolean(c.is_up)).length;
  return Math.round((upCount / checks.length) * 1000) / 10;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ serviceId: string }> }
) {
  await initDb();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Ensure background engine is alive
  startBackgroundWorker();

  const serviceId = parseInt((await params).serviceId, 10);
  if (isNaN(serviceId)) return NextResponse.json({ error: "Invalid service ID" }, { status: 400 });

  const services = await prisma.$queryRaw<{ id: number; name: string; description: string | null }[]>`
    SELECT id, name, description FROM business_services WHERE id = ${serviceId} LIMIT 1
  `;
  if (!services[0]) return NextResponse.json({ error: "Business service not found" }, { status: 404 });

  // Get assets in this service
  const assetRows = await prisma.$queryRaw<{
    id: string;
    name: string;
    short_code: string | null;
    category: string | null;
    config_id: number | null;
    check_type: string | null;
    interval_seconds: number | null;
    enabled: number | boolean | null;
  }[]>`
    SELECT a.id, a.name, a.short_code, a.category, amc.id AS config_id, amc.check_type, amc.interval_seconds, amc.enabled
    FROM business_service_assets bsa
    JOIN assets a ON a.id = bsa.asset_id
    LEFT JOIN asset_monitor_configs amc ON amc.asset_id = a.id
    WHERE bsa.service_id = ${serviceId}
    ORDER BY a.name ASC
  `;

  const assetIds = assetRows.map((a) => a.id);

  if (assetIds.length === 0) {
    return NextResponse.json({
      service: services[0],
      assets: [],
      bars: Array.from({ length: SEGMENTS }, () => ({ ts: Date.now(), status: "nodata", count: 0, avgMs: null })),
      recentChecks: [],
      uptimeWindow: null,
      uptime1d: null,
      uptime7d: null,
      uptime30d: null,
      overallStatus: "unknown",
      avgResponseTime: null,
    });
  }

  const minutes = parseInt(req.nextUrl.searchParams.get("minutes") ?? "1440", 10);
  const now = Date.now();
  const rangeMs = minutes * 60_000;
  const bucketMs = rangeMs / SEGMENTS;
  const windowStart = new Date(now - rangeMs);
  const since1d = new Date(now - 86_400_000);
  const since7d = new Date(now - 7 * 86_400_000);
  const since30d = new Date(now - 30 * 86_400_000);

  // Fetch window checks, recent checks, and historical aggregates
  const [windowChecks, recentChecks, checks1d, checks7d, checks30d, latestAssetChecks] = await Promise.all([
    prisma.$queryRaw<{
      is_up: number | boolean;
      status: string;
      response_time_ms: number | null;
      checked_at: string;
    }[]>`
      SELECT ac.is_up, ac.status, ac.response_time_ms, ac.checked_at
      FROM asset_checks ac
      JOIN business_service_assets bsa ON bsa.asset_id = ac.asset_id
      WHERE bsa.service_id = ${serviceId}
        AND ac.checked_at >= ${windowStart}
      ORDER BY ac.checked_at ASC
    `,
    prisma.$queryRaw<{
      id: number;
      asset_id: string;
      asset_name: string;
      is_up: number | boolean;
      status: string;
      status_code: number | null;
      response_time_ms: number | null;
      message: string | null;
      error: string | null;
      checked_at: string;
    }[]>`
      SELECT ac.id, ac.asset_id, a.name AS asset_name, ac.is_up, ac.status, ac.status_code, ac.response_time_ms, ac.message, ac.error, ac.checked_at
      FROM asset_checks ac
      JOIN assets a ON a.id = ac.asset_id
      JOIN business_service_assets bsa ON bsa.asset_id = ac.asset_id
      WHERE bsa.service_id = ${serviceId}
      ORDER BY ac.checked_at DESC
      LIMIT 50
    `,
    prisma.$queryRaw<{ is_up: number | boolean }[]>`
      SELECT ac.is_up FROM asset_checks ac
      JOIN business_service_assets bsa ON bsa.asset_id = ac.asset_id
      WHERE bsa.service_id = ${serviceId} AND ac.checked_at >= ${since1d}
    `,
    prisma.$queryRaw<{ is_up: number | boolean }[]>`
      SELECT ac.is_up FROM asset_checks ac
      JOIN business_service_assets bsa ON bsa.asset_id = ac.asset_id
      WHERE bsa.service_id = ${serviceId} AND ac.checked_at >= ${since7d}
    `,
    prisma.$queryRaw<{ is_up: number | boolean }[]>`
      SELECT ac.is_up FROM asset_checks ac
      JOIN business_service_assets bsa ON bsa.asset_id = ac.asset_id
      WHERE bsa.service_id = ${serviceId} AND ac.checked_at >= ${since30d}
    `,
    Promise.all(
      assetRows.map(async (asset) => {
        const checks = await prisma.$queryRaw<{
          is_up: number | boolean;
          status: string;
          status_code: number | null;
          response_time_ms: number | null;
          message: string | null;
          checked_at: string;
        }[]>`
          SELECT is_up, status, status_code, response_time_ms, message, checked_at
          FROM asset_checks
          WHERE asset_id = ${asset.id}
          ORDER BY checked_at DESC
          LIMIT 1
        `;
        return {
          ...asset,
          enabled: Boolean(asset.enabled ?? true),
          lastCheck: checks[0]
            ? {
                ...checks[0],
                is_up: Boolean(checks[0].is_up),
              }
            : null,
        };
      })
    ),
  ]);

  // Bucketing algorithm for 90 segments
  type Acc = { count: number; upCount: number; degradedCount: number; totalMs: number; msCount: number };
  const buckets: Acc[] = Array.from({ length: SEGMENTS }, () => ({
    count: 0,
    upCount: 0,
    degradedCount: 0,
    totalMs: 0,
    msCount: 0,
  }));

  for (const check of windowChecks) {
    const t = new Date(check.checked_at).getTime();
    const idx = Math.min(Math.max(0, Math.floor((t - (now - rangeMs)) / bucketMs)), SEGMENTS - 1);
    buckets[idx].count++;
    if (Boolean(check.is_up)) buckets[idx].upCount++;
    if (check.status === "degraded") buckets[idx].degradedCount++;
    if (check.response_time_ms !== null) {
      buckets[idx].totalMs += check.response_time_ms;
      buckets[idx].msCount++;
    }
  }

  const bars = buckets.map((b, i) => {
    const ts = Math.round(now - rangeMs + i * bucketMs);
    if (b.count === 0) return { ts, status: "nodata" as const, count: 0, avgMs: null };
    const avgMs = b.msCount > 0 ? Math.round(b.totalMs / b.msCount) : null;
    const status =
      b.upCount === b.count ? ("up" as const) :
      b.upCount === 0 ? ("down" as const) :
      ("partial" as const);
    return { ts, status, count: b.count, avgMs };
  });

  // Calculate overall status based on latest check of each asset
  const latestStatuses = latestAssetChecks.map((a) => a.lastCheck?.status || "unknown");
  const overallStatus =
    latestStatuses.length === 0 || latestStatuses.includes("unknown") || latestStatuses.some((s) => s === "degraded")
      ? "degraded"
      : latestStatuses.some((s) => s === "down")
      ? "down"
      : latestStatuses.every((s) => s === "healthy")
      ? "healthy"
      : "degraded";

  const allLatencies = windowChecks
    .map((c) => c.response_time_ms)
    .filter((ms): ms is number => ms !== null);
  const avgResponseTime = allLatencies.length > 0 ? Math.round(allLatencies.reduce((a, b) => a + b, 0) / allLatencies.length) : null;

  return NextResponse.json({
    service: services[0],
    assets: latestAssetChecks,
    bars,
    recentChecks: recentChecks.map((c) => ({
      ...c,
      is_up: Boolean(c.is_up),
    })),
    uptimeWindow: uptimePct(windowChecks),
    uptime1d: uptimePct(checks1d),
    uptime7d: uptimePct(checks7d),
    uptime30d: uptimePct(checks30d),
    overallStatus,
    avgResponseTime,
  });
}
