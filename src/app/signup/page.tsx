"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/setup/status")
      .then((r) => r.json())
      .then(({ complete }) => {
        if (!complete) router.replace("/setup");
      })
      .catch(() => {});
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) { setDone(true); } else { setError((await res.json()).error || "Signup failed"); }
    } catch { setError("Network error"); }
    finally { setLoading(false); }
  }

  if (done) return (
    <div className="min-h-full flex items-center justify-center px-4 bg-gray-50 dark:bg-slate-950">
      <div className="w-full max-w-sm text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 mb-4">
          <svg className="w-7 h-7 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Request submitted</h1>
        <p className="text-gray-500 dark:text-slate-400 text-sm mb-6">Your account is pending approval by an admin.</p>
        <Link href="/login" className="text-emerald-500 hover:text-emerald-400 text-sm transition">Back to sign in</Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-full flex items-center justify-center px-4 bg-gray-50 dark:bg-slate-950">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 mb-4">
            <svg className="w-7 h-7 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Create account</h1>
          <p className="text-gray-500 dark:text-slate-400 text-sm mt-1">Request access</p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400 rounded-lg px-4 py-3 text-sm">{error}</div>
            )}
            {[
              { label: "Name", key: "name", type: "text", optional: true },
              { label: "Email", key: "email", type: "email", optional: false },
              { label: "Password", key: "password", type: "password", optional: false },
            ].map(({ label, key, type, optional }) => (
              <div key={key}>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                  {label} {optional && <span className="text-gray-400 dark:text-slate-500">(optional)</span>}
                </label>
                <input type={type} value={form[key as keyof typeof form]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  required={!optional}
                  className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-300 dark:border-slate-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition" />
              </div>
            ))}
            <p className="text-xs text-gray-400 dark:text-slate-500">Minimum 8 characters for password</p>
            <button type="submit" disabled={loading}
              className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-500/50 text-white font-semibold rounded-lg px-4 py-2.5 text-sm transition mt-2">
              {loading ? "Submitting…" : "Request access"}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-gray-500 dark:text-slate-500 mt-4">
          Already have an account?{" "}
          <Link href="/login" className="text-emerald-500 hover:text-emerald-400 transition">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
