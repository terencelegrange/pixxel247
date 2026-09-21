export default function SetupLayout({ children }: { children: React.ReactNode }) {
  return <main className="min-h-full bg-gray-50 dark:bg-slate-950 px-4 py-10"><div className="mx-auto max-w-3xl">{children}</div></main>;
}
