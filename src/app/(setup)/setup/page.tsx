"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Dialect = "mysql" | "sqlite";

export default function SetupPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [step, setStep] = useState(1);
  const [dialect, setDialect] = useState<Dialect>("sqlite");
  const [db, setDb] = useState({ host: "192.168.100.252", port: "3306", user: "", password: "", name: "pixxel247", file: "pixxel247.db" });
  const [admin, setAdmin] = useState({ name: "Terence Le Grange", email: "terence.legrange@gmail.com", password: "", confirm: "" });
  const [testing, setTesting] = useState(false);
  const [testOk, setTestOk] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { fetch("/api/setup/status").then((r) => r.json()).then((data) => data.complete ? router.replace("/login") : setChecking(false)).catch(() => setChecking(false)); }, [router]);

  const field = "w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500";

  async function testDatabase() {
    setTesting(true); setError(""); setTestOk(false);
    const response = await fetch("/api/setup/test-db", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(dialect === "sqlite" ? { dialect, file: db.file } : { dialect, host: db.host, port: db.port, user: db.user, password: db.password, name: db.name }) });
    const data = await response.json(); setTesting(false);
    if (!response.ok) return setError(data.error || "Database test failed");
    setTestOk(true);
  }

  async function completeSetup() {
    if (admin.password.length < 8) return setError("Password must be at least 8 characters");
    if (admin.password !== admin.confirm) return setError("Passwords do not match");
    setSubmitting(true); setError("");
    const response = await fetch("/api/setup/complete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ db: dialect === "sqlite" ? { dialect, file: db.file } : { dialect, host: db.host, port: db.port, user: db.user, password: db.password, name: db.name }, admin }) });
    const data = await response.json(); setSubmitting(false);
    if (!response.ok) return setError(data.error || "Setup failed");
    router.push("/setup/complete");
  }

  if (checking) return <div className="flex justify-center py-20"><div className="h-7 w-7 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" /></div>;

  return <div className="space-y-6">
    <div className="text-center"><div className="mx-auto mb-4 w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center"><span className="text-xl text-emerald-500">◆</span></div><h1 className="text-3xl font-extrabold text-gray-900 dark:text-white">Set up Pixxel247</h1><p className="mt-2 text-sm text-gray-500 dark:text-slate-400">Configure storage and create the first administrator.</p></div>
    <div className="flex items-center justify-center gap-2">{["Database", "Administrator", "Review"].map((label, index) => <div key={label} className="flex items-center gap-2"><div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${step >= index + 1 ? "bg-emerald-600 text-white" : "bg-gray-200 dark:bg-slate-800 text-gray-500"}`}>{index + 1}</div><span className="hidden sm:inline text-xs font-semibold text-gray-500">{label}</span>{index < 2 && <div className={`w-10 sm:w-16 h-px ${step > index + 1 ? "bg-emerald-500" : "bg-gray-300 dark:bg-slate-700"}`} />}</div>)}</div>
    {error && <div className="p-4 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 text-sm text-red-700 dark:text-red-300">{error}</div>}

    <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
      {step === 1 && <div className="space-y-5"><div><h2 className="text-lg font-bold text-gray-900 dark:text-white">Choose your database</h2><p className="text-sm text-gray-500 mt-1">SQLite is quickest for a single local installation. MySQL is better for shared or larger deployments.</p></div><div className="grid sm:grid-cols-2 gap-3">{(["sqlite", "mysql"] as Dialect[]).map((value) => <button type="button" key={value} onClick={() => { setDialect(value); setTestOk(false); setError(""); }} className={`p-4 rounded-xl border text-left ${dialect === value ? "border-emerald-500 bg-emerald-500/5" : "border-gray-200 dark:border-slate-700"}`}><span className="block font-bold text-gray-900 dark:text-white">{value === "sqlite" ? "SQLite" : "MySQL / MariaDB"}</span><span className="block text-xs text-gray-500 mt-1">{value === "sqlite" ? "Local file, no database server required" : "Connect to an existing database server"}</span></button>)}</div>
        {dialect === "sqlite" ? <label className="block text-sm font-medium text-gray-700 dark:text-slate-300">Database filename<input value={db.file} onChange={(e) => { setDb({ ...db, file: e.target.value }); setTestOk(false); }} className={`${field} mt-1.5`} /><span className="block text-xs text-gray-400 mt-1">Stored inside the persistent application data volume.</span></label> : <div className="grid sm:grid-cols-2 gap-4"><label className="text-sm font-medium text-gray-700 dark:text-slate-300">Host<input value={db.host} onChange={(e) => { setDb({ ...db, host: e.target.value }); setTestOk(false); }} className={`${field} mt-1.5`} /></label><label className="text-sm font-medium text-gray-700 dark:text-slate-300">Port<input value={db.port} onChange={(e) => { setDb({ ...db, port: e.target.value }); setTestOk(false); }} className={`${field} mt-1.5`} /></label><label className="text-sm font-medium text-gray-700 dark:text-slate-300">Username<input value={db.user} onChange={(e) => { setDb({ ...db, user: e.target.value }); setTestOk(false); }} className={`${field} mt-1.5`} /></label><label className="text-sm font-medium text-gray-700 dark:text-slate-300">Password<input type="password" value={db.password} onChange={(e) => { setDb({ ...db, password: e.target.value }); setTestOk(false); }} className={`${field} mt-1.5`} /></label><label className="sm:col-span-2 text-sm font-medium text-gray-700 dark:text-slate-300">Database name<input value={db.name} onChange={(e) => { setDb({ ...db, name: e.target.value }); setTestOk(false); }} className={`${field} mt-1.5`} /></label></div>}
        <div className="flex justify-between items-center"><button type="button" onClick={testDatabase} disabled={testing} className="px-4 py-2 rounded-xl border border-gray-300 dark:border-slate-700 text-sm font-semibold disabled:opacity-50">{testing ? "Testing…" : "Test database"}</button><div className="flex items-center gap-3">{testOk && <span className="text-sm font-semibold text-emerald-600">Connection ready</span>}<button type="button" onClick={() => testOk ? setStep(2) : setError("Test the database before continuing")} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold">Continue</button></div></div>
      </div>}

      {step === 2 && <div className="space-y-5"><div><h2 className="text-lg font-bold text-gray-900 dark:text-white">Administrator account</h2><p className="text-sm text-gray-500 mt-1">This account receives full configuration access.</p></div><div className="grid sm:grid-cols-2 gap-4"><label className="text-sm font-medium text-gray-700 dark:text-slate-300">Name<input value={admin.name} onChange={(e) => setAdmin({ ...admin, name: e.target.value })} className={`${field} mt-1.5`} /></label><label className="text-sm font-medium text-gray-700 dark:text-slate-300">Email<input type="email" value={admin.email} onChange={(e) => setAdmin({ ...admin, email: e.target.value })} className={`${field} mt-1.5`} /></label><label className="text-sm font-medium text-gray-700 dark:text-slate-300">Password<input type="password" value={admin.password} onChange={(e) => setAdmin({ ...admin, password: e.target.value })} className={`${field} mt-1.5`} /></label><label className="text-sm font-medium text-gray-700 dark:text-slate-300">Confirm password<input type="password" value={admin.confirm} onChange={(e) => setAdmin({ ...admin, confirm: e.target.value })} className={`${field} mt-1.5`} /></label></div><div className="flex justify-between"><button onClick={() => setStep(1)} className="px-4 py-2 text-sm font-semibold text-gray-500">Back</button><button onClick={() => { if (!admin.email || admin.password.length < 8 || admin.password !== admin.confirm) setError("Enter a valid email and matching password of at least 8 characters"); else { setError(""); setStep(3); } }} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold">Review</button></div></div>}

      {step === 3 && <div className="space-y-5"><div><h2 className="text-lg font-bold text-gray-900 dark:text-white">Ready to configure</h2><p className="text-sm text-gray-500 mt-1">Pixxel247 will initialise its schema and create the administrator.</p></div><dl className="rounded-xl bg-gray-50 dark:bg-slate-800/50 divide-y divide-gray-200 dark:divide-slate-700">{[["Database", dialect === "sqlite" ? `SQLite · ${db.file}` : `MySQL · ${db.user}@${db.host}:${db.port}/${db.name}`], ["Administrator", `${admin.name || "Administrator"} · ${admin.email}`]].map(([label, value]) => <div key={label} className="flex justify-between gap-4 p-4 text-sm"><dt className="font-semibold text-gray-500">{label}</dt><dd className="text-right text-gray-900 dark:text-white">{value}</dd></div>)}</dl><div className="flex justify-between"><button onClick={() => setStep(2)} className="px-4 py-2 text-sm font-semibold text-gray-500">Back</button><button onClick={completeSetup} disabled={submitting} className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold disabled:opacity-50">{submitting ? "Setting up…" : "Complete setup"}</button></div></div>}
    </div>
  </div>;
}
