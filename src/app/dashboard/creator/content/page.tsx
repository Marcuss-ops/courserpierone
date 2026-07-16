// src/app/dashboard/creator/content/page.tsx
// THIN PAGE per master-plan §4 (≤150 LOC target, ≤250 LOC review threshold).
// Per ADR-0018: ZERO Prisma queries in this page body. Adapter is imported
// and passed to the use case, never invoked with Prisma literals here.

import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/supabase/get-user";
import { buildContent } from "@/domains/creator-ops/read-models/content";
import { prismaContentRepository } from "@/domains/creator-ops/read-models/prisma-content-repository";

interface PageProps {
  searchParams: Promise<{ tab?: string }>;
}

const VALID_TABS = new Set(["drafts", "scheduled", "recent"] as const);
type ContentTab = "drafts" | "scheduled" | "recent";

/**
 * /dashboard/creator/content — Phase 3 Creator Studio Content area (Fase 3.3).
 *
 * Auth + role gate + buildContent + pass to UI. The UI component is the
 * next refactor cycle (Commit 2-4 will harden styling once all 4 areas
 * share a layout shell). Inline placeholder rendering satisfies the
 * "thin page" criterion (≤150 LOC).
 */
export default async function CreatorContentPage({ searchParams }: PageProps) {
  const { user, dbUser } = await getServerUser();
  if (!user?.email || !dbUser) redirect("/login");
  if (dbUser.role !== "creator" && dbUser.role !== "admin") redirect("/dashboard");

  const { tab: rawTab } = await searchParams;
  const activeTab: ContentTab = VALID_TABS.has(rawTab as ContentTab)
    ? (rawTab as ContentTab)
    : "drafts";

  const view = await buildContent(
    { creatorId: dbUser.id },
    { repo: prismaContentRepository },
  );

  return (
    <main className="flex flex-col gap-6 p-6 lg:p-10 text-white">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Content</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Gestione bozze, pubblicazioni programmate e contenuti recenti.
        </p>
      </header>
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <TabCard label="Drafts" count={view.totals.drafts} active={activeTab === "drafts"} href="/dashboard/creator/content?tab=drafts" />
        <TabCard label="Scheduled" count={view.totals.scheduled} active={activeTab === "scheduled"} href="/dashboard/creator/content?tab=scheduled" />
        <TabCard label="Recent" count={view.totals.recent} active={activeTab === "recent"} href="/dashboard/creator/content?tab=recent" />
      </section>
    </main>
  );
}

function TabCard({ label, count, active, href }: { label: string; count: number; active: boolean; href: string }) {
  return (
    <a
      href={href}
      className={`premium-glass p-6 rounded-2xl transition-all ${active ? "border-accent-primary/30 ring-1 ring-accent-primary/20" : "border-white/5 hover:border-white/10"}`}
    >
      <div className="text-xs font-black uppercase tracking-widest text-zinc-400">{label}</div>
      <div className="text-4xl font-bold mt-2">{count}</div>
    </a>
  );
}
