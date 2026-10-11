"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface AlertDestination {
  id: number;
  name: string;
  type: "discord" | "email" | "webhook" | "slack";
  enabled: boolean;
  created_at: string;
}

export default function AlertDestinationsPage() {
  const [destinations, setDestinations] = useState<AlertDestination[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);

  // Form states
  const [name, setName] = useState("");
  const [type, setType] = useState<"discord" | "email" | "webhook" | "slack">("discord");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [emailTo, setEmailTo] = useState("");
  const [emailRelayUrl, setEmailRelayUrl] = useState("");
  const [customHeaders, setCustomHeaders] = useState("");
  const [enabled, setEnabled] = useState(true);

  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/alert-destinations");
      const data = await res.json();
      if (res.ok) {
        setDestinations(data.destinations || []);
        setCanEdit(Boolean(data.canEdit));
      } else {
        setMessage({ type: "error", text: data.error || "Failed to load destinations" });
      }
    } catch {
      setMessage({ type: "error", text: "Network error loading destinations" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function resetForm() {
    setEditingId(null);
    setName("");
    setType("discord");
    setWebhookUrl("");
    setEmailTo("");
    setEmailRelayUrl("");
    setCustomHeaders("");
    setEnabled(true);
    setMessage(null);
  }

  async function handleEdit(dest: AlertDestination) {
    try {
      const res = await fetch(`/api/alert-destinations/${dest.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setEditingId(dest.id);
      setName(data.destination.name);
      setType(data.destination.type);
      setEnabled(data.destination.enabled);

      const cfg = data.destination.config || {};
      if (data.destination.type === "discord" || data.destination.type === "slack") {
        setWebhookUrl(cfg.webhook_url || "");
      } else if (data.destination.type === "email") {
        setEmailTo(cfg.to || "");
        setEmailRelayUrl(cfg.webhook_relay_url || "");
      } else if (data.destination.type === "webhook") {
        setWebhookUrl(cfg.url || "");
        setCustomHeaders(cfg.headers ? JSON.stringify(cfg.headers, null, 2) : "");
      }

      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to load destination details" });
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    let config: Record<string, any> = {};
    if (type === "discord" || type === "slack") {
      config = { webhook_url: webhookUrl };
    } else if (type === "email") {
      config = { to: emailTo, webhook_relay_url: emailRelayUrl || undefined };
    } else if (type === "webhook") {
      let headers: Record<string, string> | undefined;
      if (customHeaders.trim()) {
        try {
          headers = JSON.parse(customHeaders);
        } catch {
          setSaving(false);
          return setMessage({ type: "error", text: "Custom headers must be valid JSON" });
        }
      }
      config = { url: webhookUrl, headers };
    }

    try {
      const url = editingId ? `/api/alert-destinations/${editingId}` : "/api/alert-destinations";
      const method = editingId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, type, config, enabled }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");

      setMessage({ type: "success", text: editingId ? "Destination updated successfully" : "Destination created successfully" });
      resetForm();
      await load();
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Save failed" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(dest: AlertDestination) {
    if (!confirm(`Delete destination "${dest.name}"?`)) return;
    try {
      const res = await fetch(`/api/alert-destinations/${dest.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
      setMessage({ type: "success", text: "Destination deleted" });
      if (editingId === dest.id) resetForm();
      await load();
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Delete failed" });
    }
  }

  async function handleTest(id: number) {
    setTestingId(id);
    setMessage(null);
    try {
      const res = await fetch(`/api/alert-destinations/${id}/test`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: "success", text: data.message || "Test alert sent successfully!" });
      } else {
        setMessage({ type: "error", text: data.error || "Test alert failed" });
      }
    } catch {
      setMessage({ type: "error", text: "Network error sending test alert" });
    } finally {
      setTestingId(null);
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <div className="flex gap-2 text-sm text-gray-500 mb-2">
          <Link href="/settings" className="hover:text-gray-900 dark:hover:text-white">Settings</Link>
          <span>/</span>
          <span>Alert Destinations</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Service Status Alerts</h1>
        <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
          Configure notification channels (Discord, Email, Webhook, Slack) where service outage and recovery alerts are routed.
        </p>
      </div>

      {message && (
        <div
          className={`p-4 rounded-xl border text-sm ${
            message.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300"
              : "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"
          }`}
        >
          {message.text}
        </div>
      )}

      {canEdit && (
        <form onSubmit={handleSave} className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-gray-900 dark:text-white">
              {editingId ? "Edit alert destination" : "Add alert destination"}
            </h2>
            {editingId && (
              <button type="button" onClick={resetForm} className="text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white">
                Cancel edit
              </button>
            )}
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Destination Name</label>
              <input
                required
                maxLength={200}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. DevOps Discord Channel, Tennis Admin Email"
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Channel Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as any)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="discord">Discord Webhook</option>
                <option value="email">Email</option>
                <option value="slack">Slack Webhook</option>
                <option value="webhook">Generic HTTP Webhook</option>
              </select>
            </div>
          </div>

          {(type === "discord" || type === "slack" || type === "webhook") && (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
                {type === "webhook" ? "Webhook Endpoint URL" : "Incoming Webhook URL"}
              </label>
              <input
                type="url"
                required
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder={type === "discord" ? "https://discord.com/api/webhooks/..." : "https://hooks.slack.com/services/..."}
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          )}

          {type === "email" && (
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Recipient Email Address</label>
                <input
                  type="email"
                  required
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                  placeholder="admin@example.com"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Optional Webhook Relay URL</label>
                <input
                  type="url"
                  value={emailRelayUrl}
                  onChange={(e) => setEmailRelayUrl(e.target.value)}
                  placeholder="https://api.resend.com/emails / custom webhook"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
          )}

          {type === "webhook" && (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Custom Headers (JSON optional)</label>
              <textarea
                value={customHeaders}
                onChange={(e) => setCustomHeaders(e.target.value)}
                rows={2}
                placeholder='{"Authorization": "Bearer secret-token"}'
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="dest-enabled"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="rounded text-emerald-600 focus:ring-emerald-500"
            />
            <label htmlFor="dest-enabled" className="text-sm text-gray-700 dark:text-slate-300">
              Active / Enabled
            </label>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold disabled:opacity-50"
          >
            {saving ? "Saving…" : editingId ? "Save changes" : "Create destination"}
          </button>
        </form>
      )}

      {/* Destinations List */}
      <div className="space-y-3">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">Configured Destinations</h2>
        {loading ? (
          <div className="p-8 text-center text-sm text-gray-500">Loading alert destinations...</div>
        ) : destinations.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl p-8 text-center text-sm text-gray-500">
            No alert destinations configured yet. Add a destination above to start receiving alerts.
          </div>
        ) : (
          <div className="grid gap-3">
            {destinations.map((dest) => (
              <div
                key={dest.id}
                className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0 text-emerald-500 font-bold uppercase text-xs">
                    {dest.type.slice(0, 3)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900 dark:text-white">{dest.name}</h3>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium uppercase ${dest.enabled ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-gray-500/10 text-gray-500"}`}>
                        {dest.type}
                      </span>
                      {!dest.enabled && (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-amber-500/10 text-amber-600 dark:text-amber-400">
                          Disabled
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => handleTest(dest.id)}
                    disabled={testingId === dest.id}
                    className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800 text-xs font-semibold text-gray-700 dark:text-slate-300 disabled:opacity-50"
                  >
                    {testingId === dest.id ? "Sending test…" : "Send test"}
                  </button>
                  {canEdit && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleEdit(dest)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(dest)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
