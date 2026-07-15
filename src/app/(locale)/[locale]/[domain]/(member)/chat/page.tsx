import { headers } from "next/headers";
import { notFound } from "next/navigation";
import Image from "next/image";
import { MessageSquare, Sparkles } from "lucide-react";

export const dynamic = "force-dynamic";
import type { Metadata } from "next";
import { getCourseConfig } from "@/lib/config/white-label-data";
import { getServerUser } from "@/lib/supabase/get-user";
import { loadLocaleContentCached } from "@/lib/i18n/load-locale-content";
import { getDmContext } from "@/lib/messaging/get-dm-context";
import { findOrCreateConversation } from "@/lib/messaging/find-or-create-conversation";
import { ChatView } from "@/components/chat/chat-view";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; domain: string }>;
}): Promise<Metadata> {
  const { locale, domain } = await params;
  let host = "www.courssy.com";
  try {
    const h = await headers();
    host = h.get("host") ?? host;
  } catch {}
  const scheme = process.env.NODE_ENV === "development" ? "http" : "https";
  const baseUrl = `${scheme}://${host}`;
  return {
    title: `Chat con il Creator — ${domain}`,
    alternates: { canonical: `${baseUrl}/${locale}/${domain}/chat` },
  };
}

/**
 * Chat con il Creator (full-page) — the third Skool-style tab.
 *
 * Mounts <ChatView> in the main column. Conversation is auto-upserted
 * server-side via findOrCreateConversation (race-safe, see helper docstring).
 *
 * Edge cases:
 *  - Admin viewing their own course → fallback hint.
 *  - No creator / product resolved → fallback hint.
 *  - DB / network failure on findOrCreate → fallback hint.
 */
export default async function CourseChatTab({
  params,
}: {
  params: Promise<{ locale: string; domain: string }>;
}) {
  const { locale, domain } = await params;

  const course = await getCourseConfig(domain);
  if (!course) return notFound();

  const { dbUser } = await getServerUser();
  const isAuthenticated = !!dbUser;
  const isAdminViewer = dbUser?.role === "admin";
  const lang2 = locale.split("-")[0]?.toLowerCase() ?? "en";
  const content =
    course.languages[locale] ?? course.languages[lang2] ?? course.languages[course.defaultLanguage];
  if (!content) return notFound();

  const lc = (await loadLocaleContentCached(domain, lang2)).portal;

  const t = {
    title: lc.chat_title || (lang2 === "it" ? "Chat con il Creator" : "Chat with the Creator"),
    subtitle:
      lc.tab_chat_subtitle ||
      (lang2 === "it"
        ? "Scrivici per qualsiasi domanda sul percorso."
        : "Message us with any question on your journey."),
    online: (lang2 === "it" ? "Online" : "Online"),
    connecting:
      lc.tab_chat_connecting || (lang2 === "it" ? "Connessione…" : "Connecting…"),
    hintAdmin:
      lc.chat_offline_self ||
      (lang2 === "it"
        ? "Sei il creator di questo corso — la chat è riservata ai tuoi studenti."
        : "You are the creator of this course — chat is reserved for your students."),
    hintCreatorMissing:
      lc.chat_offline_creator ||
      (lang2 === "it"
        ? "Il creator non è ancora disponibile qui. Apri la chat dal bottone nella pagina."
        : "The creator is not available here yet. Open chat from the page button."),
    hintLogin:
      lang2 === "it"
        ? "Accedi per chattare con il creator."
        : "Sign in to chat with the creator.",
    emptyHint:
      lc.chat_empty_hint ||
      (lang2 === "it"
        ? "Nessun messaggio ancora. Inizia la conversazione!"
        : "No messages yet. Start the conversation!"),
  };

  // Resolve creator (admin) + product (single source of truth)
  const { creator, product } = await getDmContext(
    domain,
    isAuthenticated && !isAdminViewer,
  );

  let conversationId: string | null = null;
  if (creator && product && !isAdminViewer && dbUser) {
    try {
      const conv = await findOrCreateConversation(
        dbUser.id,
        creator.id,
        product.id,
      );
      conversationId = conv.id;
    } catch (err) {
      console.warn("[chat tab] findOrCreateConversation failed:", err);
      conversationId = null;
    }
  }

  const accent = course.accentColor ?? "#C9840D";

  return (
    <div className="space-y-6">
      {/* Heading */}
      <header className="space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-cream-dark-gold/15 border border-cream-dark-gold/30 text-cream-dark-gold text-[10px] font-black uppercase tracking-widest">
          <MessageSquare className="w-3 h-3" />
          {t.online}
        </div>
        <h1 className="font-serif text-3xl md:text-4xl text-cream-dark-text leading-tight tracking-tight">
          {creator?.name ? `Chat con ${creator.name}` : t.title}
        </h1>
        <p className="text-cream-dark-text-soft font-light leading-relaxed max-w-2xl">
          {t.subtitle}
        </p>
      </header>

      {/* Chat panel */}
      <div className="bg-cream-dark-surface border border-cream-dark-border rounded-2xl shadow-2xl shadow-black/30 overflow-hidden flex flex-col h-[600px] lg:h-[calc(100vh-12rem)] min-h-[480px]">
        {/* Sub-header inside the chat panel — creator identity */}
        {conversationId && creator && (
          <div className="px-5 py-3.5 border-b border-cream-dark-border flex items-center gap-3 shrink-0 bg-cream-dark-bg/40">
            <div className="relative shrink-0">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#FFF5E6] to-[#FFE4C4] flex items-center justify-center overflow-hidden border border-cream-dark-border">
                {creator.image ? (
                  <Image
                    src={creator.image}
                    alt=""
                    width={40}
                    height={40}
                    className="w-full h-full object-cover"
                    unoptimized
                  />
                ) : (
                  <span className="font-bold text-cream-dark-gold text-sm">
                    {(creator.name ?? "C")[0]?.toUpperCase()}
                  </span>
                )}
              </div>
              <span
                className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-cream-dark-surface"
                aria-hidden
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-cream-dark-text truncate">
                {creator.name ?? "Creator"}
              </p>
              <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider mt-0.5">
                {t.online}
              </p>
            </div>
          </div>
        )}

        <div className="flex-1 min-h-0">
          {conversationId && creator && dbUser && product ? (
            <ChatView
              conversationId={conversationId}
              productId={product.id}
              currentUserId={dbUser.id}
              currentUserName={dbUser.name ?? dbUser.email ?? "Studente"}
              otherUser={{
                id: creator.id,
                name: creator.name,
                image: creator.image,
                role: creator.role,
              }}
            />
          ) : isAdminViewer ? (
            <ChatOfflineHint message={t.hintAdmin} />
          ) : !isAuthenticated ? (
            <ChatOfflineHint message={t.hintLogin} />
          ) : (
            <ChatOfflineHint message={t.hintCreatorMissing} />
          )}
        </div>
      </div>

      {/* Quick-help CTA row */}
      <div className="bg-cream-dark-surface border border-cream-dark-border rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4 shadow-md shadow-black/20">
        <div
          className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: `${accent}15`, border: `1px solid ${accent}25` }}
        >
          <Sparkles className="w-4 h-4" style={{ color: accent }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-cream-dark-text">
            {lang2 === "it" ? "Hai una domanda specifica?" : "Have a specific question?"}
          </p>
          <p className="text-xs text-cream-dark-text-soft font-light mt-1">
            {lang2 === "it"
              ? "Scrivici nel box qui sopra — rispondiamo entro 24h."
              : "Write in the box above — we reply within 24h."}
          </p>
        </div>
        {/* (2026-07-15) Removed "Info corso" / "Course info" button per
            production feedback. The /about page is still accessible via
            direct URL; the funnel page CTA is the primary entry point. */}
      </div>
    </div>
  );
}

/**
 * Local empty-state hint when ChatView cannot mount
 * (admin viewer, unauthenticated, or conversation creation failed).
 */
function ChatOfflineHint({ message }: { message: string }) {
  return (
    <div className="flex-1 flex items-center justify-center px-6 py-12 text-center">
      <div className="space-y-3 max-w-[420px]">
        <div className="w-14 h-14 rounded-full bg-cream-dark-bg border border-cream-dark-border mx-auto flex items-center justify-center">
          <MessageSquare className="w-6 h-6 text-cream-dark-text-soft/40" />
        </div>
        <p className="text-sm text-cream-dark-text-soft font-light leading-relaxed">
          {message}
        </p>
      </div>
    </div>
  );
}
