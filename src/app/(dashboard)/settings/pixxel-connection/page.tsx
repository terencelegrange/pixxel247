"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface SyncConfig {
  id?: number;
  server_url: string;
  api_key_masked: string;
  has_api_key: boolean;
  last_sync_at: string | null;
  last_sync_status: string | null;
  last_sync_message: string | null;
  assets_synced_count: number;
}

export default function PixxelConnectionPage() {
  const [config, setConfig] = useState<SyncConfig | null>(null);
  const [serverUrl, setServerUrl] = useState("http://192.168.100.252:3000");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);

  async function loadConfig() {
    try {
      const res = await fetch("/api/settings/pixxel-sync");
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
        if (data.server_url) setServerUrl(data.server_url);
      }
    } catch (err) {
      console.error(err);
    }
  }

  useEffect(() => {
    loadConfig();
  }, []);

  async function handleSaveConfig(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/settings/pixxel-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_config", server_url: serverUrl, api_key: apiKey || undefined }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: "success", text: "Pixxel connection settings saved." });
        setApiKey("");
        await loadConfig();
      } else {
        setMessage({ type: "error", text: data.error || "Failed to save settings." });
      }
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Failed to save configuration." });
    } finally {
      setSaving(false);
    }
  }

  async function handleTestConnection() {
    setTesting(true);
    setMessage(null);
    try {
      const res = await fetch("/api/settings/pixxel-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test_connection", server_url: serverUrl, api_key: apiKey || undefined }),
      });
      const data = await res.json();
      setMessage(data.ok
        ? { type: "success", text: data.message }
        : { type: "error", text: data.error || "Failed to connect to the Pixxel server." });
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Network error testing connection." });
    } finally {
      setTesting(false);
    }
  }

  async function handlePullNow() {
    if (!confirm("This will pull the asset list from Pixxel and update the local registry. Continue?")) return;
    setPulling(true);
    setMessage(null);
    try {
      const res = await fetch("/api/settings/pixxel-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "pull_now", server_url: serverUrl, api_key: apiKey || undefined }),
      });
      const data = await res.json();
      if (data.ok) {
        setMessage({ type: "success", text: data.message });
        await loadConfig();
      } else {
        setMessage({ type: "error", text: data.error || "Pull failed." });
      }
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Network error pulling assets." });
    } finally {
      setPulling(false);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-slate-400 mb-2">
          <Link href="/settings" className="hover:text-gray-900 dark:hover:text-white transition">Settings</Link>
          <span>/</span>
          <span className="text-gray-900 dark:text-white font-medium">Pixxel Connection</span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white tracking-tight">Pixxel Connection</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
              Configure access to the Pixxel server so this app can pull down the asset list.
            </p>
          </div>
          <button
            onClick={handlePullNow}
            disabled={pulling || testing || (!config?.has_api_key && !apiKey)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className={`w-4 h-4 ${pulling ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
            {pulling ? "Pulling Assets..." : "Pull Assets Now"}
          </button>
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-xl border text-sm flex items-start gap-3 ${
          message.type === "success"
            ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-300"
            : message.type === "error"
            ? "bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800/60 text-red-800 dark:text-red-300"
            : "bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800/60 text-blue-800 dark:text-blue-300"
        }`}>
          <div className="font-medium">{message.text}</div>
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
        <h2 className="text-base font-bold text-gray-900 dark:text-white mb-4">Sync Status</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-gray-50 dark:bg-slate-800/50 border border-gray-100 dark:border-slate-800">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500">Status</p>
            <div className="mt-2 flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${
                config?.last_sync_status === "SUCCESS" ? "bg-emerald-500"
                  : config?.last_sync_status === "FAILED" ? "bg-red-500"
                  : "bg-yellow-500"
              }`} />
              <span className="text-sm font-bold text-gray-900 dark:text-white">
                {config?.last_sync_status || "Not Configured"}
              </span>
            </div>
          </div>
          <div className="p-4 rounded-xl bg-gray-50 dark:bg-slate-800/50 border border-gray-100 dark:border-slate-800">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500">Assets Pulled</p>
            <p className="mt-2 text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
              {config?.assets_synced_count ?? 0}
            </p>
          </div>
          <div className="p-4 rounded-xl bg-gray-50 dark:bg-slate-800/50 border border-gray-100 dark:border-slate-800">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500">Last Pulled</p>
            <p className="mt-2 text-sm font-medium text-gray-700 dark:text-slate-300">
              {config?.last_sync_at ? new Date(config.last_sync_at).toLocaleString() : "Never"}
            </p>
          </div>
        </div>
        {config?.last_sync_message && (
          <div className="mt-4 text-xs text-gray-500 dark:text-slate-400 italic">Last message: {config.last_sync_message}</div>
        )}
      </div>

      <form onSubmit={handleSaveConfig} className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
        <h2 className="text-base font-bold text-gray-900 dark:text-white">Connection Settings</h2>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-slate-400 mb-1.5">
            Pixxel Server URL
          </label>
          <input
            type="url"
            required
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            placeholder="http://192.168.100.252:3000"
            className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
            Base URL of the running Pixxel server. This app queries the <code className="px-1 py-0.5 rounded bg-gray-100 dark:bg-slate-800 font-mono text-[11px]">/api/assets</code> endpoint.
          </p>
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-slate-400 mb-1.5">
            Pixxel API Key
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={config?.has_api_key ? `Configured (${config.api_key_masked}) — enter a new key to replace` : "Enter Pixxel API Key"}
            className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
            Generate this key from the Pixxel server's Settings → API Access. Sent as <code className="px-1 py-0.5 rounded bg-gray-100 dark:bg-slate-800 font-mono text-[11px]">Authorization: Bearer &lt;API_KEY&gt;</code>.
          </p>
        </div>
        <div className="pt-2 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 rounded-xl bg-gray-900 hover:bg-black dark:bg-white dark:hover:bg-slate-100 text-white dark:text-gray-900 text-sm font-semibold transition disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Settings"}
          </button>
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={testing || (!config?.has_api_key && !apiKey)}
            className="px-4 py-2 rounded-xl border border-gray-300 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800 text-sm font-semibold text-gray-700 dark:text-slate-300 transition disabled:opacity-50"
          >
            {testing ? "Testing..." : "Test Connection"}
          </button>
        </div>
      </form>

      <div className="p-5 rounded-2xl bg-emerald-500/5 border border-emerald-500/10 text-xs text-gray-600 dark:text-slate-400 space-y-2">
        <p className="font-semibold text-gray-900 dark:text-white text-sm">How this works</p>
        <p>1. <strong>Pull:</strong> This app pulls the asset registry from Pixxel over its REST API.</p>
        <p>2. <strong>Local registry:</strong> Pulled assets appear under the <Link href="/assets" className="text-emerald-600 dark:text-emerald-400 hover:underline">Assets</Link> page.</p>
        <p>3. <strong>Business services:</strong> Business services (composed of these assets, with per-service status widgets) build on top of this asset list.</p>
      </div>
    </div>
  );
}
