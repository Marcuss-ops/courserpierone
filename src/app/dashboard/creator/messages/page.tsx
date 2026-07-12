import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/supabase/get-user";
import { CreatorInbox } from "./creator-inbox";
import { InboxProvider } from "@/components/layout/inbox-provider";
import {
  getCreatorInbox,
  type CreatorConversationPreview,
} from "@/domains/insights/customer-profile/get-creator-inbox";

// Re-export for backward compat with the existing import site
// (src/app/dashboard/creator/messages/creator-inbox.tsx imports
// `CreatorConversationPreview` from "./page"). Phase 5 will
// move the consumer to import from the service directly and
// this re-export can be removed.
export type { CreatorConversationPreview };

interface PageProps {
  searchParams: Promise<{ c?: string }>;
}

/**
 * /dashboard/creator/messages
 *
 * Fase 3.2 del piano DMs: inbox two-column view dedicato al lato creator.
 * - Left: lista conversationi dei prodotti venduti dal creator (o tutte per admin).
 * - Right: chat view inline (no redirect a /dashboard/messages/[userId]).
 *
 * Filtri supportati lato client:
 * - search per nome cliente (debounced)
 * - product dropdown (scope per prodotto)
 * - unread-only toggle
 *
 * Selection: `?c=<conversationId>` seleziona la conversation mostrata nel
 * right column. URL state per deep-linking.
 *
 * Role gating: solo `creator` o `admin`. Per altri ruoli redirect
 * alla inbox standard /dashboard/messages.
 *
 * Phase 7 cleanup: all 3 Prisma queries (product findMany +
 * conversation findMany + message groupBy) are extracted into
 * `getCreatorInbox()`. This page is now thin: auth + role gating +
 * URL-state `selectedConversationId` validation. Phase 5 will
 * extend the service with the CustomerProductInsight read model
 * (2 more queries + 4 new fields on the preview) without touching
 * this file.
 */
export default async function CreatorMessagesPage({ searchParams }: PageProps) {
  const { user, dbUser } = await getServerUser();
  if (!user?.email || !dbUser) {
    redirect("/login");
  }

  if (dbUser.role !== "creator" && dbUser.role !== "admin") {
    // Studenti e altri ruoli non hanno accesso all'inbox creator-only.
    redirect("/dashboard/messages");
  }

  const { c: rawSelectedConversationId } = await searchParams;

  // ── Data fetch (delegated to the Phase 7 service) ─────────────
  // The 3-query plan (products + conversations + message groupBy)
  // lives in `getCreatorInbox()`. See that file for the full
  // rationale and the Phase 5 extension plan.
  const { previews, productOptions, totalUnread } = await getCreatorInbox({
    id: dbUser.id,
    role: dbUser.role,
  });

  // Security/UX: validate `c` server-side against THIS user's previews.
  // Without this guard, an attacker could probe arbitrary conversationIds
  // via `?c=GHOST_ID` → ChatView's fetch would silently 403. Normalizing
  // to null here gives a graceful "Seleziona una conversazione" empty
  // state instead of a confusing silent fail.
  const selectedConversationId =
    rawSelectedConversationId &&
    previews.some((p) => p.id === rawSelectedConversationId)
      ? rawSelectedConversationId
      : null;

  return (
    <InboxProvider
      initialTotalUnread={totalUnread}
      initialByConversation={Object.fromEntries(
        previews.map((p) => [p.id, p.unreadCount]),
      )}
    >
    <Suspense fallback={null}>
      <CreatorInbox
        previews={previews}
        productOptions={productOptions}
        initialSelectedConversationId={selectedConversationId}
        currentUserId={dbUser.id}
        currentUserName={
          dbUser.name || dbUser.email?.split("@")[0] || "Creator"
        }
        role={dbUser.role}
        totalUnread={totalUnread}
      />
    </Suspense>
    </InboxProvider>
  );
}
