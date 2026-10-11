import { decryptSecret } from "./monitoring";

export interface AlertDestinationRow {
  id: number;
  name: string;
  type: "discord" | "email" | "webhook" | "slack" | string;
  config_encrypted: string;
  enabled: boolean | number;
}

export interface ServiceAlertPayload {
  serviceName: string;
  serviceId: number;
  previousStatus?: string;
  currentStatus: "healthy" | "degraded" | "down";
  detail: string;
  failedAssets?: { name: string; message: string; responseCode: number | null }[];
  totalAssets?: number;
  timestamp?: string;
}

export async function sendDiscordNotification(webhookUrl: string, payload: ServiceAlertPayload): Promise<void> {
  const isHealthy = payload.currentStatus === "healthy";
  const isDown = payload.currentStatus === "down";
  const title = isHealthy
    ? `✅ [Recovered] ${payload.serviceName} is HEALTHY`
    : isDown
    ? `🔴 [Outage Alert] ${payload.serviceName} is DOWN`
    : `⚠️ [Degraded Alert] ${payload.serviceName} is DEGRADED`;

  const color = isHealthy ? 0x22c55e : isDown ? 0xef4444 : 0xf59e0b;

  const fields: { name: string; value: string; inline?: boolean }[] = [
    { name: "Service", value: payload.serviceName, inline: true },
    { name: "Current Status", value: payload.currentStatus.toUpperCase(), inline: true },
  ];

  if (payload.failedAssets && payload.failedAssets.length > 0) {
    const list = payload.failedAssets
      .slice(0, 5)
      .map((a) => `• **${a.name}**: ${a.message}${a.responseCode ? ` (HTTP ${a.responseCode})` : ""}`)
      .join("\n");
    fields.push({ name: "Affected Assets", value: list, inline: false });
  }

  const embed = {
    title,
    description: payload.detail,
    color,
    fields,
    timestamp: payload.timestamp || new Date().toISOString(),
    footer: { text: "Pixxel247 Service Status Monitor" },
  };

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ embeds: [embed] }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Discord webhook returned HTTP ${res.status}: ${text}`);
  }
}

export async function sendSlackNotification(webhookUrl: string, payload: ServiceAlertPayload): Promise<void> {
  const isHealthy = payload.currentStatus === "healthy";
  const icon = isHealthy ? "✅" : payload.currentStatus === "down" ? "🔴" : "⚠️";
  const text = `${icon} *${payload.serviceName}* is now *${payload.currentStatus.toUpperCase()}*\n${payload.detail}`;

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Slack webhook returned HTTP ${res.status}: ${errText}`);
  }
}

export async function sendGenericWebhookNotification(
  url: string,
  payload: ServiceAlertPayload,
  customHeaders?: Record<string, string>
): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "Pixxel247-ServiceStatus/1.0",
      ...(customHeaders || {}),
    },
    body: JSON.stringify({
      event: "service_status_change",
      ...payload,
      timestamp: payload.timestamp || new Date().toISOString(),
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Webhook endpoint returned HTTP ${res.status}: ${errText}`);
  }
}

export async function sendEmailNotification(
  config: { to: string; webhook_relay_url?: string; from?: string },
  payload: ServiceAlertPayload
): Promise<void> {
  if (config.webhook_relay_url) {
    await sendGenericWebhookNotification(config.webhook_relay_url, payload, { "X-Recipient-Email": config.to });
    return;
  }
  console.log(`[Email Alert] To: ${config.to} | Service: ${payload.serviceName} | Status: ${payload.currentStatus} | Detail: ${payload.detail}`);
}

export async function dispatchAlertToDestination(
  destination: AlertDestinationRow,
  payload: ServiceAlertPayload
): Promise<void> {
  if (!destination.enabled) return;
  const configJson = decryptSecret(destination.config_encrypted);
  if (!configJson) throw new Error("Destination config could not be decrypted");

  const config = JSON.parse(configJson);

  switch (destination.type) {
    case "discord":
      if (!config.webhook_url) throw new Error("Discord webhook URL is missing");
      await sendDiscordNotification(config.webhook_url, payload);
      break;

    case "slack":
      if (!config.webhook_url) throw new Error("Slack webhook URL is missing");
      await sendSlackNotification(config.webhook_url, payload);
      break;

    case "webhook":
      if (!config.url) throw new Error("Webhook target URL is missing");
      await sendGenericWebhookNotification(config.url, payload, config.headers);
      break;

    case "email":
      if (!config.to) throw new Error("Email recipient address is missing");
      await sendEmailNotification(config, payload);
      break;

    default:
      console.warn(`[alerts] Unknown destination type: ${destination.type}`);
  }
}
