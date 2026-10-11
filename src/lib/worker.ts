import { prisma } from "./prisma";
import { MonitorConfigRow, runMonitorCheck } from "./monitoring";
import { AlertDestinationRow, dispatchAlertToDestination, ServiceAlertPayload } from "./alerts";

interface MonitoredAssetConfig extends MonitorConfigRow {
  asset_name: string;
  interval_seconds: number;
  enabled: boolean | number;
}

const assetTimers = new Map<string, NodeJS.Timeout>();
const lastAssetStatus = new Map<string, string>();
const lastServiceStatus = new Map<number, "healthy" | "degraded" | "down">();
let syncIntervalTimer: NodeJS.Timeout | null = null;
let isWorkerRunning = false;

export async function recordAssetCheck(assetId: string, config: MonitorConfigRow) {
  try {
    const result = await runMonitorCheck(config);
    const isUp = result.status === "healthy";

    await prisma.$executeRaw`
      INSERT INTO asset_checks (asset_id, is_up, status, status_code, response_time_ms, message, error, checked_at)
      VALUES (
        ${assetId},
        ${isUp ? 1 : 0},
        ${result.status},
        ${result.responseCode},
        ${result.responseTimeMs},
        ${result.message || null},
        ${result.status === "down" ? result.message : null},
        CURRENT_TIMESTAMP
      )
    `;

    lastAssetStatus.set(assetId, result.status);

    // Evaluate affected business services
    await evaluateAffectedServices(assetId);
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Check execution error";
    await prisma.$executeRaw`
      INSERT INTO asset_checks (asset_id, is_up, status, status_code, response_time_ms, message, error, checked_at)
      VALUES (
        ${assetId},
        0,
        'down',
        NULL,
        0,
        ${message},
        ${message},
        CURRENT_TIMESTAMP
      )
    `;
    lastAssetStatus.set(assetId, "down");
    await evaluateAffectedServices(assetId);
    return { status: "down" as const, message, responseCode: null, responseTimeMs: 0, checkedAt: new Date().toISOString() };
  }
}

async function evaluateAffectedServices(assetId: string) {
  try {
    const services = await prisma.$queryRaw<{ service_id: number; service_name: string }[]>`
      SELECT bsa.service_id, bs.name AS service_name
      FROM business_service_assets bsa
      JOIN business_services bs ON bs.id = bsa.service_id
      WHERE bsa.asset_id = ${assetId}
    `;

    for (const service of services) {
      await evaluateServiceStatus(service.service_id, service.service_name);
    }
  } catch (err) {
    console.error("[worker] Error evaluating affected services:", err);
  }
}

export async function evaluateServiceStatus(serviceId: number, serviceName?: string) {
  try {
    if (!serviceName) {
      const s = await prisma.$queryRaw<{ name: string }[]>`SELECT name FROM business_services WHERE id = ${serviceId} LIMIT 1`;
      serviceName = s[0]?.name || `Service #${serviceId}`;
    }

    // Fetch all assets in this service
    const assets = await prisma.$queryRaw<{ asset_id: string; asset_name: string; config_id: number | null }[]>`
      SELECT a.id AS asset_id, a.name AS asset_name, amc.id AS config_id
      FROM business_service_assets bsa
      JOIN assets a ON a.id = bsa.asset_id
      LEFT JOIN asset_monitor_configs amc ON amc.asset_id = a.id
      WHERE bsa.service_id = ${serviceId}
    `;

    if (!assets.length) return;

    // Get latest check for each asset
    const statuses: { assetId: string; name: string; status: "healthy" | "degraded" | "down" | "unknown"; message: string; responseCode: number | null }[] = [];

    for (const a of assets) {
      if (!a.config_id) {
        statuses.push({ assetId: a.asset_id, name: a.asset_name, status: "unknown", message: "No monitoring configured", responseCode: null });
        continue;
      }

      const checks = await prisma.$queryRaw<{ status: string; message: string | null; status_code: number | null }[]>`
        SELECT status, message, status_code FROM asset_checks
        WHERE asset_id = ${a.asset_id}
        ORDER BY checked_at DESC
        LIMIT 1
      `;

      if (checks.length > 0) {
        const s = checks[0].status as "healthy" | "degraded" | "down";
        statuses.push({ assetId: a.asset_id, name: a.asset_name, status: s, message: checks[0].message || s, responseCode: checks[0].status_code });
      } else {
        statuses.push({ assetId: a.asset_id, name: a.asset_name, status: "unknown", message: "No checks recorded yet", responseCode: null });
      }
    }

    const currentStatuses = statuses.map((s) => s.status);
    const overallStatus: "healthy" | "degraded" | "down" =
      currentStatuses.length === 0 || currentStatuses.includes("unknown") || currentStatuses.some((st) => st === "degraded")
        ? "degraded"
        : currentStatuses.some((st) => st === "down")
        ? "down"
        : currentStatuses.every((st) => st === "healthy")
        ? "healthy"
        : "degraded";

    const prevStatus = lastServiceStatus.get(serviceId);

    if (prevStatus !== undefined && prevStatus !== overallStatus) {
      lastServiceStatus.set(serviceId, overallStatus);

      // Dispath alert to configured destinations
      const destinations = await prisma.$queryRaw<AlertDestinationRow[]>`
        SELECT ad.id, ad.name, ad.type, ad.config_encrypted, ad.enabled
        FROM service_alert_destinations sad
        JOIN alert_destinations ad ON ad.id = sad.destination_id
        WHERE sad.service_id = ${serviceId} AND ad.enabled = 1
      `;

      if (destinations.length > 0) {
        const failedAssets = statuses.filter((s) => s.status !== "healthy");
        const payload: ServiceAlertPayload = {
          serviceName,
          serviceId,
          previousStatus: prevStatus,
          currentStatus: overallStatus,
          detail:
            overallStatus === "healthy"
              ? `All ${statuses.length} assets in ${serviceName} are now operational.`
              : `${failedAssets.length} of ${statuses.length} assets are reporting issues.`,
          failedAssets,
          totalAssets: statuses.length,
          timestamp: new Date().toISOString(),
        };

        for (const dest of destinations) {
          try {
            await dispatchAlertToDestination(dest, payload);
            console.log(`[worker] Alert sent to "${dest.name}" (${dest.type}) for service ${serviceName}: ${overallStatus}`);
          } catch (destErr) {
            console.error(`[worker] Failed to send alert to "${dest.name}":`, destErr);
          }
        }
      }
    } else if (prevStatus === undefined) {
      lastServiceStatus.set(serviceId, overallStatus);
    }
  } catch (err) {
    console.error(`[worker] evaluateServiceStatus failed for service ${serviceId}:`, err);
  }
}

export async function syncMonitoredAssets() {
  try {
    const rows = await prisma.$queryRaw<MonitoredAssetConfig[]>`
      SELECT a.id AS asset_id, a.name AS asset_name, amc.check_type, amc.url, amc.method,
        amc.expected_status, amc.headers_encrypted, amc.body_encrypted, amc.timeout_ms,
        amc.interval_seconds, amc.enabled, amc.statuspage_component_id, amc.statuspage_component_name
      FROM asset_monitor_configs amc
      JOIN assets a ON a.id = amc.asset_id
      WHERE amc.enabled = 1
    `;

    const activeAssetIds = new Set(rows.map((r) => r.asset_id));

    // Clear removed or disabled timers
    for (const [assetId, timer] of assetTimers.entries()) {
      if (!activeAssetIds.has(assetId)) {
        clearInterval(timer);
        assetTimers.delete(assetId);
        lastAssetStatus.delete(assetId);
        console.log(`[worker] Stopped monitoring asset ${assetId}`);
      }
    }

    // Schedule or update active assets
    for (const config of rows) {
      if (!assetTimers.has(config.asset_id)) {
        console.log(`[worker] Scheduling asset "${config.asset_name}" (${config.asset_id}) every ${config.interval_seconds || 60}s`);
        // Initial run
        recordAssetCheck(config.asset_id, config).catch((e) => console.error(e));

        const intervalMs = Math.max((config.interval_seconds || 60) * 1000, 10000);
        const timer = setInterval(() => {
          recordAssetCheck(config.asset_id, config).catch((e) => console.error(e));
        }, intervalMs);

        assetTimers.set(config.asset_id, timer);
      }
    }
  } catch (err) {
    console.error("[worker] syncMonitoredAssets error:", err);
  }
}

export function startBackgroundWorker() {
  if (isWorkerRunning) return;
  isWorkerRunning = true;
  console.log("[worker] Starting continual monitoring engine...");

  syncMonitoredAssets().catch((e) => console.error(e));
  syncIntervalTimer = setInterval(() => {
    syncMonitoredAssets().catch((e) => console.error(e));
  }, 30000);
}

export function stopBackgroundWorker() {
  if (syncIntervalTimer) clearInterval(syncIntervalTimer);
  for (const timer of assetTimers.values()) clearInterval(timer);
  assetTimers.clear();
  isWorkerRunning = false;
  console.log("[worker] Continual monitoring engine stopped.");
}
