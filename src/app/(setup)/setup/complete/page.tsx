"use client";

import { useRouter } from "next/navigation";

export default function SetupCompletePage() {
  const router = useRouter();
  return <div className="py-16"><div className="mx-auto max-w-md text-center bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl p-8 shadow-sm"><div className="mx-auto w-14 h-14 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center text-2xl">✓</div><h1 className="mt-5 text-2xl font-bold text-gray-900 dark:text-white">Pixxel247 is ready</h1><p className="mt-2 text-sm text-gray-500 dark:text-slate-400">The database and administrator account have been configured.</p><button onClick={() => router.push("/login")} className="mt-6 px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold">Continue to sign in</button></div></div>;
}
