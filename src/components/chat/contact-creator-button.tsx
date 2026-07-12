import Link from "next/link";
import { MessageSquare } from "lucide-react";

/**
 * Fase 3.1 del piano DMs — bottone "Contatta il creator".
 *
 * Sostituisce (e uniforma) la UX di contatto creator in tutte le pagine
 * "post-purchase experience":
 *   - /portal (course dashboard) — sostituisce il `ChatModal` inline.
 *   - /curso/[lessonId] (lesson page) — accanto a LessonAssets/LessonProgressButton.
 *
 * Differenze rispetto a MessageProfileButton (src/app/u/[username]/message-button.tsx):
 *   - Passa SEMPRE `productId` (Phase 1.3 single source of truth) — la
 *     chat URL `/dashboard/messages/[userId]?productId=...` è obbligatoria
 *     per la Fase 3.3 read-side guard.
 *   - lessonId opzionale (Fase 3.1) — quando il bottone è cliccato da
 *     una pagina lezione, la URL preserva il contesto. La chat page
 *     mostra un banner "Contesto: lezione XYZ" sopra i messaggi
 *     (V1: solo display, no auto-prefix nel content).
 *   - target="_blank" opzionale: di default `false` perché in una SPA
 *     è più UX-friendly restare nella stessa tab. Il caller può
 *     opt-in settando `openInNewTab={true}` (es. embedded scenario).
 *
 * RSC-friendly: è un puro Link, no state, no effects. Non serve
 * "use client" — viene renderizzato server-side e idratato come
 * un normale anchor `<a>`.
 *
 * Visibility rules:
 *   - Hidden if `creatorId === userId` (l'admin/creator non può auto-DM).
 *   - Hidden if `productId` mancante (nessuna destinazione valida).
 */
export interface ContactCreatorButtonProps {
  /** ID del creator a cui scrivere (param `[userId]` URL). */
  creatorId: string;
  /** ID del product (obbligatorio per Fase 3.3 read-side guard). */
  productId: string;
  /** ID utente corrente — usato per hide-on-self (Q5/Q8 architecture). */
  currentUserId: string;
  /** Label opzionale (default localizzato da caller via useChatT). */
  label?: string;
  /** Icona visible (default true). Disabilitare se il caller vuole un button compatto. */
  showIcon?: boolean;
  /** Apri in nuova tab (default false). */
  openInNewTab?: boolean;
  /** Classi addizionali tailwind (es. variant styles). */
  className?: string;
  /** lessonId opzionale (Fase 3.1 contesto). */
  lessonId?: string;
}

export function ContactCreatorButton({
  creatorId,
  productId,
  currentUserId,
  label,
  showIcon = true,
  openInNewTab = false,
  className,
  lessonId,
}: ContactCreatorButtonProps) {
  // ── Visibility: hide if self-creator OR missing params ──────────────
  if (
    !creatorId ||
    !productId ||
    creatorId === currentUserId
  ) {
    return null;
  }

  // ── URL construction (single source of truth) ───────────────────────
  // `/dashboard/messages/{creatorId}?productId={productId}[&lessonId={lessonId}]`
  // Fase 3.3: la route applica read-side guard (productId match + completed
  // order). Se l'utente non ha accesso, redirect → empty state.
  const params = new URLSearchParams();
  params.set("productId", productId);
  if (lessonId) {
    params.set("lessonId", lessonId);
  }
  const href = `/dashboard/messages/${creatorId}?${params.toString()}`;

  // ── Default class (cream-dark OR portal-light depending on caller `className`) ────
  // Default = portal/lesson page stile (white-on-light card). Caller può
  // sovrascrivere tramite `className` per il caso cream-dark dashboard.
  const finalClassName =
    className ??
    "inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-white border border-zinc-200 text-sm font-bold text-zinc-700 hover:bg-zinc-50 hover:border-amber-300 hover:text-amber-700 transition-all shadow-sm";

  return (
    <Link
      href={href}
      target={openInNewTab ? "_blank" : undefined}
      rel={openInNewTab ? "noopener noreferrer" : undefined}
      className={finalClassName}
    >
      {showIcon && <MessageSquare className="w-4 h-4" />}
      <span>{label ?? "Contatta il creator"}</span>
    </Link>
  );
}
