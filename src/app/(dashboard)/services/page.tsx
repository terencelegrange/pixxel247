"use client";

import { useEffect, useMemo, useState } from "react";

interface Asset { id: string; name: string; short_code: string | null; category: string | null }
interface Service { id: number; name: string; description: string | null; asset_count: number; configured_asset_count: number }

export default function BusinessServicesPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ error?: string; success?: string }>({});

  async function load() {
    const [servicesResponse, assetsResponse] = await Promise.all([fetch("/api/business-services"), fetch("/api/assets")]);
    const servicesData = await servicesResponse.json();
    const assetsData = await assetsResponse.json();
    setServices(servicesData.services || []);
    setCanEdit(Boolean(servicesData.canEdit));
    setAssets(assetsData.assets || []);
  }

  useEffect(() => { load().catch(() => setMessage({ error: "Could not load business services" })); }, []);

  const filteredAssets = useMemo(() => assets.filter((asset) => `${asset.name} ${asset.short_code || ""} ${asset.category || ""}`.toLowerCase().includes(search.toLowerCase())), [assets, search]);

  function resetForm() {
    setEditingId(null); setName(""); setDescription(""); setSelected([]); setSearch(""); setMessage({});
  }

  async function edit(service: Service) {
    const response = await fetch(`/api/business-services/${service.id}`);
    const data = await response.json();
    if (!response.ok) return setMessage({ error: data.error || "Could not load service" });
    setEditingId(service.id);
    setName(data.service.name);
    setDescription(data.service.description || "");
    setSelected(data.service.assets.map((asset: Asset) => asset.id));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setMessage({});
    const wasEditing = editingId !== null;
    const response = await fetch(editingId ? `/api/business-services/${editingId}` : "/api/business-services", {
      method: editingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description, assetIds: selected }),
    });
    const data = await response.json();
    setSaving(false);
    if (!response.ok) return setMessage({ error: data.error || "Could not save service" });
    resetForm();
    setMessage({ success: wasEditing ? "Business service updated" : "Business service created" });
    await load();
  }

  async function remove(service: Service) {
    if (!confirm(`Delete ${service.name}? This does not delete its assets or monitoring configurations.`)) return;
    const response = await fetch(`/api/business-services/${service.id}`, { method: "DELETE" });
    const data = await response.json();
    if (!response.ok) return setMessage({ error: data.error || "Could not delete service" });
    if (editingId === service.id) resetForm();
    setMessage({ success: "Business service deleted" });
    await load();
  }

  return <div className="space-y-6">
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Business Services</h1>
      <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">Group technical assets into the services your organisation relies on.</p>
    </div>

    {message.error && <div className="p-3 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 text-sm text-red-700 dark:text-red-300">{message.error}</div>}
    {message.success && <div className="p-3 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 text-sm text-emerald-700 dark:text-emerald-300">{message.success}</div>}

    {canEdit && <form onSubmit={save} className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-gray-900 dark:text-white">{editingId ? "Edit business service" : "Create business service"}</h2>
        {editingId && <button type="button" onClick={resetForm} className="text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white">Cancel edit</button>}
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <div><label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Name</label><input required maxLength={200} value={name} onChange={(e) => setName(e.target.value)} placeholder="Forms Platform" className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500" /></div>
        <div><label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Description</label><input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Customer-facing form submission service" className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500" /></div>
      </div>
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2"><label className="text-xs font-semibold uppercase tracking-wider text-gray-500">Assets ({selected.length} selected)</label><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter assets…" className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-white" /></div>
        <div className="max-h-64 overflow-y-auto rounded-xl border border-gray-200 dark:border-slate-700 divide-y divide-gray-100 dark:divide-slate-800">
          {filteredAssets.map((asset) => <label key={asset.id} className="flex items-center gap-3 p-3 hover:bg-gray-50 dark:hover:bg-slate-800/50 cursor-pointer"><input type="checkbox" checked={selected.includes(asset.id)} onChange={() => setSelected((current) => current.includes(asset.id) ? current.filter((id) => id !== asset.id) : [...current, asset.id])} className="rounded text-emerald-600 focus:ring-emerald-500" /><span className="text-sm font-medium text-gray-900 dark:text-white">{asset.name}</span><span className="text-xs text-gray-400">{asset.short_code || asset.category || ""}</span></label>)}
          {!filteredAssets.length && <p className="p-4 text-sm text-gray-500">No matching assets.</p>}
        </div>
      </div>
      <button disabled={saving} className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold disabled:opacity-50">{saving ? "Saving…" : editingId ? "Save changes" : "Create service"}</button>
    </form>}

    <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
      {services.map((service) => <div key={service.id} className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3"><div><h2 className="font-bold text-gray-900 dark:text-white">{service.name}</h2><p className="mt-1 text-sm text-gray-500 dark:text-slate-400 min-h-10">{service.description || "No description"}</p></div><span className={`w-2.5 h-2.5 rounded-full mt-1.5 ${service.asset_count > 0 && service.asset_count === service.configured_asset_count ? "bg-emerald-500" : "bg-amber-500"}`} /></div>
        <div className="mt-4 flex gap-4 text-xs text-gray-500 dark:text-slate-400"><span><strong className="text-gray-900 dark:text-white">{service.asset_count}</strong> assets</span><span><strong className="text-gray-900 dark:text-white">{service.configured_asset_count}</strong> monitored</span></div>
        {canEdit && <div className="mt-4 pt-4 border-t border-gray-100 dark:border-slate-800 flex gap-3"><button onClick={() => edit(service)} className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">Edit</button><button onClick={() => remove(service)} className="text-sm font-semibold text-red-600 dark:text-red-400">Delete</button></div>}
      </div>)}
      {!services.length && <div className="md:col-span-2 xl:col-span-3 p-10 text-center bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl text-sm text-gray-500">No business services have been defined yet.</div>}
    </div>
  </div>;
}
