/**
 * src/lib/access/index.ts
 *
 * V3.2 follow-up — Barrel export per il namespace `src/lib/access/`.
 * Re-exporta gli SSO helpers AccessGate-side e le loro Input/Result
 * types per discoverability (nuovi import path: `@/lib/access` invece
 * del direct submodule path).
 *
 * Helpers esposti:
 *   - `findCompletedOrder`       — user-keyed SSO (Pattern A).
 *   - `findCompletedOrderByOrderId` — orderId-keyed SSO sibling (Pattern B).
 *
 * Types esposti:
 *   - `FindCompletedOrderInput` / `FindCompletedOrderByOrderIdInput`
 *     — funzione signature args (per annotare variabili locali).
 *   - `FindCompletedOrderResult` / `FindCompletedOrderByOrderIdResult`
 *     — return type blessed alias `Order | null`. Difesa contro future
 *     refactors che cambiano il return type (es. `Order | undefined`)
 *     silenziosamente: consumer che importano il named type alias dal
 *     barrel ottengono un type-check compile-time.
 *
 * Convenzioni:
 *   - Re-export piatto (no namespace): `import { findCompletedOrder }
 *     from "@/lib/access"` (TS-flat convention usata anche da `@/lib/
 *     messaging/api-authorize`, `@/lib/messaging/get-partner-id`, ecc.).
 *   - Re-export anche le Input types come `type`, così i consumer
 *     possono annotare variabili locali di tipo helper signature.
 *   - Re-export esplicito delle Result type aliases via blessed names
 *     (vedi sopra).
 *   - NO default export: TS preferisce esplicito named re-export per
 *     barrel SSOT.
 *
 * Migration policy (ADDITIVE — deliberate lighter scope):
 *   Le 6 routes esistenti (`access`, `certificate/[productId]`,
 *   `ebook/[slug]/download`, `videos/stream`, `progress`) continuano
 *   a importare dai direct paths (`@/lib/access/find-completed-order`,
 *   `@/lib/access/find-completed-order-by-order-id`) perché FUNZIONANO.
 *   Refactorare questi 6+ call-site in questo PR sarebbe scope-creep
 *   (nessun behavior change, solo churn di import). Il barrel è
 *   canonico per FUTURE writes — V4+ nuovi AccessGate routes useranno
 *   `import { ... } from "@/lib/access"` come standard convention.
 *
 *   Deprecation dei direct paths: TBD in V4+. Se V4+ decidiamo di
 *   adottare il barrel come standard unico, refactorare i 6+ consumer
 *   in un singolo PR con automazione (codemod / `replace-string`
 *   mass). Per V3.2 il barrel coesiste con i direct paths — entrambi
 *   validi.
 *
 * Discoverability vs drift defense:
 *   - `npm run check:messaging` (regression-guard) NON è impattato:
 *     questo file è listato in `collectTsFiles(path.join(root, "src"))`
 *     ma il content NON contiene né `prisma.order.{findFirst,findUnique,findMany}`
 *     né `status: "completed"` (è solo re-export). Quindi NON trigger
 *     CHECK 2 senza allowlist entry — niente aggiornamenti al allowlist.
 *   - Per il future-proofing, la regression-guard allowlist continua
 *     a puntare ai SUBMODULE file (helpers themselves), NON al barrel.
 *     Il barrel è uno "structural convenience" che non cambia la
 *     policy surface.
 *   - Smoke test associato: `src/lib/access/index.test.ts` verifica
 *     a runtime che i symbol exports dal barrel siano ancora presenti
 *     (catch di un rename/delete silenzioso che i test dei direct-path
 *     consumers non catturerebbero perché importano via submodule).
 *
 * Nota su `src/lib/messaging/index.ts` (citato come "parallel pattern"):
 *   Al momento del V3.2 ship, il barrel messaging NON ESISTE ancora.
 *   I 14 consumer di `@/lib/messaging/*` importano dai direct submodule
 *   paths (`api-authorize`, `get-partner-id`, `load-authorized-
 *   conversation`, `find-or-create-conversation`, `create-message`,
 *   `get-dm-context`, ecc.) — analogamente alle 6 routes AccessGate-
 *   side oggi. Una V3.x follow-up potrebbe aggiungere il parallel
 *   `src/lib/messaging/index.ts` barrel per consistency; FUORI SCOPE
 *   per questo PR (lightweight V3.2 scope, vedi suggest_followups).
 */

import type { Order } from "@prisma/client";

export {
  findCompletedOrder,
  type FindCompletedOrderInput,
} from "./find-completed-order";

export {
  findCompletedOrderByOrderId,
  type FindCompletedOrderByOrderIdInput,
} from "./find-completed-order-by-order-id";

/**
 * Blessed Result type aliases — `Order | null` esplicito, NON inferito.
 * Consumer che dichiarano `const order: FindCompletedOrderResult = await
 * findCompletedOrder(...)` ottengono compile-time protection contro
 * future refactors che cambiano il return type (es. `null → undefined`).
 */
export type FindCompletedOrderResult = Order | null;
export type FindCompletedOrderByOrderIdResult = Order | null;
