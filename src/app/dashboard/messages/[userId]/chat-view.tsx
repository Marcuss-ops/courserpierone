// Backward-compatible re-export shim (Fase 3.2 refactor).
//
// Questo file NON è più la definizione canonica del componente.
// La location condivisa è `src/components/chat/chat-view.tsx`,
// riusata sia da `/dashboard/messages/[userId]/page.tsx` (studenti)
// sia da `/dashboard/creator/messages/page.tsx` (creator).
//
// Vantaggi del refactor:
// - Niente cross-route imports (importare da `[userId]` era una code
//   smell che avrebbe rotto al primo reorganization del segmento).
// - Una sola location per la logica di rendering/mark-as-read/
//   typing indicator: bug-fix e feature si propagano automaticamente.

export { ChatView } from "@/components/chat/chat-view";
