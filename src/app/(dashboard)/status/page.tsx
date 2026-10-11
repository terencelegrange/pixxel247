"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";

interface ServiceOption {
  id: number;
  name: string;
  description: string | null;
  asset_count: number;
  configured_asset_count: number;
}

interface Bar {
  ts: number;
  status: "up" | "down" | "partial" | "nodata";
  count: number;
  avgMs: number | null;
}

interface RecentCheck {
  id: number;
  asset_id: string;
  asset_name: string;
  is_up: boolean;
  status: string;
  status_code: number | null;
  response_time_ms: number | null;
  message: string | null;
  error: string | null;
  checked_at: string;
}

interface AssetStatus {
  id: string;
  name: string;
  short_code: string | null;
  category: string | null;
  config_id: number | null;
  check_type: string | null;
  interval_seconds: number | null;
  enabled: boolean;
  lastCheck: {
    is_up: boolean;
    status: string;
    status_code: number | null;
    response_time_ms: number | null;
    message: string | null;
    checked_at: string;
  } | null;
}

interface ServiceStatusData {
  service: { id: number; name: string; description: string | null };
  assets: AssetStatus[];
  bars: Bar[];
  recentChecks: RecentCheck[];
  uptimeWindow: number | null;
  uptime1d: number | null;
  uptime7d: number | null;
  uptime30d: number | null;
  overallStatus: "healthy" | "degraded" | "down" | "unknown";
  avgResponseTime: number | null;
}

interface AlertDestOption {
  id: number;
  name: string;
  type: string;
  enabled: boolean;
}

const RANGES = [
  { label: "5m", minutes: 5 },
  { label: "1h", minutes: 60 },
  { label: "6h", minutes: 360 },
  { label: "24h", minutes: 1440 },
  { label: "7d", minutes: 10080 },
  { label: "30d", minutes: 43200 },
] as const;

type RangeMinutes = (typeof RANGES)[number]["minutes"];

function fmtTs(ts: number, rangeMinutes: number): string {
  const d = new Date(ts);
  if (rangeMinutes <= 360) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (rangeMinutes <= 1440) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (rangeMinutes <= 10080) return d.toLocaleDateString([], { weekday: "short", hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function uptimeColor(v: number | null): string {
  if (v === null) return "text-gray-400 dark:text-slate-500";
  if (v >= 99) return "text-emerald-600 dark:text-emerald-400";
  if (v >= 95) return "text-amber-500";
  return "text-red-500";
}

function timeAgo(dateString: string): string {
  const diff = Date.now() - new Date(dateString).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function ServiceStatusPage() {
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState<string>("");
  const [range, setRange] = useState<RangeMinutes>(1440);
  const [data, setData] = useState<ServiceStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [runningNow, setRunningNow] = useState(false);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Alert routing modal state
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [alertDestinations, setAlertDestinations] = useState<AlertDestOption[]>([]);
  const [selectedAlertDestIds, setSelectedAlertDestIds] = useState<number[]>([]);
  const [savingAlerts, setSavingAlerts] = useState(false);

  // Fetch initial services list
  useEffect(() => {
    fetch("/api/business-services")
      .then((res) => res.json())
      .then((d) => {
        setServices(d.services || []);
        if (d.services?.[0]) setSelectedServiceId(String(d.services[0].id));
      })
      .catch(() => setMessage({ type: "error", text: "Could not load business services" }));
  }, []);

  // Fetch service status data
  const fetchStatus = useCallback(async () => {
    if (!selectedServiceId) return;
    try {
      const res = await fetch(`/api/service-status/${selectedServiceId}/checks?minutes=${range}`);
      const json = await res.json();
      if (res.ok) {
        setData(json);
      } else {
        setMessage({ type: "error", text: json.error || "Failed to load service status" });
      }
    } catch {
      setMessage({ type: "error", text: "Network error fetching service status" });
    } finally {
      setLoading(false);
    }
  }, [selectedServiceId, range]);

  useEffect(() => {
    setLoading(true);
    fetchStatus();
    const timer = setInterval(fetchStatus, 30000);
    return () => clearInterval(timer);
  }, [fetchStatus]);

  // Load alert routing info for service
  const loadAlerts = useCallback(async () => {
    if (!selectedServiceId) return;
    try {
      const res = await fetch(`/api/service-status/${selectedServiceId}/alerts`);
      const json = await res.json();
      if (res.ok) {
        setAlertDestinations(json.destinations || []);
        setSelectedAlertDestIds(json.selectedIds || []);
      }
    } catch (err) {
      console.error(err);
    }
  }, [selectedServiceId]);

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  async function handleRunNow() {
    if (!selectedServiceId) return;
    setRunningNow(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/service-status/${selectedServiceId}/run`, { method: "POST" });
      const json = await res.json();
      if (res.ok) {
        setMessage({ type: "success", text: `Executed checks for ${json.count} monitored assets.` });
        await fetchStatus();
      } else {
        setMessage({ type: "error", text: json.error || "Failed to run checks" });
      }
    } catch {
      setMessage({ type: "error", text: "Failed to trigger live checks" });
    } finally {
      setRunningNow(false);
    }
  }

  async function handleSaveAlerts() {
    setSavingAlerts(true);
    try {
      const res = await fetch(`/api/service-status/${selectedServiceId}/alerts`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destinationIds: selectedAlertDestIds }),
      });
      if (res.ok) {
        setShowAlertModal(false);
        setMessage({ type: "success", text: "Alert destinations updated for this service." });
        await loadAlerts();
      } else {
        const json = await res.json();
        alert(json.error || "Failed to update alert routing");
      }
    } catch {
      alert("Network error saving alert routing");
    } finally {
      setSavingAlerts(false);
    }
  }

  const selectedService = services.find((s) => String(s.id) === selectedServiceId);
  const activeAlertDestNames = alertDestinations
    .filter((d) => selectedAlertDestIds.includes(d.id))
    .map((d) => d.name);

  // Response time chart points
  const chartPoints = useMemo(() => {
    if (!data?.bars) return [];
    return data.bars.filter((b) => b.avgMs !== null);
  }, [data?.bars]);

  const maxMs = useMemo(() => {
    if (!chartPoints.length) return 500;
    const max = Math.max(...chartPoints.map((p) => p.avgMs || 0));
    return Math.ceil((max * 1.25) / 50) * 50 || 100;
  }, [chartPoints]);

  const hoveredBar = hoveredIdx !== null && data?.bars?.[hoveredIdx] ? data.bars[hoveredIdx] : null;

  return (
    <div className="space-y-6">
      {/* Header & Service Picker */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Service Status</h1>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">
            Continuous uptime monitoring, latency trends, and outage alerts for business services.
          </p>
        </div>

        {/* Service Picker */}
        <div className="flex items-center gap-3">
          <select
            value={selectedServiceId}
            onChange={(e) => setSelectedServiceId(e.target.value)}
            className="px-4 py-2.5 rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold text-gray-900 dark:text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            {services.map((svc) => (
              <option key={svc.id} value={svc.id}>
                {svc.name} ({svc.configured_asset_count}/{svc.asset_count} assets)
              </option>
            ))}
          </select>

          <button
            onClick={handleRunNow}
            disabled={runningNow || !selectedServiceId}
            className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold shadow-sm disabled:opacity-50 flex items-center gap-1.5 shrink-0"
          >
            {runningNow ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Checking…
              </>
            ) : (
              "Check Now"
            )}
          </button>
        </div>
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

      {!services.length ? (
        <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl p-12 text-center">
          <p className="text-gray-500 dark:text-slate-400 text-base">No business services defined yet.</p>
          <Link
            href="/services"
            className="mt-3 inline-block px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold"
          >
            Create a Business Service
          </Link>
        </div>
      ) : (
        <>
          {/* Service Banner & Alert Routing Bar */}
          <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div className="flex items-center gap-4">
                <div
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-lg ${
                    data?.overallStatus === "healthy"
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                      : data?.overallStatus === "down"
                      ? "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20"
                      : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                  }`}
                >
                  {data?.overallStatus === "healthy" ? "UP" : data?.overallStatus === "down" ? "DOWN" : "DEG"}
                </div>
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">{selectedService?.name}</h2>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${
                        data?.overallStatus === "healthy"
                          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                          : data?.overallStatus === "down"
                          ? "bg-red-500/10 text-red-700 dark:text-red-300"
                          : "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                      }`}
                    >
                      {data?.overallStatus || "Pending"}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                    {selectedService?.description || "No description provided."}
                  </p>
                </div>
              </div>

              {/* Alert destination indicator and selector */}
              <div className="flex items-center gap-3 bg-gray-50 dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700 rounded-xl p-3">
                <div className="text-xs">
                  <span className="text-gray-400 block uppercase font-bold text-[10px] tracking-wider">Outage Alerts</span>
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {activeAlertDestNames.length
                      ? activeAlertDestNames.join(", ")
                      : "No alert destination configured"}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAlertModal(true)}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-xs font-semibold text-gray-700 dark:text-white hover:bg-gray-50 dark:hover:bg-slate-600 shrink-0"
                >
                  Configure
                </button>
              </div>
            </div>
          </div>

          {/* Status History (90-segment interactive uptime bar) */}
          <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-bold text-gray-900 dark:text-white">Status History</h3>
                {data?.uptimeWindow !== null && data?.uptimeWindow !== undefined && (
                  <span className={`text-sm font-semibold ${uptimeColor(data.uptimeWindow)}`}>
                    {data.uptimeWindow}% uptime
                  </span>
                )}
              </div>

              {/* Range selector */}
              <div className="flex items-center gap-1 bg-gray-100 dark:bg-slate-800 rounded-xl p-1">
                {RANGES.map((r) => (
                  <button
                    key={r.label}
                    onClick={() => setRange(r.minutes)}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
                      range === r.minutes
                        ? "bg-white dark:bg-slate-700 text-gray-900 dark:text-white shadow-sm"
                        : "text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white"
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 90-Segment Uptime Bar */}
            <div className="space-y-2">
              <div className="flex gap-[2px] h-10" onMouseLeave={() => setHoveredIdx(null)}>
                {(data?.bars || Array.from({ length: 90 }, (_, i) => ({ ts: Date.now(), status: "nodata" as const, count: 0, avgMs: null }))).map((bar, i) => {
                  const isHovered = hoveredIdx === i;
                  const dimmed = hoveredIdx !== null && !isHovered;
                  const colorClass =
                    bar.status === "up"
                      ? "bg-emerald-500"
                      : bar.status === "down"
                      ? "bg-red-500"
                      : bar.status === "partial"
                      ? "bg-amber-400"
                      : "bg-gray-200 dark:bg-slate-800";

                  return (
                    <div
                      key={i}
                      className={`flex-1 rounded-[2px] cursor-default transition-all ${colorClass} ${
                        dimmed ? "opacity-30" : "opacity-100"
                      }`}
                      onMouseEnter={() => setHoveredIdx(i)}
                    />
                  );
                })}
              </div>

              {/* Bar legend / hover label */}
              <div className="flex items-center justify-between text-xs min-h-[20px] text-gray-500 dark:text-slate-400">
                <span>{data?.bars?.[0] ? fmtTs(data.bars[0].ts, range) : "—"}</span>
                <span className="font-semibold text-gray-900 dark:text-white">
                  {hoveredBar ? (
                    hoveredBar.status === "nodata" ? (
                      "No checks recorded in this segment"
                    ) : (
                      <>
                        {fmtTs(hoveredBar.ts, range)} ·{" "}
                        <span
                          className={
                            hoveredBar.status === "up"
                              ? "text-emerald-600 dark:text-emerald-400"
                              : hoveredBar.status === "down"
                              ? "text-red-500"
                              : "text-amber-500"
                          }
                        >
                          {hoveredBar.status.toUpperCase()}
                        </span>{" "}
                        · {hoveredBar.count} check{hoveredBar.count !== 1 ? "s" : ""}
                        {hoveredBar.avgMs !== null ? ` · ${hoveredBar.avgMs} ms avg` : ""}
                      </>
                    )
                  ) : (
                    "Hover over any segment to inspect"
                  )}
                </span>
                <span>Now</span>
              </div>
            </div>
          </div>

          {/* Uptime stats 3-column cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm text-center">
              <div className={`text-3xl font-extrabold ${uptimeColor(data?.uptime1d ?? null)}`}>
                {data?.uptime1d !== null && data?.uptime1d !== undefined ? `${data.uptime1d}%` : "—"}
              </div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500 mt-1">
                Last 24 Hours
              </p>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm text-center">
              <div className={`text-3xl font-extrabold ${uptimeColor(data?.uptime7d ?? null)}`}>
                {data?.uptime7d !== null && data?.uptime7d !== undefined ? `${data.uptime7d}%` : "—"}
              </div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500 mt-1">
                Last 7 Days
              </p>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm text-center">
              <div className={`text-3xl font-extrabold ${uptimeColor(data?.uptime30d ?? null)}`}>
                {data?.uptime30d !== null && data?.uptime30d !== undefined ? `${data.uptime30d}%` : "—"}
              </div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500 mt-1">
                Last 30 Days
              </p>
            </div>
          </div>

          {/* Response Time Chart */}
          {chartPoints.length > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-gray-900 dark:text-white">Response Time Trend</h3>
                {data?.avgResponseTime !== null && (
                  <span className="text-xs text-gray-500 dark:text-slate-400">
                    Average: <strong className="text-gray-900 dark:text-white">{data?.avgResponseTime} ms</strong>
                  </span>
                )}
              </div>

              {/* Responsive SVG Chart */}
              <div className="h-44 w-full">
                <svg className="w-full h-full overflow-visible" viewBox="0 0 800 160" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>
                  {/* Grid horizontal lines */}
                  {[0.25, 0.5, 0.75].map((pct, idx) => (
                    <line
                      key={idx}
                      x1="0"
                      y1={160 * pct}
                      x2="800"
                      y2={160 * pct}
                      stroke="currentColor"
                      className="text-gray-100 dark:text-slate-800"
                      strokeDasharray="4 4"
                    />
                  ))}

                  {/* Area fill */}
                  {(() => {
                    const coords = chartPoints.map((p, i) => {
                      const x = (i / Math.max(chartPoints.length - 1, 1)) * 800;
                      const y = 160 - ((p.avgMs || 0) / maxMs) * 140 - 10;
                      return `${x},${y}`;
                    });
                    const firstX = 0;
                    const lastX = 800;
                    const areaD = `M${coords[0]} L${coords.join(" L")} L${lastX},160 L${firstX},160 Z`;
                    const lineD = `M${coords.join(" L")}`;
                    return (
                      <>
                        <path d={areaD} fill="url(#chartGrad)" />
                        <path d={lineD} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" />
                      </>
                    );
                  })()}
                </svg>
              </div>
              <div className="flex justify-between text-[11px] text-gray-400">
                <span>0 ms</span>
                <span>Max: {maxMs} ms</span>
              </div>
            </div>
          )}

          {/* Constituent Assets Breakdown Table */}
          <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
            <div className="p-5 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white">Constituent Assets</h3>
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                  Individual health, monitoring interval, and latency for every asset in this service.
                </p>
              </div>
            </div>

            <div className="divide-y divide-gray-100 dark:divide-slate-800">
              {data?.assets?.map((asset) => (
                <div key={asset.id} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold uppercase ${
                          asset.lastCheck?.status === "healthy"
                            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                            : asset.lastCheck?.status === "down"
                            ? "bg-red-500/10 text-red-700 dark:text-red-300"
                            : asset.lastCheck?.status === "degraded"
                            ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                            : "bg-gray-100 dark:bg-slate-800 text-gray-500"
                        }`}
                      >
                        {asset.lastCheck?.status || "Pending"}
                      </span>
                      <h4 className="font-semibold text-gray-900 dark:text-white truncate">{asset.name}</h4>
                      {asset.short_code && <span className="text-xs text-gray-400">({asset.short_code})</span>}
                    </div>
                    <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                      {asset.lastCheck?.message || (asset.config_id ? "Awaiting next scheduled check" : "Monitoring not configured")}
                    </p>
                  </div>

                  <div className="flex items-center gap-5 text-xs text-gray-500 dark:text-slate-400 shrink-0">
                    <span>
                      {asset.check_type === "statuspage" ? "Statuspage" : asset.check_type ? "HTTP" : "No check"}
                    </span>
                    {asset.lastCheck?.status_code && <span>HTTP {asset.lastCheck.status_code}</span>}
                    {asset.lastCheck?.response_time_ms !== undefined && asset.lastCheck?.response_time_ms !== null && (
                      <span className="font-medium text-gray-700 dark:text-slate-300">
                        {asset.lastCheck.response_time_ms} ms
                      </span>
                    )}
                    <span>
                      {asset.enabled ? (
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                          Every {asset.interval_seconds || 60}s
                        </span>
                      ) : (
                        <span className="text-gray-400">Polling disabled</span>
                      )}
                    </span>
                    <Link
                      href={`/assets/${encodeURIComponent(asset.id)}/monitor`}
                      className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
                    >
                      Configure
                    </Link>
                  </div>
                </div>
              ))}
              {!data?.assets?.length && (
                <div className="p-8 text-center text-sm text-gray-500">
                  This service has no assets assigned. Edit the service in{" "}
                  <Link href="/services" className="text-emerald-600 underline">
                    Business Services
                  </Link>
                  .
                </div>
              )}
            </div>
          </div>

          {/* Recent Checks Table */}
          <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
            <div className="p-5 border-b border-gray-100 dark:border-slate-800">
              <h3 className="font-bold text-gray-900 dark:text-white">Recent Checks Log</h3>
              <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                Timestamped execution log of continual background checks for this service.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50 dark:bg-slate-800/60 text-gray-500 border-b border-gray-100 dark:border-slate-800 font-semibold uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="p-3.5">Time</th>
                    <th className="p-3.5">Asset</th>
                    <th className="p-3.5">Status</th>
                    <th className="p-3.5">HTTP Code</th>
                    <th className="p-3.5 text-right">Response Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-800 text-gray-700 dark:text-slate-300">
                  {data?.recentChecks?.map((chk) => (
                    <tr key={chk.id} className="hover:bg-gray-50/50 dark:hover:bg-slate-800/40">
                      <td className="p-3.5 text-gray-500">{timeAgo(chk.checked_at)}</td>
                      <td className="p-3.5 font-medium text-gray-900 dark:text-white">{chk.asset_name}</td>
                      <td className="p-3.5">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full font-bold uppercase text-[10px] ${
                            chk.status === "healthy"
                              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                              : chk.status === "down"
                              ? "bg-red-500/10 text-red-700 dark:text-red-300"
                              : "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                          }`}
                        >
                          {chk.status}
                        </span>
                      </td>
                      <td className="p-3.5 font-mono">{chk.status_code || chk.error || "—"}</td>
                      <td className="p-3.5 text-right font-medium">
                        {chk.response_time_ms !== null ? `${chk.response_time_ms} ms` : "—"}
                      </td>
                    </tr>
                  ))}
                  {!data?.recentChecks?.length && (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-gray-500">
                        No check records available yet. Checks will record automatically.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Alert Routing Modal */}
      {showAlertModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-4">
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Configure Outage Alert Routing</h3>
              <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                Select which alert destination(s) receive notifications when <strong>{selectedService?.name}</strong> goes down or recovers.
              </p>
            </div>

            <div className="max-h-60 overflow-y-auto space-y-2 py-2">
              {alertDestinations.map((dest) => (
                <label
                  key={dest.id}
                  className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedAlertDestIds.includes(dest.id)}
                    onChange={(e) => {
                      setSelectedAlertDestIds((current) =>
                        e.target.checked ? [...current, dest.id] : current.filter((id) => id !== dest.id)
                      );
                    }}
                    className="rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-gray-900 dark:text-white">{dest.name}</span>
                      <span className="px-2 py-0.2 rounded-full text-[10px] uppercase font-bold bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400">
                        {dest.type}
                      </span>
                    </div>
                  </div>
                </label>
              ))}

              {!alertDestinations.length && (
                <p className="text-xs text-gray-500 py-4 text-center">
                  No alert destinations defined yet. Configure them in{" "}
                  <Link href="/settings/alerts" className="text-emerald-600 underline">
                    Settings → Alerts
                  </Link>
                  .
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowAlertModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-500 hover:text-gray-900 dark:hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveAlerts}
                disabled={savingAlerts}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold disabled:opacity-50"
              >
                {savingAlerts ? "Saving…" : "Save Routing"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
