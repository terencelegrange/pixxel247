"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface Asset {
  id: string;
  name: string;
  short_code: string | null;
  category: string | null;
  type: string | null;
  lifecycle_status: string | null;
  vendor: string | null;
  business_owner: string | null;
  technical_owner: string | null;
  app_url: string | null;
  monitor_configured: boolean;
  check_type: string | null;
}

export default function AssetsPage() {
  const [assets, setAssets] = useState<Asset[] | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/assets")
      .then((r) => r.json())
      .then((data) => setAssets(data.assets || []))
      .catch(() => setAssets([]));
  }, []);

  const filtered = (assets || []).filter((a) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return a.name.toLowerCase().includes(q) || (a.vendor || "").toLowerCase().includes(q) || (a.category || "").toLowerCase().includes(q);
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Assets</h1>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
            Assets pulled from Pixxel — the building blocks for business services.
          </p>
        </div>
        <Link
          href="/settings/pixxel-connection"
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-gray-300 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800 text-sm font-semibold text-gray-700 dark:text-slate-300 transition"
        >
          Pixxel Connection Settings
        </Link>
      </div>

      {assets === null ? (
        <p className="text-sm text-gray-500 dark:text-slate-400">Loading…</p>
      ) : assets.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl p-10 text-center">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">No assets yet</p>
          <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
            Configure the Pixxel connection and pull assets to populate this list.
          </p>
          <Link
            href="/settings/pixxel-connection"
            className="mt-4 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold shadow-sm transition"
          >
            Go to Pixxel Connection
          </Link>
        </div>
      ) : (
        <>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, vendor, or category…"
            className="w-full max-w-md px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-slate-800/50 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                <tr>
                  <th className="text-left px-4 py-3">Name</th>
                  <th className="text-left px-4 py-3">Category</th>
                  <th className="text-left px-4 py-3">Type</th>
                  <th className="text-left px-4 py-3">Vendor</th>
                  <th className="text-left px-4 py-3">Lifecycle</th>
                  <th className="text-left px-4 py-3">Owner</th>
                  <th className="text-left px-4 py-3">Monitoring</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                {filtered.map((a) => (
                  <tr key={a.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3">
                      {a.app_url ? (
                        <a href={a.app_url} target="_blank" rel="noreferrer" className="font-medium text-gray-900 dark:text-white hover:text-emerald-600 dark:hover:text-emerald-400">
                          {a.name}
                        </a>
                      ) : (
                        <span className="font-medium text-gray-900 dark:text-white">{a.name}</span>
                      )}
                      {a.short_code && <span className="ml-2 text-xs text-gray-400 dark:text-slate-500">{a.short_code}</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-slate-400">{a.category || "—"}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-slate-400">{a.type || "—"}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-slate-400">{a.vendor || "—"}</td>
                    <td className="px-4 py-3">
                      {a.lifecycle_status ? (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          {a.lifecycle_status}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-slate-400">{a.business_owner || a.technical_owner || "—"}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/assets/${encodeURIComponent(a.id)}/monitor`}
                        className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold border transition ${a.monitor_configured
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20"
                          : "text-gray-600 dark:text-slate-300 border-gray-300 dark:border-slate-700 hover:bg-gray-100 dark:hover:bg-slate-800"
                        }`}
                      >
                        {a.monitor_configured ? `${a.check_type === "statuspage" ? "Statuspage" : "HTTP"} configured` : "Configure"}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
