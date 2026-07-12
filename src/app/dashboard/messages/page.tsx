import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ShoppingBag, BookOpen } from "lucide-react";
import type { ReactNode } from "react";
import { prisma } from "@/lib/db/prisma";
import { getServerUser } from "@/lib/supabase/get-user";
import { ConversationList } from "./conversation-list";
import { InboxProvider } from "@/components/layout/inbox-provider";

/**
 * Forza dynamic rendering su /dashboard/messages.
 *
 * La pagina legge cookies via `getServerUser` ed esegue query Prisma
 * in tempo reale. `force-dynamic` garantisce che, dopo un cambio di
 * stato `Order.status: completed → refunded`, la prossima visita NON
 * serva una versione cached (Vercel ISR / full-route cache) con la
 * chat ancora visibile. Costo: la pagina diventa sempre SSR ad ogni
 * request, ma il numero di utenti che la caricano è basso (solo chi
 * vuole aprire un thread), quindi accettabile.
 */
export const dynamic = "force-dynamic";

/** Maximum chars to show for the last-message preview. */
const PREVIEW_MAX = 80;

export interface ConversationPreview {
  id: string;
  /**
   * Phase 1.3: ogni conversazione è legata a un prodotto. Il client
   * deve usare questo campo per costruire i link "Continua chat".
   */
  productId: string;
  productLabel: string;
  otherUser: {
    id: string;
    name: string | null;
    image: string | null;
    role: string;
  };
  lastMessage: {
    id: string;
    content: string;
    createdAt: string; // ISO string from server→client serialization
    senderId: string;
    read: boolean;
  } | null;
  unreadCount: number;
}

/**
 * /dashboard/messages — STUDENT inbox (Fase 3.3 del piano DMs).
 *
 * Scoping:
 * - Lo studente NON può scrivere a chiunque (rimossa `UserSearchBar`).
 * - Vede SOLO le conversazioni dei prodotti che ha effettivamente
 *   acquistato (Order.status = "completed"). È la "single source of
 *   truth": se gli viene revocato l'accesso (refund, chargeback),
 *   la chat scompare automaticamente dalla inbox list.
 * - Le conversation di prodotti poi rimborsati restano nel DB
 *   (orfane lato ordine). Il read-side guard su
 *   `/dashboard/messages/[userId]` chiude anche il vettore URL
 *   bypass.
 *
 * Layout (Fase 3.3):
 * - Single-column: lista FLAT delle preview (creator × prodotto).
 *   Click → `/dashboard/messages/[userId]?productId=...` (route già
 *   esistente).
 * - Due empty states distinti:
 *   (a) Nessun acquisto → CTA al catalogo.
 *   (b) Acquisti presenti ma nessuna chat aperta → CTA ai corsi.
 *
 * Decisione architetturale (vedi Fase 3.3 thinker):
 * - Single-column > two-column (no over-engineering per lo studente
 *   che ha pochi thread; riusa la route full-page già esistente).
 * - Flat list (nessun grouping per prodotto acquistato: il
 *   `productLabel` nella preview row è già discriminante visivo).
 * - Query Prisma con `productId: { in: purchasedProductIds }` invece
 *   di sola membership check, per rendere safe-by-default i rimborsi.
 * - `export const dynamic = "force-dynamic"` (vedi sopra) chiude
 *   il rischio di cache stale su refund.
 */
export default async function MessagesPage() {
  const { user, dbUser } = await getServerUser();

  if (!user?.email || !dbUser) {
    redirect("/login");
  }

  // ── 1. Recupera i prodotti effettivamente acquistati (snapshot) ──
  // Single source of truth: solo gli ordini `completed` danno diritto
  // a chat con il creator di quel prodotto. Dedup via Set perché
  // uno studente potrebbe aver comprato lo stesso prodotto più volte
  // (raro).
  const completedOrders = await prisma.order.findMany({
    where: { userId: dbUser.id, status: "completed" },
    select: { productId: true },
  });
  const purchasedProductIds = Array.from(
    new Set(completedOrders.map((o) => o.productId)),
  );

  // ── Early-return empty state: nessun acquisto ancora ─────────
  // Mostriamo CTA al catalogo PRIMA di queryare le conversation
  // (evita una query inutile + loading state vuoto).
  if (purchasedProductIds.length === 0) {
    return <InboxShell>
      <EmptyState
        icon={<ShoppingBag className="w-9 h-9 text-cream-dark-gold" />}
        title="Non hai ancora acquistato nessun corso"
        description="Esplora il catalogo e inizia il tuo primo percorso. Potrai poi contattare direttamente il creator per qualsiasi domanda."
        ctaHref="/dashboard"
        ctaLabel="Esplora i corsi"
      />
    </InboxShell>;
  }

  // ── 2. Conversation limitate ai prodotti acquistati ────────
  // Doppia protezione: `productId IN (...)` (vincolo Fase 3.3) +
  // `OR [{userOneId}, {userTwoId}]` (membership check canonica).
  const conversations = await prisma.conversation.findMany({
    where: {
      productId: { in: purchasedProductIds },
      OR: [{ userOneId: dbUser.id }, { userTwoId: dbUser.id }],
    },
    include: {
      userOne: { select: { id: true, name: true, image: true, role: true } },
      userTwo: { select: { id: true, name: true, image: true, role: true } },
      product: { select: { id: true, slug: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, content: true, createdAt: true, senderId: true, read: true },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  // ── 3. Unread counts in batch ─────────────────────────────
  const conversationIds = conversations.map((c) => c.id);
  const unreadRows =
    conversationIds.length > 0
      ? await prisma.message.groupBy({
          by: ["conversationId"],
          where: {
            conversationId: { in: conversationIds },
            read: false,
            senderId: { not: dbUser.id },
          },
          _count: { id: true },
        })
      : [];

  const unreadMap = new Map<string, number>();
  for (const row of unreadRows) {
    unreadMap.set(row.conversationId, row._count.id);
  }

  // ── 4. Preview list ───────────────────────────────────────
  const previews: ConversationPreview[] = conversations.map((c) => {
    const otherUser = c.userOneId === dbUser.id ? c.userTwo : c.userOne;
    const lastMessage = c.messages[0] ?? null;

    return {
      id: c.id,
      productId: c.productId,
      productLabel: c.product?.slug ?? "Prodotto",
      otherUser,
      lastMessage: lastMessage
        ? {
            id: lastMessage.id,
            content:
              lastMessage.content.length > PREVIEW_MAX
                ? lastMessage.content.slice(0, PREVIEW_MAX) + "…"
                : lastMessage.content,
            createdAt: lastMessage.createdAt.toISOString(),
            senderId: lastMessage.senderId,
            read: lastMessage.read,
          }
        : null,
      unreadCount: unreadMap.get(c.id) ?? 0,
    };
  });

  // ── Early-return empty state: ha acquisti ma nessuna chat ──
  // Non blocchiamo la query delle conversation (potrebbe essere
  // race-condition con rimborsi recenti: meglio una query onesta).
  if (previews.length === 0) {
    return <InboxShell>
      <EmptyState
        icon={<BookOpen className="w-9 h-9 text-cream-dark-gold" />}
        title="Nessuna conversazione attiva"
        description="Hai accesso ai tuoi corsi, ma non hai ancora aperto una chat con i creator. Apri il player del corso per contattare il creator e iniziare una conversazione."
        ctaHref="/dashboard"
        ctaLabel="Vai ai tuoi corsi"
      />
    </InboxShell>;
  }

  // ── 5. Render inbox ───────────────────────────────────────
  return (
    <InboxProvider
      initialTotalUnread={previews.reduce((sum, p) => sum + p.unreadCount, 0)}
      initialByConversation={Object.fromEntries(
        previews.map((p) => [p.id, p.unreadCount]),
      )}
    >
      <InboxShell
        subtitle={`${previews.length} ${previews.length === 1 ? "conversazione" : "conversazioni"} · ${purchasedProductIds.length} ${purchasedProductIds.length === 1 ? "corso" : "corsi"} acquistati`}
      >
        <ConversationList previews={previews} currentUserId={dbUser.id} />
      </InboxShell>
    </InboxProvider>
  );
}

// ─── Empty state sub-component ───────────────────────────────
interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description: string;
  ctaHref: string;
  ctaLabel: string;
}
function EmptyState({ icon, title, description, ctaHref, ctaLabel }: EmptyStateProps) {
  return (
    <div className="relative overflow-hidden bg-gradient-to-br from-cream-dark-bg via-cream-dark-surface to-cream-dark-surface border border-cream-dark-border rounded-[32px] p-12 lg:p-16 text-center shadow-2xl shadow-[#FF8C42]/15">
      <div
        className="absolute -top-20 -right-20 w-[360px] h-[360px] rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, rgba(255, 140, 66, 0.25) 0%, transparent 65%)",
          filter: "blur(80px)",
        }}
        aria-hidden
      />
      <div className="relative max-w-md mx-auto space-y-6">
        <div className="w-20 h-20 rounded-3xl bg-cream-dark-surface border border-cream-dark-border flex items-center justify-center mx-auto shadow-md">
          {icon}
        </div>
        <div className="space-y-2">
          <h3 className="font-serif text-3xl text-cream-dark-text">{title}</h3>
          <p className="text-cream-dark-text-soft text-sm font-light leading-relaxed">
            {description}
          </p>
        </div>
        <Link
          href={ctaHref}
          className="inline-flex items-center gap-2 bg-cream-dark-orange text-white px-6 py-3.5 rounded-xl text-sm font-semibold shadow-lg shadow-[#FF8C42]/20 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300"
        >
          {ctaLabel} <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}

// ─── Shell condiviso (nav + glow overlay) per i due empty-state ──
// e per il render path della inbox (subtitle propzionale). Riduce la
// duplicazione dei 3 render path.
function InboxShell({
  children,
  subtitle,
}: {
  children: ReactNode;
  subtitle?: string;
}) {
  return (
    <div className="min-h-screen bg-cream-dark-bg text-cream-dark-text font-sans antialiased relative overflow-x-hidden">
      {/* Subtle warm glow overlay */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at top, rgba(255, 140, 66, 0.06) 0%, transparent 50%), radial-gradient(ellipse at bottom, rgba(255, 200, 130, 0.04) 0%, transparent 50%)",
        }}
        aria-hidden
      />

      {/* Top Navigation */}
      <nav className="sticky top-0 z-50 bg-cream-dark-bg/80 backdrop-blur-xl border-b border-cream-dark-border">
        <div className="max-w-4xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="p-2.5 bg-cream-dark-surface border border-cream-dark-border rounded-xl text-cream-dark-text-soft hover:text-cream-dark-gold hover:border-cream-dark-gold/30 transition-all"
              aria-label="Torna alla dashboard"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <h1 className="font-serif text-2xl text-cream-dark-text leading-tight">
                Messaggi
              </h1>
              <p className="text-xs text-cream-dark-text-soft font-light">
                {subtitle ?? "Conversazioni con i tuoi creator"}
              </p>
            </div>
          </div>

          <Link href="/dashboard" className="flex items-center gap-3 group">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-lg text-white shadow-sm transition-all group-hover:scale-105"
              style={{ background: "linear-gradient(135deg, #1a1a1a 0%, #444 100%)" }}
            >
              C
            </div>
          </Link>
        </div>
      </nav>

      <main className="relative max-w-4xl mx-auto px-6 py-8 lg:py-10 pb-24">
        {children}
      </main>
    </div>
  );
}
