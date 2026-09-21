import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { auditLog, getIp } from "@/lib/audit";
import { CHECK_TYPES, HTTP_METHODS, MonitorConfigRow, canEditMonitoring, encryptSecret, runMonitorCheck, validateHttpUrl } from "@/lib/monitoring";
import { initDb } from "@/lib/initDb";

interface ConfigRow {
  id: number;
  asset_id: string;
  check_type: string;
  url: string;
  method: string;
  expected_status: number;
  timeout_ms: number;
  statuspage_component_id: string | null;
  statuspage_component_name: string | null;
  headers_encrypted: string | null;
  body_encrypted: string | null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await initDb();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const assetId = (await params).id;
  const assets = await prisma.$queryRaw<{ id: string; name: string; short_code: string | null }[]>`SELECT id, name, short_code FROM assets WHERE id = ${assetId} LIMIT 1`;
  if (!assets[0]) return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  const configs = await prisma.$queryRaw<ConfigRow[]>`SELECT * FROM asset_monitor_configs WHERE asset_id = ${assetId} LIMIT 1`;
  const config = configs[0];
  return NextResponse.json({
    asset: assets[0],
    canEdit: canEditMonitoring(session.role),
    config: config ? {
      id: config.id,
      asset_id: config.asset_id,
      check_type: config.check_type,
      url: config.url,
      method: config.method,
      expected_status: config.expected_status,
      timeout_ms: config.timeout_ms,
      statuspage_component_id: config.statuspage_component_id,
      statuspage_component_name: config.statuspage_component_name,
      has_headers: Boolean(config.headers_encrypted),
      has_body: Boolean(config.body_encrypted),
    } : null,
  });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await initDb();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEditMonitoring(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const assetId = (await params).id;
  const body = await req.json();

  try {
    const checkType = String(body.check_type || "");
    if (!(CHECK_TYPES as readonly string[]).includes(checkType)) throw new Error("Invalid check type");
    const url = validateHttpUrl(body.url);
    const method = checkType === "statuspage" ? "GET" : String(body.method || "GET").toUpperCase();
    if (!(HTTP_METHODS as readonly string[]).includes(method)) throw new Error("Invalid HTTP method");
    const expectedStatus = Number(body.expected_status ?? 200);
    if (!Number.isInteger(expectedStatus) || expectedStatus < 100 || expectedStatus > 599) throw new Error("Expected status must be between 100 and 599");
    const timeoutMs = Number(body.timeout_ms ?? 10000);
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 30000) throw new Error("Timeout must be between 1,000 and 30,000 ms");
    const componentId = checkType === "statuspage" && typeof body.statuspage_component_id === "string" ? body.statuspage_component_id.trim() : null;
    const componentName = checkType === "statuspage" && typeof body.statuspage_component_name === "string" ? body.statuspage_component_name.trim() : null;
    if (checkType === "statuspage" && !componentId) throw new Error("Select a Statuspage component");

    let headersEncrypted: string | null | undefined;
    if (body.clear_headers === true) headersEncrypted = null;
    else if (typeof body.headers === "string" && body.headers.trim()) {
      const parsed = JSON.parse(body.headers);
      if (!parsed || Array.isArray(parsed) || typeof parsed !== "object" || Object.values(parsed).some((v) => typeof v !== "string")) throw new Error("Headers must be a JSON object with string values");
      headersEncrypted = encryptSecret(JSON.stringify(parsed));
    }
    let bodyEncrypted: string | null | undefined;
    if (body.clear_body === true) bodyEncrypted = null;
    else if (typeof body.request_body === "string" && body.request_body.length) bodyEncrypted = encryptSecret(body.request_body);

    const existing = await prisma.$queryRaw<{ id: number; headers_encrypted: string | null; body_encrypted: string | null }[]>`
      SELECT id, headers_encrypted, body_encrypted FROM asset_monitor_configs WHERE asset_id = ${assetId} LIMIT 1
    `;
    const savedHeaders = headersEncrypted === undefined ? existing[0]?.headers_encrypted ?? null : headersEncrypted;
    const savedBody = bodyEncrypted === undefined ? existing[0]?.body_encrypted ?? null : bodyEncrypted;

    if (existing[0]) {
      await prisma.$executeRaw`
        UPDATE asset_monitor_configs SET check_type = ${checkType}, url = ${url}, method = ${method}, expected_status = ${expectedStatus},
          headers_encrypted = ${savedHeaders}, body_encrypted = ${savedBody}, timeout_ms = ${timeoutMs},
          statuspage_component_id = ${componentId}, statuspage_component_name = ${componentName}, updated_at = CURRENT_TIMESTAMP
        WHERE asset_id = ${assetId}
      `;
    } else {
      await prisma.$executeRaw`
        INSERT INTO asset_monitor_configs (asset_id, check_type, url, method, expected_status, headers_encrypted, body_encrypted, timeout_ms, statuspage_component_id, statuspage_component_name)
        VALUES (${assetId}, ${checkType}, ${url}, ${method}, ${expectedStatus}, ${savedHeaders}, ${savedBody}, ${timeoutMs}, ${componentId}, ${componentName})
      `;
    }
    await auditLog({ userId: parseInt(session.sub, 10) || null, action: "ASSET_MONITOR_CONFIGURED", resource: "assets", resourceId: assetId, details: { checkType, url, method, expectedStatus, timeoutMs, componentId, hasHeaders: Boolean(savedHeaders), hasBody: Boolean(savedBody) }, ip: getIp(req) });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid monitoring configuration" }, { status: 400 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await initDb();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEditMonitoring(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const assetId = (await params).id;
  const body = await req.json();

  try {
    const assets = await prisma.$queryRaw<{ id: string }[]>`SELECT id FROM assets WHERE id = ${assetId} LIMIT 1`;
    if (!assets[0]) return NextResponse.json({ error: "Asset not found" }, { status: 404 });

    const checkType = String(body.check_type || "");
    if (!(CHECK_TYPES as readonly string[]).includes(checkType)) throw new Error("Invalid check type");
    const url = validateHttpUrl(body.url);
    const method = checkType === "statuspage" ? "GET" : String(body.method || "GET").toUpperCase();
    if (!(HTTP_METHODS as readonly string[]).includes(method)) throw new Error("Invalid HTTP method");
    const expectedStatus = Number(body.expected_status ?? 200);
    if (!Number.isInteger(expectedStatus) || expectedStatus < 100 || expectedStatus > 599) throw new Error("Expected status must be between 100 and 599");
    const timeoutMs = Number(body.timeout_ms ?? 10000);
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 30000) throw new Error("Timeout must be between 1,000 and 30,000 ms");
    const componentId = checkType === "statuspage" && typeof body.statuspage_component_id === "string" ? body.statuspage_component_id.trim() : null;
    const componentName = checkType === "statuspage" && typeof body.statuspage_component_name === "string" ? body.statuspage_component_name.trim() : null;
    if (checkType === "statuspage" && !componentId) throw new Error("Select a Statuspage component");

    const existing = await prisma.$queryRaw<{ headers_encrypted: string | null; body_encrypted: string | null }[]>`
      SELECT headers_encrypted, body_encrypted FROM asset_monitor_configs WHERE asset_id = ${assetId} LIMIT 1
    `;
    let headersEncrypted = body.clear_headers === true ? null : existing[0]?.headers_encrypted ?? null;
    if (typeof body.headers === "string" && body.headers.trim()) {
      const parsed = JSON.parse(body.headers);
      if (!parsed || Array.isArray(parsed) || typeof parsed !== "object" || Object.values(parsed).some((value) => typeof value !== "string")) throw new Error("Headers must be a JSON object with string values");
      headersEncrypted = encryptSecret(JSON.stringify(parsed));
    }
    let bodyEncrypted = body.clear_body === true ? null : existing[0]?.body_encrypted ?? null;
    if (typeof body.request_body === "string" && body.request_body.length) bodyEncrypted = encryptSecret(body.request_body);

    const config: MonitorConfigRow = {
      asset_id: assetId,
      check_type: checkType,
      url,
      method,
      expected_status: expectedStatus,
      headers_encrypted: headersEncrypted,
      body_encrypted: bodyEncrypted,
      timeout_ms: timeoutMs,
      statuspage_component_id: componentId,
      statuspage_component_name: componentName,
    };
    const result = await runMonitorCheck(config);
    await auditLog({ userId: parseInt(session.sub, 10) || null, action: "ASSET_MONITOR_TESTED", resource: "assets", resourceId: assetId, details: { checkType, url, status: result.status, responseCode: result.responseCode, responseTimeMs: result.responseTimeMs }, ip: getIp(req) });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not test monitoring configuration" }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await initDb();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEditMonitoring(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const assetId = (await params).id;
  await prisma.$executeRaw`DELETE FROM asset_monitor_configs WHERE asset_id = ${assetId}`;
  await auditLog({ userId: parseInt(session.sub, 10) || null, action: "ASSET_MONITOR_REMOVED", resource: "assets", resourceId: assetId, ip: getIp(req) });
  return NextResponse.json({ ok: true });
}
