import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

export const CHECK_TYPES = ["http", "statuspage", "custom"] as const;
export const HTTP_METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"] as const;

export interface MonitorConfigRow {
  asset_id: string;
  check_type: string;
  url: string;
  method: string;
  expected_status: number;
  headers_encrypted: string | null;
  body_encrypted: string | null;
  timeout_ms: number;
  statuspage_component_id: string | null;
  statuspage_component_name: string | null;
}

export interface CheckResult {
  status: "healthy" | "degraded" | "down" | "unknown";
  message: string;
  responseCode: number | null;
  responseTimeMs: number;
  checkedAt: string;
}

function encryptionKey() {
  const source = process.env.MONITORING_ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!source) throw new Error("MONITORING_ENCRYPTION_KEY or JWT_SECRET must be configured");
  return createHash("sha256").update(source).digest();
}

export function encryptSecret(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptSecret(value: string | null): string | null {
  if (!value) return null;
  const [version, iv, tag, encrypted] = value.split(".");
  if (version !== "v1" || !iv || !tag || !encrypted) throw new Error("Stored monitoring secret is invalid");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}

export function validateHttpUrl(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("A URL is required");
  const url = new URL(value.trim());
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Only HTTP and HTTPS URLs are supported");
  if (url.username || url.password) throw new Error("Put credentials in encrypted headers, not in the URL");
  return url.toString();
}

export function statuspageApiUrl(baseUrl: string, componentId?: string | null): string {
  const url = new URL(validateHttpUrl(baseUrl));
  const apiMatch = url.pathname.match(/^(.*)\/api\/v2(?:\/components(?:\/[^/]+\.json)?)?/);
  const prefix = apiMatch?.[1] || "";
  url.pathname = componentId
    ? `${prefix}/api/v2/components/${encodeURIComponent(componentId)}.json`
    : `${prefix}/api/v2/components.json`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

function statuspageStatus(value: string): CheckResult["status"] {
  if (value === "operational") return "healthy";
  if (["degraded_performance", "under_maintenance"].includes(value)) return "degraded";
  if (["partial_outage", "major_outage"].includes(value)) return "down";
  return "unknown";
}

export async function runMonitorCheck(config: MonitorConfigRow): Promise<CheckResult> {
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.min(Math.max(config.timeout_ms, 1000), 30000));
  const checkedAt = new Date().toISOString();

  try {
    const rawHeaders = decryptSecret(config.headers_encrypted);
    const headers = rawHeaders ? JSON.parse(rawHeaders) as Record<string, string> : {};
    const url = config.check_type === "statuspage"
      ? statuspageApiUrl(config.url, config.statuspage_component_id)
      : validateHttpUrl(config.url);
    const method = config.check_type === "statuspage" ? "GET" : config.method;
    const rawBody = decryptSecret(config.body_encrypted);
    const response = await fetch(url, {
      method,
      headers: { Accept: "application/json", ...headers },
      body: method === "GET" || method === "HEAD" ? undefined : rawBody || undefined,
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal,
    });
    const responseTimeMs = Date.now() - started;

    if (config.check_type === "statuspage") {
      if (!response.ok) {
        return { status: "down", message: `Status API returned HTTP ${response.status}`, responseCode: response.status, responseTimeMs, checkedAt };
      }
      const data = await response.json() as { component?: { status?: string; name?: string } };
      const providerStatus = data.component?.status || "unknown";
      return {
        status: statuspageStatus(providerStatus),
        message: `${data.component?.name || config.statuspage_component_name || "Component"}: ${providerStatus.replaceAll("_", " ")}`,
        responseCode: response.status,
        responseTimeMs,
        checkedAt,
      };
    }

    const healthy = response.status === config.expected_status;
    return {
      status: healthy ? "healthy" : "down",
      message: healthy ? `Received expected HTTP ${response.status}` : `Expected HTTP ${config.expected_status}, received ${response.status}`,
      responseCode: response.status,
      responseTimeMs,
      checkedAt,
    };
  } catch (error) {
    const message = error instanceof Error
      ? error.name === "AbortError" ? `Timed out after ${config.timeout_ms} ms` : error.message
      : "Health check failed";
    return { status: "down", message, responseCode: null, responseTimeMs: Date.now() - started, checkedAt };
  } finally {
    clearTimeout(timeout);
  }
}

export function canEditMonitoring(role: string) {
  return role === "admin" || role === "editor";
}
