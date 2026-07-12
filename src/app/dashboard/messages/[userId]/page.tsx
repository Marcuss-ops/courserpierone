import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/db/prisma";
import { getServerUser } from "@/lib/supabase/get-user";
import { ChatView } from "@/components/chat/chat-view";

/**
 * Forza dynamic rendering sulla chat deep-link.
 *
 * Stessa motivazione di `/dashboard/messages/page.tsx` (vedi Fase 3.3):
 * la pagina legge cookies via `getServerUser` ed esegue query Prisma
 * in tempo reale. `force-dynamic` garantisce che un cambio di stato
 * `Order.status: completed → refunded` abbia effetto immediato sul
 * prossimo page-load (vedi read-side guard sopra) senza cache
 * Vercel stale.
 */
export const dynamic = "force-dynamic";

interface ChatPageProps {
  params: Promise<{ userId: string }>;
  /**
   * Fase 3.1: lessonId opzionale per passare il contesto lezione a
   * ChatView (mostra banner "Contesto: Lezione XYZ"). Originato dal
   * bottone ContactCreatorButton nelle pagine lezione (/curso/[lessonId]).
   */
  searchParams: Promise<{ productId?: string; lessonId?: string }>;
}

export default async function ConversationPage({ params, searchParams }: ChatPageProps) {
  const { userId } = await params;
  const { productId, lessonId } = await searchParams;
  const { user, dbUser } = await getServerUser();

  if (!user?.email || !dbUser) {
    redirect("/login");
  }

  // Phase 1.3: productId è obbligatorio per qualunque DM.
  // Se manca, redirigiamo alla inbox generale che mostra i prodotti acquistati.
  if (!productId) {
    redirect("/dashboard/messages");
  }

  // ── Fase 3.3 read-side guard ───────────────────────────────
  // Difesa da URL-bypass: la sola inbox-list filtra i `productId`
  // acquistati, ma uno studente potrebbe digitare direttamente
  // /dashboard/messages/<creatorId>?productId=<mAIAcquistato>.
  // Verifichiamo che:
  //   (a) il prodotto esista ed abbia un `creatorId` valido pari a `userId`;
  //   (b) lo studente corrente abbia un Order.completed per quel product.
  // In assenza di (a) O (b) → redirect all'inbox (l'empty state
  // differenziato si occuperà del resto della UX).
  //
  // [C2 micro-win] Product.findUnique è sequenziale (il check su
  // creatorId dipende da questa query); Order.findFirst e
  // User.findUnique sono invece indipendenti e le eseguiamo in
  // parallelo via Promise.all per risparmiare ~10-20ms di round-trip.
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, slug: true, creatorId: true },
  });
  const isLegitimateCreator = product?.creatorId === userId;
  if (!product || !isLegitimateCreator) {
    redirect("/dashboard/messages");
  }

  const [hasCompletedOrder, otherUser] = await Promise.all([
    prisma.order.findFirst({
      where: { userId: dbUser.id, productId, status: "completed" },
      select: { id: true },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, image: true, role: true },
    }),
  ]);
  if (!hasCompletedOrder || !otherUser) {
    redirect("/dashboard/messages");
  }

  if (!otherUser) {
    return (
      <div className="min-h-screen bg-cream-dark-bg flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-cream-dark-text-soft text-lg">Utente non trovato</p>
          <Link
            href="/dashboard/messages"
            className="inline-flex items-center gap-2 text-sm text-cream-dark-gold hover:underline"
          >
            <ArrowLeft className="w-4 h-4" /> Torna ai messaggi
          </Link>
        </div>
      </div>
    );
  }

  // Verify a conversation exists between the two users for this product
  // (or it will be lazily created by chat-view on the first message).
  const [minId, maxId] = [dbUser.id, otherUser.id].sort();
  const conversation = await prisma.conversation.findUnique({
    where: {
      userOneId_userTwoId_productId: {
        userOneId: minId,
        userTwoId: maxId,
        productId,
      },
    },
    select: { id: true, productId: true },
  });

  // Fetch del prodotto per l'header (titolo visibile nella chat) — già
  // recuperato sopra nel read-side guard; riusa l'oggetto esistente.
  const chatProduct = product;

  return (
    <div className="min-h-screen bg-cream-dark-bg text-cream-dark-text font-sans antialiased flex flex-col">
      {/* Subtle glow */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at top, rgba(255, 140, 66, 0.06) 0%, transparent 50%), radial-gradient(ellipse at bottom, rgba(255, 200, 130, 0.04) 0%, transparent 50%)",
        }}
        aria-hidden
      />

      {/* Header */}
      <header className="sticky top-0 z-50 bg-cream-dark-bg/80 backdrop-blur-xl border-b border-cream-dark-border shrink-0">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-3">
          <Link
            href="/dashboard/messages"
            className="p-2 bg-cream-dark-surface border border-cream-dark-border rounded-xl text-cream-dark-text-soft hover:text-cream-dark-gold hover:border-cream-dark-gold/30 transition-all shrink-0"
            aria-label="Torna ai messaggi"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#FFF5E6] to-[#FFE4C4] flex items-center justify-center overflow-hidden shrink-0 shadow-sm ring-1 ring-cream-dark-border">
              {otherUser.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={otherUser.image}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-cream-gold text-sm font-bold">
                  {(otherUser.name || "U")[0].toUpperCase()}
                </span>
              )}
            </div>
            <div className="min-w-0">
              <h2 className="font-semibold text-sm text-cream-dark-text truncate">
                {otherUser.name || "Utente"}
              </h2>
              <p className="text-[10px] text-cream-dark-text-soft truncate">
                {otherUser.role === "admin"
                  ? "Creator"
                  : otherUser.role === "creator"
                    ? "Creator"
                    : "Studente"}
                {chatProduct?.slug ? ` • ${chatProduct.slug}` : ""}
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Chat area */}
      <ChatView
        conversationId={conversation?.id ?? null}
        productId={productId}
        currentUserId={dbUser.id}
        currentUserName={dbUser.name || dbUser.email?.split("@")[0] || "Tu"}
        otherUser={otherUser}
        lessonId={lessonId}
      />
    </div>
  );
}
