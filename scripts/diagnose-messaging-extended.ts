/**
 * scripts/diagnose-messaging-extended.ts
 *
 * Phase 2.x regression-guard — STATIC analysis companion to
 * `scripts/diagnose-messaging.ts` (which is DB-only / runtime).
 *
 * Goal: codify every DM + AccessGate audit check we did during the Phase
 * 2.x work as a shell-level static-analysis guard. Future schema
 * migrations or new routes that re-introduce scattered checks will be
 * caught BEFORE review.
 *
 * Two checks (both static, no DB, no HTTP):
 *
 *   CHECK 1 — DM-AUTH wiring.
 *     Every file under `src/app/api/messages/**` or
 *     `src/app/api/conversations/**` (excluding `*.test.ts`) PLUS
 *     `server.ts` (the WS upgrade handler) MUST contain at least one of:
 *       - authorizeDmRequest(...)
 *       - loadAuthorizedConversation(...)
 *       - resolveMessagingPermission(...)
 *     OR be explicitly listed in `ALLOWLIST_DM_AUTH_BYPASS` with a
 *     documented rationale. Today the only BYPASS is the Phase 2.3
 *     DELETE handler (`src/app/api/conversations/[id]/route.ts`) which
 *     deliberately uses a membership-only check so users can clean up
 *     after Order refunds.
 *
 *   CHECK 2 — AccessGate SSOT adherence.
 *     Any file under `src/**` (excluding `*.test.ts`) that contains BOTH:
 *       - a `prisma.order.{findFirst,findUnique,findMany}` call AND
 *       - a literal `status: "completed"` predicate
 *     MUST either:
 *       - delegate through `findCompletedOrder({ userId, productId|productSlug })`,
 *       - or be explicitly listed in `ALLOWLIST_ORDER_STATUS_RAW` with the
 *         documented NON-DM / NON-AccessGate rationale (write-side
 *         webhook → completed, admin listing, search scoring,
 *         products-with-revenue, social-proof testimonials, etc).
 *
 * Output:
 *   - Pretty stdout with sections (matches the existing diagnose-
 *     messaging.ts style for diff-friendliness and human-readability in
 *     CI logs).
 *   - Exit code 0 = clean, 1 = any finding (CI gate-friendly; wire into
 *     PR-checks with `npx tsx scripts/diagnose-messaging-extended.ts`).
 *
 * Conventions matched (decisions per Phase 2.4 design matrix):
 *   - Pure-Node `fs` + regex (NO subprocess, NO ripgrep, NO new deps).
 *   - POSITIVE allowlist (catch-all deny by default).
 *   - Inline constant arrays (single SSOT file, no JSON sidecar).
 *   - Strict mode (no `--baseline-update` for V1; the current state IS
 *     the audit gold-standard the team signed off on).
 *
 * Maintenance rule-of-thumb when adding a new file to the audit scope:
 *   - New DM entry?  Wire `authorizeDmRequest` / `loadAuthorizedConversation`
 *     into the handler. Don't add to ALLOWLIST_DM_AUTH_BYPASS unless
 *     you have a documented reason to bypass auth (like Phase 2.3 DELETE).
 *   - New `prisma.order.{findFirst,findUnique,findMany}` with `status:
 *     "completed"` for USER-DATA rendering?  Migrate to
 *     `findCompletedOrder` (the SSO). Don't add to
 *     ALLOWLIST_ORDER_STATUS_RAW unless you have a documented
 *     different-policy (write-side, admin listing, search scoring).
 *
 * Usage:
 *   npx tsx scripts/diagnose-messaging-extended.ts
 */

import * as fs from "fs";
import * as path from "path";

// ─── Types ──────────────────────────────────────────────────────────

type FindingType = "DM_AUTH_MISSING" | "ORDER_STATUS_RAW";

interface Finding {
  type: FindingType;
  /** POSIX-normalized path relative to project root. */
  file: string;
  /** Human-readable rationale explaining the violation. */
  reason: string;
}

// ─── Allowlists (POSITIVE — anything outside is a violation) ────────

/**
 * Files that DELIBERATELY bypass DM-AUTH wiring, with a documented
 * rationale. Today: only the Phase 2.3 DELETE handler on
 * `/api/conversations/[id]` which uses membership-only check so users
 * can always close their own thread, even after Order refund.
 *
 * Before adding a new entry here, ask:
 *   "Why can't this entry point use `loadAuthorizedConversation` like
 *    all the other DM surfaces?"
 * If your answer is "because we want user-self-cleanup after a state
 * revocation (e.g. refund)", then the entry is justified. Document
 * it in the comment below AND in the route's top-of-file JSDoc.
 */
const ALLOWLIST_DM_AUTH_BYPASS: readonly { file: string; rationale: string }[] = [
  {
    file: "src/app/api/conversations/[id]/route.ts",
    rationale:
      "DELETE handler (Phase 2.3). Hard-deletes Conversation + CASCADE Messages. Uses membership-only check (NOT authorizeDmRequest) so users can self-cleanup after Order refund. Documented in route.ts top-of-file JSDoc.",
  },
];

/**
 * Files that USE raw `prisma.order.{findFirst,findUnique,findMany}` with
 * `status: "completed"` for a NON-DM / NON-AccessGate purpose. Each
 * entry must have a documented rationale.
 *
 * Categories:
 *   (a) SSOT resolver/helper themselves (the implementation).
 *   (b) Write-side: order-service (creates completed Order from webhook).
 *   (c) Refund handlers (update Order.status to refunded): write-side.
 *   (d) Admin listings (debug/admin viewing all order statuses): JSON
 *       in-memory filter on `.filter(o => o.status === "completed")`,
 *       NOT raw prisma order findFirst. The script is liberal: it
 *       accepts these cases even if they look like raw queries because
 *       they're operator-only contexts without a user target.
 *   (e) User's own order history (self-history, no DM-coupling).
 *   (f) Social proof / testimonials (public aggregate).
 *   (g) Creator discovery (search scoring — different policy).
 *
 * Before adding a new entry here, ask:
 *   "Why can't this caller use `findCompletedOrder`?"
 * If your answer is "different policy domain" (write/admin/social-proof/
 * search-scoring), the entry is justified.
 */
const ALLOWLIST_ORDER_STATUS_RAW: readonly { file: string; rationale: string }[] = [
  // ── (a) SSOT resolver/helper implementations themselves ──
  { file: "src/lib/messaging/api-authorize.ts", rationale: "DM-AUTH SSOT wrapper (the implementation)." },
  { file: "src/lib/messaging/resolve-message-permission.ts", rationale: "DM-AUTH SSOT resolver (the implementation)." },
  { file: "src/lib/messaging/load-authorized-conversation.ts", rationale: "DM-AUTH convId-keyed variant (the implementation)." },
  { file: "src/lib/messaging/create-message.ts", rationale: "DM message composer (calls WS broker; doesn't query Order directly)." },
  { file: "src/lib/messaging/find-or-create-conversation.ts", rationale: "DM Conversation upsert (doesn't query Order)." },
  { file: "src/lib/access/find-completed-order.ts", rationale: "AccessGate SSOT helper for userId-keyed access (the implementation)." },
  { file: "src/lib/access/find-completed-order-by-order-id.ts", rationale: "AccessGate SSOT SIBLING helper for orderId-keyed (guest) access — V3.1 follow-up (the implementation)." },

  // ── (b) Write-side: order creation from payment provider ──
  { file: "src/lib/services/order-service.ts", rationale: "WRITES Order.status='completed' from Stripe/LemonSqueezy webhook payload (write-side; opposite direction of the SSOT reader)." },

  // ── (c) Refund handlers (write-side) ──
  { file: "src/app/api/webhooks/stripe/route.ts", rationale: "Stripe webhook — DOWNgrades an Order to refunded (write-side, payment-provider state machine)." },
  { file: "src/app/api/webhooks/lemonsqueezy/route.ts", rationale: "LemonSqueezy webhook — DOWNgrades an Order to refunded (write-side, payment-provider state machine)." },

  // ── (d) Admin operator listings ──
  { file: "src/app/api/admin/orders/route.ts", rationale: "Admin listing (operator-only). Uses in-memory JSON filter not raw prisma.findFirst." },
  { file: "src/app/api/admin/users/route.ts", rationale: "Admin listing (operator-only). Uses in-memory JSON filter not raw prisma.findFirst." },
  { file: "src/app/api/products/route.ts", rationale: "Admin products listing (operator-only). Per-product order count, exposes revenue/conversion metrics." },

  // ── (e) User's own order history ──
  { file: "src/app/api/user/orders/route.ts", rationale: "Self-history: returns the user's own completed Orders; no DM/AccessGate policy involved." },

  // ── (f) Social proof / testimonials ──
  { file: "src/app/api/social-proof/route.ts", rationale: "Social-proof testimonials: aggregates public Order data; no per-user access policy." },

  // ── (g) Creator discovery (search scoring — different policy) ──
  { file: "src/app/api/users/search-creators/route.ts", rationale: "Creator discovery: lists creators with ≥1 completed order; different policy (search scoring), not DM-access." },
  { file: "src/app/api/users/search-customers/route.ts", rationale: "Customer search: lists students of given creator's products; different policy (search scoring), not DM-access." },
  { file: "src/app/api/users/[username]/route.ts", rationale: "Public creator profile: lists creator's products-with-revenue; different policy (public profile), not DM-access." },
];

// ─── Path utilities ─────────────────────────────────────────────────

/**
 * Resolve the project root from a script invocation. `<repo>/scripts/<x>.ts`
 * walks up one directory. Robust to `process.cwd()` divergence (e.g.
 * CI runs the script from a different directory than the repo root).
 */
function projectRoot(): string {
  // `__dirname` is the directory of the current module. For
  // `scripts/diagnose-messaging-extended.ts`, that's `<repo>/scripts/`.
  return path.resolve(__dirname, "..");
}

/**
 * Normalize a project-relative path to POSIX style — every comparison
 * against the allowlists uses forward slashes so `[id]` literal path
 * segments match cleanly on both Linux/macOS and Windows.
 */
function toPosix(p: string): string {
  return p.split(path.sep).join("/");
}

/**
 * Recursive `*.ts` file collector. Excludes `.test.ts` (mock-friendly
 * literals here would drown the script in false positives) and the
 * usual noise directories (`node_modules`, `.next`, etc).
 */
function collectTsFiles(
  dir: string,
  opts: { includeTests?: boolean; skipDirs?: readonly string[] } = {},
): string[] {
  const skipDirs = new Set<string>(["node_modules", ".next", ".git", "dist", "build"]);
  (opts.skipDirs ?? []).forEach((s) => skipDirs.add(s));

  const out: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out; // missing dir (e.g. in a stripped CI image) → empty
  }

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (skipDirs.has(entry.name)) continue;
      out.push(...collectTsFiles(full, opts));
    } else if (
      entry.isFile() &&
      entry.name.endsWith(".ts") &&
      (opts.includeTests || !entry.name.endsWith(".test.ts"))
    ) {
      out.push(full);
    }
  }
  return out;
}

// ─── CHECK 1 — DM-AUTH wiring ───────────────────────────────────────

/**
 * Returns true if the file CONTENT contains at least one of the SSOT
 * resolver symbols. We use simple substring matches because:
 *   - The project TS source compiles to ES2022+, so any of these
 *     strings MUST appear at least once per DM entry point if wired
 *     (typed imports + function calls).
 *   - False-positive surface (e.g. a JSDoc mention) is irrelevant for
 *     a static check — the alternative would be a full AST parse,
 *     which adds deps + brittleness for marginal benefit at <50 files.
 */
const DM_AUTH_SYMBOLS = ["authorizeDmRequest", "loadAuthorizedConversation", "resolveMessagingPermission"];

function hasDmAuthWiring(filePath: string): boolean {
  let content: string;
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch {
    return false;
  }
  return DM_AUTH_SYMBOLS.some((sym) => content.includes(sym));
}

function check1DmAuth(): Finding[] {
  const root = projectRoot();
  const messagesRoot = path.join(root, "src/app/api/messages");
  const conversationsRoot = path.join(root, "src/app/api/conversations");
  const serverFile = path.join(root, "server.ts");

  const candidates: string[] = [];
  if (fs.existsSync(messagesRoot)) candidates.push(...collectTsFiles(messagesRoot));
  if (fs.existsSync(conversationsRoot)) candidates.push(...collectTsFiles(conversationsRoot));
  if (fs.existsSync(serverFile)) candidates.push(serverFile);

  const bypassSet = new Set(ALLOWLIST_DM_AUTH_BYPASS.map((a) => a.file));

  const findings: Finding[] = [];
  for (const file of candidates) {
    const rel = toPosix(path.relative(root, file));
    if (bypassSet.has(rel)) continue; // explicitly allowed
    if (hasDmAuthWiring(file)) continue;

    findings.push({
      type: "DM_AUTH_MISSING",
      file: rel,
      reason:
        "DM entry point is not wired to authorizeDmRequest / " +
        "loadAuthorizedConversation / resolveMessagingPermission. Either " +
        "wire to the SSOT resolver (preferred) or add to " +
        "ALLOWLIST_DM_AUTH_BYPASS with a documented rationale (current " +
        "sole entry: Phase 2.3 DELETE, membership-only self-cleanup).",
    });
  }
  return findings;
}

// ─── CHECK 2 — AccessGate SSOT adherence ─────────────────────────────

const RE_PRISMA_ORDER_QUERY = /prisma\.order\.(findFirst|findUnique|findMany)\b/;
const RE_STATUS_COMPLETED = /\bstatus:\s*["']completed["']/;

function check2OrderStatusRaw(): Finding[] {
  const root = projectRoot();
  const candidates = collectTsFiles(path.join(root, "src"), { includeTests: false });
  const allowSet = new Set(ALLOWLIST_ORDER_STATUS_RAW.map((a) => a.file));

  const findings: Finding[] = [];
  for (const file of candidates) {
    const rel = toPosix(path.relative(root, file));
    if (allowSet.has(rel)) continue; // explicitly allowed

    let content: string;
    try {
      content = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    if (!(RE_PRISMA_ORDER_QUERY.test(content) && RE_STATUS_COMPLETED.test(content))) continue;

    findings.push({
      type: "ORDER_STATUS_RAW",
      file: rel,
      reason:
        "Raw 'prisma.order.{findFirst,findUnique,findMany}' call with " +
        "literal `status: \"completed\"` predicate, OUTSIDE the DM/AccessGate " +
        "SSOT path. Migrate to `findCompletedOrder({ userId, productId|" +
        "productSlug })` (preferred) or add to " +
        "ALLOWLIST_ORDER_STATUS_RAW with a documented different-policy " +
        "rationale (write-side, admin listing, search scoring, etc).",
    });
  }
  return findings;
}

// ─── Main ───────────────────────────────────────────────────────────

function main(): void {
  console.log(
    "\n==== Messaging-Extended Static Diagnostic (Phase 2.x regression-guard) ====\n",
  );
  console.log(
    "Static checks (no DB I/O): DM-AUTH wiring + Order.findFirst status='completed' SSOT.\n",
  );

  // Run both checks; collect all findings before printing — partial-fail
  // reporting is more useful in CI logs than short-circuit-on-first.
  const findings: Finding[] = [];
  try {
    findings.push(...check1DmAuth());
    findings.push(...check2OrderStatusRaw());
  } catch (err) {
    console.error("\n❌ Diagnostic threw an internal error:", err);
    process.exit(2); // distinct from "1 = findings"
  }

  if (findings.length === 0) {
    console.log("✅ CHECK 1 (DM-AUTH wiring): every DM entry point under");
    console.log("   src/app/api/{messages,conversations}/** (plus server.ts)");
    console.log("   is wired to authorizeDmRequest / loadAuthorizedConversation /");
    console.log("   resolveMessagingPermission (or is explicitly bypass-allowed).");
    console.log("");
    console.log("✅ CHECK 2 (Order.status='completed' SSOT): every caller is");
    console.log("   either routed through findCompletedOrder or explicitly");
    console.log("   allow-listed with a different-policy rationale.\n");
    console.log("==== Diagnostic complete — clean. ====\n");
    process.exit(0);
  }

  // Group findings by type for diff-friendly output.
  const grouped = new Map<FindingType, Finding[]>();
  for (const f of findings) {
    const arr = grouped.get(f.type) ?? [];
    arr.push(f);
    grouped.set(f.type, arr);
  }

  for (const [type, list] of grouped.entries()) {
    console.log(`❌ ${type}: ${list.length} finding(s)\n`);
    for (const f of list) {
      console.log(`   • ${f.file}`);
      console.log(`     ${f.reason}`);
      console.log("");
    }
  }

  console.log("──────────────────────────────────────────────────────────────────");
  console.log(`Total: ${findings.length} finding(s) across ${grouped.size} check(s).`);
  console.log("Fix: wire missing DM-AUTH paths to the SSOT resolver (preferred) OR");
  console.log("     add explicit allowance with documented rationale (NOT a default).");
  console.log("──────────────────────────────────────────────────────────────────\n");
  process.exit(1);
}

main();
