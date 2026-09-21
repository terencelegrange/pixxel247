"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface Component { id: string; name: string; status: string }
interface TestResult { status: "healthy" | "degraded" | "down" | "unknown"; message: string; responseCode: number | null; responseTimeMs: number; checkedAt: string }

export default function AssetMonitorPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [assetName, setAssetName] = useState("Asset");
  const [canEdit, setCanEdit] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [checkType, setCheckType] = useState("http");
  const [url, setUrl] = useState("");
  const [method, setMethod] = useState("GET");
  const [expectedStatus, setExpectedStatus] = useState(200);
  const [timeoutMs, setTimeoutMs] = useState(10000);
  const [headers, setHeaders] = useState("");
  const [requestBody, setRequestBody] = useState("");
  const [hasHeaders, setHasHeaders] = useState(false);
  const [hasBody, setHasBody] = useState(false);
  const [clearHeaders, setClearHeaders] = useState(false);
  const [clearBody, setClearBody] = useState(false);
  const [components, setComponents] = useState<Component[]>([]);
  const [componentId, setComponentId] = useState("");
  const [componentName, setComponentName] = useState("");
  const [discovering, setDiscovering] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetch(`/api/assets/${encodeURIComponent(id)}/monitor`).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load asset");
      setAssetName(data.asset.name); setCanEdit(data.canEdit); setConfigured(Boolean(data.config));
      if (data.config) {
        setCheckType(data.config.check_type); setUrl(data.config.url); setMethod(data.config.method);
        setExpectedStatus(data.config.expected_status); setTimeoutMs(data.config.timeout_ms);
        setComponentId(data.config.statuspage_component_id || ""); setComponentName(data.config.statuspage_component_name || "");
        setHasHeaders(data.config.has_headers); setHasBody(data.config.has_body);
      }
    }).catch((error) => setMessage({ type: "error", text: error.message }));
  }, [id]);

  async function discover() {
    setDiscovering(true); setMessage(null);
    const response = await fetch("/api/statuspage/discover", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) });
    const data = await response.json(); setDiscovering(false);
    if (!response.ok) return setMessage({ type: "error", text: data.error || "Discovery failed" });
    setComponents(data.components || []);
    if (data.components?.length && !data.components.some((component: Component) => component.id === componentId)) {
      setComponentId(data.components[0].id); setComponentName(data.components[0].name);
    }
    setMessage({ type: "success", text: `Found ${data.components?.length || 0} selectable components.` });
  }

  async function save(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setMessage(null);
    const response = await fetch(`/api/assets/${encodeURIComponent(id)}/monitor`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ check_type: checkType, url, method, expected_status: expectedStatus, timeout_ms: timeoutMs, headers, request_body: requestBody, clear_headers: clearHeaders, clear_body: clearBody, statuspage_component_id: componentId, statuspage_component_name: componentName }),
    });
    const data = await response.json(); setSaving(false);
    if (!response.ok) return setMessage({ type: "error", text: data.error || "Could not save monitoring configuration" });
    setConfigured(true); setHasHeaders(clearHeaders ? false : hasHeaders || Boolean(headers)); setHasBody(clearBody ? false : hasBody || Boolean(requestBody));
    setHeaders(""); setRequestBody(""); setClearHeaders(false); setClearBody(false);
    setMessage({ type: "success", text: "Monitoring configuration saved." });
  }

  async function testConfiguration() {
    setTesting(true); setMessage(null); setTestResult(null);
    const response = await fetch(`/api/assets/${encodeURIComponent(id)}/monitor`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ check_type: checkType, url, method, expected_status: expectedStatus, timeout_ms: timeoutMs, headers, request_body: requestBody, clear_headers: clearHeaders, clear_body: clearBody, statuspage_component_id: componentId, statuspage_component_name: componentName }),
    });
    const data = await response.json(); setTesting(false);
    if (!response.ok) return setMessage({ type: "error", text: data.error || "Could not test monitoring configuration" });
    setTestResult(data.result);
  }

  async function remove() {
    if (!confirm("Remove this asset's monitoring configuration?")) return;
    const response = await fetch(`/api/assets/${encodeURIComponent(id)}/monitor`, { method: "DELETE" });
    if (response.ok) router.push("/assets");
  }

  return <div className="max-w-3xl space-y-6">
    <div><div className="flex gap-2 text-sm text-gray-500 mb-2"><Link href="/assets" className="hover:text-gray-900 dark:hover:text-white">Assets</Link><span>/</span><span>Monitoring</span></div><h1 className="text-2xl font-bold text-gray-900 dark:text-white">{assetName}</h1><p className="text-sm text-gray-500 dark:text-slate-400 mt-1">Configure the single live health check used whenever this asset is verified.</p></div>
    {message && <div className={`p-3 rounded-xl border text-sm ${message.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300" : "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"}`}>{message.text}</div>}
    {!canEdit && <div className="p-4 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/20 text-sm text-amber-800 dark:text-amber-300">Your role can view this configuration but cannot change it.</div>}
    <form onSubmit={save} className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-5">
      <div><label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Check type</label><div className="grid sm:grid-cols-3 gap-2">{[["http", "Generic health", "Expected HTTP response"], ["statuspage", "Statuspage", "Discover a provider component"], ["custom", "Custom request", "Method, headers and body"]].map(([value, label, help]) => <button key={value} type="button" disabled={!canEdit} onClick={() => { setCheckType(value); if (value !== "custom") setMethod("GET"); }} className={`text-left p-3 rounded-xl border ${checkType === value ? "border-emerald-500 bg-emerald-500/5" : "border-gray-200 dark:border-slate-700"}`}><span className="block text-sm font-semibold text-gray-900 dark:text-white">{label}</span><span className="block text-xs text-gray-500 mt-0.5">{help}</span></button>)}</div></div>
      <div><label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">{checkType === "statuspage" ? "Status page URL" : "Endpoint URL"}</label><input type="url" required disabled={!canEdit} value={url} onChange={(e) => setUrl(e.target.value)} placeholder={checkType === "statuspage" ? "https://status.example.com/" : "https://service.example.com/health"} className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-white disabled:opacity-60" /><p className="mt-1 text-xs text-gray-500">Internal HTTP endpoints and external HTTPS endpoints are supported.</p></div>
      {checkType === "statuspage" ? <div className="space-y-3"><button type="button" onClick={discover} disabled={!canEdit || !url || discovering} className="px-4 py-2 rounded-xl border border-gray-300 dark:border-slate-700 text-sm font-semibold disabled:opacity-50">{discovering ? "Discovering…" : "Discover components"}</button>{(components.length > 0 || componentId) && <div><label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Component</label><select required disabled={!canEdit} value={componentId} onChange={(e) => { setComponentId(e.target.value); setComponentName(e.target.selectedOptions[0]?.text.split(" — ")[0] || ""); }} className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-white">{componentId && !components.some((component) => component.id === componentId) && <option value={componentId}>{componentName || componentId}</option>}{components.map((component) => <option key={component.id} value={component.id}>{component.name} — {component.status.replaceAll("_", " ")}</option>)}</select></div>}</div> : <div className="grid sm:grid-cols-3 gap-4"><div><label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Method</label><select disabled={!canEdit || checkType === "http"} value={method} onChange={(e) => setMethod(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-white">{["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"].map((value) => <option key={value}>{value}</option>)}</select></div><div><label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Expected code</label><input type="number" min="100" max="599" disabled={!canEdit} value={expectedStatus} onChange={(e) => setExpectedStatus(Number(e.target.value))} className="w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-white" /></div><div><label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Timeout (ms)</label><input type="number" min="1000" max="30000" step="500" disabled={!canEdit} value={timeoutMs} onChange={(e) => setTimeoutMs(Number(e.target.value))} className="w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-white" /></div></div>}
      {checkType !== "statuspage" && <div className="grid sm:grid-cols-2 gap-4"><div><label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Encrypted headers (JSON)</label><textarea disabled={!canEdit || clearHeaders} value={headers} onChange={(e) => setHeaders(e.target.value)} rows={4} placeholder={hasHeaders ? "Saved securely — enter JSON to replace" : '{"Authorization":"Bearer secret"}'} className="w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono text-gray-900 dark:text-white" />{hasHeaders && <label className="mt-1 flex items-center gap-2 text-xs text-gray-500"><input type="checkbox" checked={clearHeaders} onChange={(e) => setClearHeaders(e.target.checked)} /> Clear saved headers</label>}</div><div><label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Encrypted request body</label><textarea disabled={!canEdit || clearBody || method === "GET" || method === "HEAD"} value={requestBody} onChange={(e) => setRequestBody(e.target.value)} rows={4} placeholder={hasBody ? "Saved securely — enter content to replace" : "Optional request body"} className="w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono text-gray-900 dark:text-white disabled:opacity-60" />{hasBody && <label className="mt-1 flex items-center gap-2 text-xs text-gray-500"><input type="checkbox" checked={clearBody} onChange={(e) => setClearBody(e.target.checked)} /> Clear saved body</label>}</div></div>}
      {checkType === "statuspage" && <div><label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Timeout (ms)</label><input type="number" min="1000" max="30000" step="500" disabled={!canEdit} value={timeoutMs} onChange={(e) => setTimeoutMs(Number(e.target.value))} className="w-full sm:w-48 px-3 py-2.5 rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-white" /></div>}
      {testResult && <div className={`p-4 rounded-xl border ${testResult.status === "healthy" ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30" : testResult.status === "degraded" ? "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30" : "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30"}`}><div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"><div><p className={`text-sm font-bold capitalize ${testResult.status === "healthy" ? "text-emerald-700 dark:text-emerald-300" : testResult.status === "degraded" ? "text-amber-700 dark:text-amber-300" : "text-red-700 dark:text-red-300"}`}>Test {testResult.status}</p><p className="mt-1 text-sm text-gray-600 dark:text-slate-300">{testResult.message}</p></div><div className="flex gap-4 text-xs text-gray-500 dark:text-slate-400">{testResult.responseCode !== null && <span>HTTP {testResult.responseCode}</span>}<span>{testResult.responseTimeMs} ms</span></div></div></div>}
      {canEdit && <div className="flex flex-wrap gap-3 pt-2"><button disabled={saving || testing} className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold disabled:opacity-50">{saving ? "Saving…" : "Save configuration"}</button><button type="button" onClick={testConfiguration} disabled={saving || testing || !url || (checkType === "statuspage" && !componentId)} className="px-4 py-2.5 rounded-xl border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-sm font-semibold hover:bg-emerald-50 dark:hover:bg-emerald-950/30 disabled:opacity-50">{testing ? "Testing…" : "Test"}</button>{configured && <button type="button" onClick={remove} disabled={saving || testing} className="px-4 py-2.5 rounded-xl border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 text-sm font-semibold disabled:opacity-50">Remove</button>}</div>}
    </form>
  </div>;
}
