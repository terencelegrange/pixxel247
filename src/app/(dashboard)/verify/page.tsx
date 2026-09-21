"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface Service { id: number; name: string; description: string | null; asset_count: number; configured_asset_count: number }
interface Result { assetId: string; assetName: string; shortCode: string | null; checkType: string | null; status: "healthy" | "degraded" | "down" | "unknown"; message: string; responseCode: number | null; responseTimeMs: number; checkedAt: string }
interface Verification { service: { id: number; name: string }; overallStatus: "healthy" | "degraded" | "down"; checkedAt: string; results: Result[] }

const styles = {
  healthy: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
  degraded: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
  down: "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20",
  unknown: "bg-gray-500/10 text-gray-600 dark:text-slate-300 border-gray-500/20",
};

export default function LiveVerificationPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [serviceId, setServiceId] = useState("");
  const [running, setRunning] = useState(false);
  const [verification, setVerification] = useState<Verification | null>(null);
  const [error, setError] = useState("");

  useEffect(() => { fetch("/api/business-services").then((response) => response.json()).then((data) => { setServices(data.services || []); if (data.services?.[0]) setServiceId(String(data.services[0].id)); }).catch(() => setError("Could not load business services")); }, []);

  async function verify() {
    setRunning(true); setError(""); setVerification(null);
    const response = await fetch("/api/verification", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ serviceId: Number(serviceId) }) });
    const data = await response.json(); setRunning(false);
    if (!response.ok) return setError(data.error || "Verification failed");
    setVerification(data);
  }

  const selected = services.find((service) => String(service.id) === serviceId);
  return <div className="space-y-6">
    <div><h1 className="text-2xl font-bold text-gray-900 dark:text-white">Live Verification</h1><p className="text-sm text-gray-500 dark:text-slate-400 mt-1">Check every asset in a business service now and calculate its overall availability.</p></div>
    <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-end gap-4"><div className="flex-1"><label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Business service</label><select value={serviceId} onChange={(e) => { setServiceId(e.target.value); setVerification(null); }} className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-white">{services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select>{selected && <p className="mt-1.5 text-xs text-gray-500">{selected.asset_count} assets · {selected.configured_asset_count} monitoring configurations</p>}</div><button onClick={verify} disabled={!serviceId || running} className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold disabled:opacity-50">{running ? "Checking assets…" : "Run live verification"}</button></div>
      {!services.length && <p className="mt-4 text-sm text-gray-500">Define a <Link href="/services" className="text-emerald-600 dark:text-emerald-400 hover:underline">business service</Link> before running verification.</p>}
    </div>
    {error && <div className="p-4 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 text-sm text-red-700 dark:text-red-300">{error}</div>}
    {verification && <>
      <div className={`rounded-2xl border p-6 ${styles[verification.overallStatus]}`}><div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-widest opacity-70">Overall status</p><h2 className="mt-1 text-2xl font-extrabold capitalize">{verification.overallStatus}</h2><p className="mt-1 text-sm opacity-80">{verification.service.name}</p></div><p className="text-xs opacity-70">Checked {new Date(verification.checkedAt).toLocaleString()}</p></div></div>
      <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm"><div className="divide-y divide-gray-100 dark:divide-slate-800">{verification.results.map((result) => <div key={result.assetId} className="p-4 flex flex-col md:flex-row md:items-center gap-3"><div className="flex-1 min-w-0"><div className="flex items-center gap-2"><span className={`inline-flex px-2 py-0.5 rounded-full border text-xs font-semibold capitalize ${styles[result.status]}`}>{result.status}</span><h3 className="font-semibold text-gray-900 dark:text-white truncate">{result.assetName}</h3>{result.shortCode && <span className="text-xs text-gray-400">{result.shortCode}</span>}</div><p className="mt-1 text-sm text-gray-500 dark:text-slate-400">{result.message}</p></div><div className="flex items-center gap-5 text-xs text-gray-500 dark:text-slate-400"><span>{result.checkType === "statuspage" ? "Statuspage" : result.checkType ? "HTTP" : "Not configured"}</span>{result.responseCode && <span>HTTP {result.responseCode}</span>}<span>{result.responseTimeMs} ms</span>{!result.checkType && <Link href={`/assets/${encodeURIComponent(result.assetId)}/monitor`} className="font-semibold text-emerald-600 dark:text-emerald-400">Configure</Link>}</div></div>)}{!verification.results.length && <p className="p-8 text-center text-sm text-gray-500">This business service has no assets.</p>}</div></div>
    </>}
  </div>;
}
