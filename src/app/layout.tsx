import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Time Orchestrator",
  description: "Personal time orchestration system",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-slate-900 antialiased">
        <header className="border-b border-slate-200">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-y-2 px-6 py-4">
            <Link href="/calendar" className="text-lg font-semibold tracking-tight">
              Time Orchestrator
            </Link>

            {/* Desktop nav */}
            <nav className="hidden items-center gap-6 md:flex">
              <Link
                href="/calendar"
                className="text-sm font-medium text-slate-600 transition-colors hover:text-slate-900"
              >
                Calendar
              </Link>
              <Link
                href="/day"
                className="text-sm font-medium text-slate-600 transition-colors hover:text-slate-900"
              >
                Today
              </Link>
              {/* Placeholder: there's no session to check yet (see
                  src/lib/auth.ts — no providers configured), so this
                  always renders as "Sign In". Once a real session lookup
                  exists, swap this for a conditional Sign In / Sign Out
                  button based on session state. */}
              <button
                type="button"
                disabled
                title="Sign in is not wired up yet"
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Sign In
              </button>
            </nav>

            {/* Mobile hamburger toggle — pure CSS (checkbox hack), so the
                root layout can stay a server component and keep its
                `metadata` export (Next.js doesn't allow metadata exports
                in "use client" files). */}
            <input id="nav-toggle" type="checkbox" className="peer hidden" />
            <label
              htmlFor="nav-toggle"
              className="flex cursor-pointer flex-col gap-1.5 p-2 md:hidden"
              aria-label="Toggle navigation menu"
            >
              <span className="h-0.5 w-6 bg-slate-700" />
              <span className="h-0.5 w-6 bg-slate-700" />
              <span className="h-0.5 w-6 bg-slate-700" />
            </label>

            {/* Mobile menu panel — hidden until the checkbox above is
                checked, shown via the `peer-checked` sibling selector. */}
            <nav className="hidden w-full flex-col gap-1 border-t border-slate-200 pt-3 peer-checked:flex md:hidden">
              <Link
                href="/calendar"
                className="rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Calendar
              </Link>
              <Link
                href="/day"
                className="rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Today
              </Link>
              <button
                type="button"
                disabled
                title="Sign in is not wired up yet"
                className="mt-1 rounded-md border border-slate-300 px-3 py-2 text-left text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Sign In
              </button>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
