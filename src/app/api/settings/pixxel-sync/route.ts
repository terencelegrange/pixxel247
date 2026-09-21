import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { auditLog, getIp } from "@/lib/audit";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const config = await prisma.pixxelSyncConfig.findFirst();
  if (!config) {
    return NextResponse.json({
      server_url: "http://192.168.100.252:3000",
      api_key_masked: "",
      has_api_key: false,
      last_sync_at: null,
      last_sync_status: "NOT_CONFIGURED",
      last_sync_message: "Please configure the Pixxel connection below",
      assets_synced_count: 0,
    });
  }

  const hasApiKey = Boolean(config.api_key && config.api_key.trim().length > 0);
  const maskedKey = hasApiKey
    ? config.api_key!.length > 8
      ? `${config.api_key!.slice(0, 4)}••••••••${config.api_key!.slice(-4)}`
      : "••••••••"
    : "";

  return NextResponse.json({
    id: config.id,
    server_url: config.server_url,
    api_key_masked: maskedKey,
    has_api_key: hasApiKey,
    last_sync_at: config.last_sync_at,
    last_sync_status: config.last_sync_status,
    last_sync_message: config.last_sync_message,
    assets_synced_count: config.assets_synced_count,
  });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { action, server_url, api_key } = body;

  let config = await prisma.pixxelSyncConfig.findFirst();
  if (!config) {
    config = await prisma.pixxelSyncConfig.create({
      data: {
        server_url: server_url || "http://192.168.100.252:3000",
        api_key: api_key || "",
      },
    });
  }

  if (action === "update_config") {
    const updateData: { server_url?: string; api_key?: string } = {};
    if (server_url !== undefined) updateData.server_url = server_url.trim();
    if (api_key !== undefined && api_key !== "") updateData.api_key = api_key.trim();

    config = await prisma.pixxelSyncConfig.update({
      where: { id: config.id },
      data: updateData,
    });

    await auditLog({
      userId: parseInt(session.sub, 10) || null,
      action: "PIXXEL_CONFIG_UPDATED",
      resource: "pixxel_sync_config",
      details: { server_url: config.server_url },
      ip: getIp(req),
    });

    return NextResponse.json({ ok: true, message: "Configuration updated successfully" });
  }

  if (action === "test_connection") {
    const targetUrl = (server_url || config.server_url).replace(/\/+$/, "");
    const keyToUse = (api_key !== undefined && api_key !== "") ? api_key.trim() : config.api_key;

    if (!keyToUse) {
      return NextResponse.json({ ok: false, error: "API Key is required to test the connection" }, { status: 400 });
    }

    try {
      const endpoint = `${targetUrl}/api/assets`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const resp = await fetch(endpoint, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${keyToUse}`,
          "Accept": "application/json",
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (resp.ok) {
        const data = await resp.json();
        const count = Array.isArray(data) ? data.length : (data?.assets?.length ?? 0);
        return NextResponse.json({
          ok: true,
          message: `Connected successfully! Found ${count} assets on the Pixxel server.`,
          status_code: resp.status,
          count,
        });
      } else {
        return NextResponse.json({
          ok: false,
          error: `Pixxel server returned HTTP ${resp.status}: ${resp.statusText}`,
          status_code: resp.status,
        }, { status: 400 });
      }
    } catch (err: any) {
      return NextResponse.json({
        ok: false,
        error: `Failed to connect to ${targetUrl}: ${err.message || String(err)}`,
      }, { status: 502 });
    }
  }

  if (action === "pull_now") {
    const targetUrl = (server_url || config.server_url).replace(/\/+$/, "");
    const keyToUse = (api_key !== undefined && api_key !== "") ? api_key.trim() : config.api_key;

    if (!keyToUse) {
      return NextResponse.json({ ok: false, error: "API Key is required to pull assets" }, { status: 400 });
    }

    let assetList: any[] = [];
    try {
      const endpoint = `${targetUrl}/api/assets`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);

      const resp = await fetch(endpoint, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${keyToUse}`,
          "Accept": "application/json",
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!resp.ok) {
        throw new Error(`Pixxel server returned HTTP ${resp.status}: ${resp.statusText}`);
      }

      const rawData = await resp.json();
      assetList = Array.isArray(rawData) ? rawData : (rawData?.assets || []);
    } catch (apiErr: any) {
      const errMsg = `Pull error: ${apiErr.message || String(apiErr)}`;
      await prisma.pixxelSyncConfig.update({
        where: { id: config.id },
        data: {
          last_sync_at: new Date(),
          last_sync_status: "FAILED",
          last_sync_message: errMsg,
        },
      });
      return NextResponse.json({ ok: false, error: errMsg }, { status: 500 });
    }

    if (!assetList.length) {
      await prisma.pixxelSyncConfig.update({
        where: { id: config.id },
        data: {
          last_sync_at: new Date(),
          last_sync_status: "SUCCESS",
          last_sync_message: "Pull completed: 0 assets returned from Pixxel",
          assets_synced_count: 0,
        },
      });
      return NextResponse.json({ ok: true, synced: 0, message: "No assets found to pull" });
    }

    try {
      let createdCount = 0;
      let updatedCount = 0;

      for (const item of assetList) {
        const pixxelId = String(item.id || "");
        if (!pixxelId) continue;

        const assetData = {
          name: item.name || "Untitled Asset",
          short_code: item.shortCode || item.short_code || null,
          category: item.category || "Application",
          type: item.type || null,
          lifecycle_status: item.lifecycleStatus || item.lifecycle_status || null,
          description: item.description || null,
          business_owner: item.businessOwner || item.business_owner || null,
          technical_owner: item.technicalOwner || item.technical_owner || null,
          vendor: item.vendorName || item.vendor_name || item.vendor || null,
          app_url: item.appUrl || item.app_url || null,
          doc_url: item.docUrl || item.doc_url || null,
          raw_sync_data: JSON.stringify(item),
        };

        const existing = await prisma.asset.findUnique({
          where: { pixxel_asset_id: pixxelId },
        });

        if (existing) {
          await prisma.asset.update({
            where: { id: existing.id },
            data: assetData,
          });
          updatedCount++;
        } else {
          await prisma.asset.create({
            data: {
              id: pixxelId,
              pixxel_asset_id: pixxelId,
              ...assetData,
            },
          });
          createdCount++;
        }
      }

      const totalSynced = createdCount + updatedCount;
      const successMsg = `Successfully pulled ${totalSynced} assets (${createdCount} new, ${updatedCount} updated).`;

      await prisma.pixxelSyncConfig.update({
        where: { id: config.id },
        data: {
          last_sync_at: new Date(),
          last_sync_status: "SUCCESS",
          last_sync_message: successMsg,
          assets_synced_count: totalSynced,
        },
      });

      await auditLog({
        userId: parseInt(session.sub, 10) || null,
        action: "PIXXEL_ASSETS_PULLED",
        resource: "assets",
        details: { totalSynced, createdCount, updatedCount },
        ip: getIp(req),
      });

      return NextResponse.json({
        ok: true,
        synced: totalSynced,
        created: createdCount,
        updated: updatedCount,
        message: successMsg,
      });
    } catch (err: any) {
      const errMsg = `Asset pull error: ${err.message || String(err)}`;
      await prisma.pixxelSyncConfig.update({
        where: { id: config.id },
        data: {
          last_sync_at: new Date(),
          last_sync_status: "FAILED",
          last_sync_message: errMsg,
        },
      });

      return NextResponse.json({ ok: false, error: errMsg }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
