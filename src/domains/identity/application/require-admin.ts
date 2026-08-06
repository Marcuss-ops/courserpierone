import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/get-user";
import { evaluateAccess } from "../domain/access-policies";

/**
 * Require an authenticated admin user.
 * Returns a NextResponse with 401/403 if not authorized, otherwise null.
 *
 * Step 8 — wraps the AccessPolicy discriminated-union evaluator. The
 * public signature (`Promise<NextResponse | null>`) and the 401-vs-403
 * boundary semantics are preserved bit-for-bit so the 9 importer
 * invocations across 6 distinct route files
 * (`api/{translate, config, upload, products, products/[id],
 * products/[id]/duplicate}`) keep working unchanged. See
 * `docs/production-hardening.md` for the spec.
 *
 * 401 / 403 boundary (preserved from pre-Step-8):
 *   - `!user?.email || !dbUser`        → 401 Unauthorized
 *       "no Supabase session OR no Prisma user record" (e.g., webhook
 *       sync race). Handled as a pre-check OUTSIDE the policy chain
 *       because the AccessPolicy union's `session_required` only checks
 *       cookie presence (Edge-portable); the user-record-synced check
 *       is Node-only and fits cleanly as a 1-line UX boundary gate.
 *   - `dbUser && userRole !== "admin"` → 403 Forbidden
 *       "authenticated but not admin". Routed via the `admin_role`
 *       policy + `default_deny` fallback.
 *   - `dbUser && userRole === "admin"` → null (allow).
 *
 * Why the pre-check is OUTSIDE the chain, not a 6th policy variant:
 *   - Adding a `db_user_synced` policy would expand the union's surface
 *     for a single-implementation case. The 6 importers don't need a
 *     granular verdict (they just pass `if (response) return response`)
 *     — the 401 boundary is consolidated here, one place.
 *   - `docs/production-hardening.md` L11-24 documents this as the
 *     canonical admin-gating contract; a future PR that moves the
 *     boundary into a policy must keep the 401/403 split intact
 *     (tests assert `=== 401` and `=== 403` explicitly).
 *
 * The previous inlined `isAdmin(role: "admin")` helper is removed —
 * the `admin_role` policy checks `ctx.userRole === "admin"` directly.
 */
export async function requireAdmin(): Promise<NextResponse | null> {
  const { user, dbUser } = await getServerUser();

  // ── Pre-check (Step 8 BLOCKING fix): 401 boundary for "session
  //    present but DB user record missing" (e.g., Supabase signup
  //    webhook race — dbUser.upsert hasn't run yet). Pre-Step-8
  //    code did `if (!user?.email || !dbUser) return 401`; without
  //    this pre-check the AccessPolicy chain would fall through to
  //    `default_deny` → 403, regressing the 401-vs-403 contract that
  //    some clients (e.g., `chat-view.tsx` separates 403 from 401)
  //    depend on. ──────────────────────────────────────────────────
  if (!user?.email || !dbUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Policy chain: admin role check (Node-only DB-backed) ───────
  // Only `admin_role` here — the pre-check has already gated
  // session presence, so `session_required` would be a no-op.
  // Kept the chain pattern for symmetry with the other consumers
  // (Edge proxy.ts, RSC AccessGate) — a future multi-role need
  // (e.g., "admin OR creator") slots in here as another policy.
  const decision = evaluateAccess(
    [{ kind: "admin_role", requiresDb: true }],
    {
      pathname: "/api/admin",
      // Pre-check above guarantees dbUser is real; the `admin_role`
      // policy only reads `userRole`, so the other ctx fields are
      // intentionally omitted here.
      userId: dbUser.id,
      userRole: dbUser.role,
    },
  );

  if (decision.action === "allow") return null;

  // default_deny → userRecord exists, role !== "admin" → 403.
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
