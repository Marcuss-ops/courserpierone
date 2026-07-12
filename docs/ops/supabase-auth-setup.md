# Supabase Auth Setup — Operational Runbook

> **Scope:** the canonical setup procedure for Supabase Authentication on Courssy.
> Covers OAuth (Google) + email/password + email-confirm flows. Includes the
> `/auth/callback` redirect contract, the Site URL wiring, the Google OAuth
> provider config, and the full Auth env-var inventory on Vercel.
>
> **Audience on-call runner who needs to wire a new Supabase project, or
> diagnose a broken sign-in flow**. Use the diag tool for layered verification
> (`scripts/diagnose-oauth.ts`) — this runbook documents the procedural setup,
> the diag tool verifies it end-to-end.
>
> **Related (do not duplicate, link instead):**
> - [`../../OAUTH-SETUP.md`](../../OAUTH-SETUP.md) — Google OAuth three-layer diagram + vendor-side diags
> - [`../../SECURITY.md`](../../SECURITY.md) — threat model, RBAC, secret rotation inventory
> - [`../production.md`](../production.md) — deploy runbook, §5 (secret rotation)
>
> **Implementation references (read these when wiring site URL or redirect targets):**
> - `src/app/auth/callback/route.ts` — handles `?code=` + `?next=` and runs `supabase.auth.exchangeCodeForSession`
> - `src/components/auth/auth-form.tsx` — sends `redirectTo: ${origin}/auth/callback?next=...` for both Google OAuth + email confirm
> - `src/lib/utils/is-safe-callback-url.ts` — allowlist for `next=…` to prevent open-redirect
> - `src/lib/env.ts` — typed schema for the 5 Supabase + 2 Google env vars
> - `scripts/diagnose-oauth.ts` — runs the layered verification (env → Supabase settings → OAuth flow probe → checklist print)

---

## TL;DR — Two layers must agree

For Supabase sign-in to work end-to-end, **two pieces** of configuration must agree:

```
┌─ Layer 1: Vercel env vars ──────────────────────────────────────
│   NEXT_PUBLIC_SUPABASE_URL     → https://<PROJECT-REF>.supabase.co
│   NEXT_PUBLIC_SUPABASE_ANON_KEY
│   NEXT_PUBLIC_APP_URL           → https://www.courssy.com
│   SUPABASE_URL (server-only)     → same project ref, server-side
│   SUPABASE_SERVICE_ROLE_KEY     → server-only, full privilege
│   GOOGLE_CLIENT_ID              → (if exposed; otherwise only in
│   GOOGLE_CLIENT_SECRET             Supabase Dashboard provider cfg)
│
└─ Layer 2: Supabase Dashboard ───────────────────────────────────
    Authentication → URL Configuration
      • Site URL          = https://www.courssy.com
      • Redirect URLs     = https://www.courssy.com/auth/callback
                            + https://www.courssy.com/**
    Authentication → Providers → Google ENABLED with correct CLIENT_ID/SECRET
```

Google OAuth adds a **third layer** (Google Cloud Console), documented separately
in [`OAUTH-SETUP.md`](../../OAUTH-SETUP.md). This runbook covers Layers 1 and 2 in
detail + the Google-provider bridge. Per OAUTH-SETUP.md, the canonical Google
callback is **`https://<PROJECT-REF>.supabase.co/auth/v1/callback`** — NOT your
app's `/auth/callback`. Supabase receives the auth-code from Google and forwards
it to your app.

If one layer is wrong, you get errors at sign-in time:
`Unable to exchange external code: 4/0A`, `redirect_uri_mismatch`,
`provider_disabled`, `400: invalid_request`, or `#error=server_error` in the URL
after Google redirects back. Run [`scripts/diagnose-oauth.ts`](../../scripts/diagnose-oauth.ts)
end-to-end after any change to identify which layer is broken.

---

## §1 — Site URL (Supabase URL Configuration)

### 1.1 Where to set

**Supabase Dashboard → Authentication → URL Configuration.**

| Field | Production value | Staging / preview value | Local dev value |
| --- | --- | --- | --- |
| **Site URL** | `https://www.courssy.com` | `https://staging.courssy.com` | `http://localhost:3000` |
| **Redirect URLs** (one per line) | `https://www.courssy.com/auth/callback`<br>`https://www.courssy.com/**` | `https://staging.courssy.com/auth/callback`<br>`https://staging.courssy.com/**` | `http://localhost:3000/auth/callback`<br>`http://localhost:3000/**` |

> The `/**` wildcard is **non-negotiable**. Without it, OAuth breaks on
> locale-prefixed URLs (`/en-us/...`, `/it-it/...`, `/es-es/...`) — Supabase
> checks the redirect URL against the exact allowlist, and locale prefixes
> are part of the path.

### 1.2 Why `Site URL` ≠ `NEXT_PUBLIC_APP_URL` (formally different)

The two env vars are conceptually adjacent but serve distinct purposes:

| Setting | Source | Role |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | Vercel env var | App-side: absolute URLs in transactional **email templates**, share buttons, OAuth `redirectTo` baseline |
| Supabase `Site URL` | Dashboard | Supabase-side: default redirect target after email-confirm flows, the canonical origin Supabase assumes for `redirect_url` computations |

Both must agree on the same canonical origin (no `www`/`non-www` mismatch,
no trailing slash mismatch). A divergence causes email-confirm links to point
to one host while the OAuth `redirect_uri` points to another — both flows
silently fail.

### 1.3 Email-template side effects (auto-coupled)

Setting `Site URL` ALSO affects the **Confirm signup** template link. The
default template looks like:

```
{{ .ConfirmationURL }}
```

This embeds the full Supabase-generated URL with the user's confirmation
token — Supabase resolves this against `Site URL` to produce a redirect
target. **You don't need to set `{{ .SiteURL }}/auth/callback?redirect_to=...`**
explicitly as long as `Site URL` matches your app's actual origin AND
`/auth/callback` is in the Redirect URLs allowlist (see §2.1 below).

If `Site URL` is wrong, the email-confirm link silently redirects to the
wrong host — or fails entirely if the redirect target is not allowlisted.

---

## §2 — Redirect `/auth/callback`

### 2.1 The Supabase Redirect URLs allowlist

The Supabase-side allowlist (Dashboard → Authentication → URL Configuration →
**Redirect URLs**) must contain:

```
https://www.courssy.com/auth/callback
https://www.courssy.com/**      # wildcard for all paths
```

The second line covers every locale-prefixed post-login landing
(`/en-us/.../portal`, `/it-it/.../portal`, etc.). Without it, OAuth fails
for any non-default-locale redirect.

### 2.2 The Next.js `/auth/callback` route contract

Implementation: [`src/app/auth/callback/route.ts`](../../src/app/auth/callback/route.ts)
(GET handler).

Inbound contract:
- `?code=…` — Supabase authorization code (required for success path).
- `?next=…` — where to land after session exchange (validated by `isSafeCallbackUrl`).
- Missing `?code` → redirect to `/login` (silent — user likely cleared cookies).
- Failed exchange → redirect to `/login?oauth_error=…&oauth_code=…` so the form
  surfaces a human-readable error (see [`src/components/auth/auth-form.tsx`](../../src/components/auth/auth-form.tsx) — it reads both
  the URL fragment `#error_description=` AND the `?oauth_error=` query param).

Behavior matrix:

| Inbound | Inbound | Outcome |
| --- | --- | --- |
| `code` present | `next` safe | Exchange succeeds → `302 Location: ${origin}${next}` |
| `code` present | `next` unsafe (not in `isSafeCallbackUrl` allowlist) | Falls back to `/dashboard` |
| `code` present | exchange fails | `302 Location: /login?oauth_error=<msg>&oauth_code=<code>` |
| `code` missing | — | `302 Location: /login` |

The `isSafeCallbackUrl` allowlist (in `src/lib/utils/is-safe-callback-url.ts`)
permits: `/dashboard`, `/login`, `/auth/callback`, `/admin`, `/`, and any
locale-prefixed path. **It rejects arbitrary paths to prevent open-redirect
attacks** via the OAuth flow.

### 2.3 The redirect chain (Google → Supabase → your app)

The end-to-end redirect flow has **three hops**, each with its own URL:

```
1. Browser → Supabase /auth/v1/authorize?provider=google&redirect_to=…
                                ↓
2. Supabase → Google   https://accounts.google.com/o/oauth2/v2/auth
                       ?redirect_uri=https://<PROJECT>.supabase.co/auth/v1/callback    ← Supabase's own callback
                                ↓
3. Google → Supabase   https://<PROJECT>.supabase.co/auth/v1/callback?code=…
                                ↓
4. Supabase → Browser  https://www.courssy.com/auth/callback?code=…&next=…          ← YOUR app's callback
                                ↓
5. /auth/callback →    ${next} (or /dashboard default)
```

| Hop | URL is set in | Common foot-gun |
| --- | --- | --- |
| 1 (your app initiates) | `auth-form.tsx` → `redirectTo: ${origin}/auth/callback?next=…` | `origin` is `window.location.origin` — ensure `NEXT_PUBLIC_APP_URL` matches the browser-visible host |
| 2 (Supabase → Google) | Supabase generates from `Site URL` + provider config | If `Site URL` is wrong, Supabase calls Google with a `redirect_uri` pointing at the wrong host |
| 3 (Google → Supabase) | Google Cloud Console → OAuth client **Authorized redirect URIs** | If you accidentally list `https://www.courssy.com/auth/callback` here instead of `https://<PROJECT>.supabase.co/auth/v1/callback`, Google returns `redirect_uri_mismatch` |
| 4 (Supabase → your app) | Supabase URL Configuration → **Redirect URLs** allowlist | If `/auth/callback` is not in the allowlist, Supabase refuses to redirect → `error=redirect_uri_not_in_allowlist` |
| 5 (your app commits) | `route.ts` → `isSafeCallbackUrl(next)` + `exchangeCodeForSession` | If `next` is not safe, falls back to `/dashboard` silently — easy to mis-debug if the user expected a deep link |

### 2.4 Email-confirm-link redirect

When a user signs up via email/password (not OAuth), Supabase sends a confirm
email. The link in the email is `{{ .ConfirmationURL }}`, which Supabase
resolves against `Site URL` → `${SiteURL}/auth/callback?…`. The same
`/auth/callback` route handles it (it does not discriminate OAuth vs email
confirm — the `code` param is the same shape).

To customize (rare), override the **Confirm signup** email template at
Authentication → Email Templates → Confirm signup:

```
{{ .SiteURL }}/auth/callback?redirect_to={{ .ConfirmationURL }}
```

This explicit form is useful if you want a stable landing page irrespective
of `Site URL` drift — but the implicit `{{ .ConfirmationURL }}` is sufficient
for 99% of setups.

### 2.5 The PG-side AccessGate response

`/auth/callback` ONLY handles the auth-code exchange + redirect. Course
access is decided separately via `AccessGate` + the corresponding
`/api/user/orders` lookup. A successful email-confirm and a successful
OAuth land on different routes but converge on the same AccessGate
semantics — no special handling needed for "the user came from OAuth"
vs "the user came from email confirm" beyond the `code` exchange.

---

## §3 — Google OAuth provider

> For the full three-layer diagram + Google Cloud Console + consent screen
> walkthrough, see [`OAUTH-SETUP.md`](../../OAUTH-SETUP.md). This section is
> the **operational TL;DR** for the Supabase side of the Google provider.

### 3.1 Enable Google in Supabase

**Supabase Dashboard → Authentication → Providers → Google.**

| Field | Value |
| --- | --- |
| **Google enabled** | ✅ ON |
| **Client ID** | From Google Cloud Console → APIs & Services → Credentials → your OAuth 2.0 Client ID (`…apps.googleusercontent.com`) |
| **Client Secret (for OAuth flow)** | From the same Google Cloud Console screen |
| **Authorized callback URL** (read-only, Supabase displays) | `https://<PROJECT-REF>.supabase.co/auth/v1/callback` |

> You do NOT add `https://www.courssy.com/auth/callback` here. Google OAuth
> uses Supabase's own `/auth/v1/callback` as its `redirect_uri`. Supabase
> receives Google's auth-code and forwards to your `/auth/callback` via
> the `Site URL` allowlist (§2.1).

### 3.2 The auth-form-side OAuth init

Implementation: [`src/components/auth/auth-form.tsx`](../../src/components/auth/auth-form.tsx) →
`handleGoogleLogin()`:

```ts
await supabase.auth.signInWithOAuth({
  provider: "google",
  options: {
    redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirectTarget)}`,
    queryParams: { access_type: "offline", prompt: "consent" },
  },
});
```

- `redirectTo` MUST be exactly `${window.location.origin}/auth/callback` —
  if it differs from the `Site URL` allowlist entry, OAuth fails.
- `access_type: "offline"` is set so Supabase can issue a refresh token.
  Most OAuth providers ignore this without the `prompt: "consent"` companion;
  the form sets both.
- `?next=…` deep-link preservation is **delegated to the client** (not the
  Supabase provider config). `redirectTarget` is derived from query params
  with `isSafeCallbackUrl` validation.

### 3.3 The Supabase-side OAuth flow probe

`scripts/diagnose-oauth.ts` runs a layered verification — env vars,
Supabase settings endpoint reachable, Google provider enabled, OAuth flow
HTTP 302 → Google → `redirect_uri` matches `SITE_URL`. This is the
single best verification tool after any change here. **Run it after every
edit to this section.**

```bash
# From the repo root with .env.local populated:
npx tsx scripts/diagnose-oauth.ts
# Or with explicit SITE_URL override:
SITE_URL=https://www.courssy.com npx tsx scripts/diagnose-oauth.ts
```

Expected output: `🎉 All checks passed` + a **Manual Checklist** printout
that summarizes what to verify in the Supabase + Google Cloud consoles.
The printout is intentionally redundant with this runbook — that's by
design: the diag tool should never be the only source of truth.

### 3.4 What the diagnostic does NOT cover

- The **Google consent screen publishing status** ("Testing" vs
  "In production") — verified manually in Google Cloud Console.
- The **`/api/user/orders` and AccessGate** semantics post-redirect — out
  of scope for the OAuth-instrumentation layer; the journey E2E test
  (`tests/e2e/journey.spec.ts`, LS-first) covers that with a real
  sign-in + redirect.
- **Service-role-key writes** from the post-OAuth user-creation flow —
  the LS-refund + LS-journey specs cover this layer with end-to-end
  Prisma assertions; OAuth itself only triggers session creation.

---

## §4 — Env vars (Auth)

### 4.1 The authoritative schema (Vercel env vars)

Implementation: [`src/lib/env.ts`](../../src/lib/env.ts) — typed schema with
three tiers (critical / required / optional). The Auth-relevant entries:

| Variable | Tier | Required for | Where it's used |
| --- | --- | --- | --- |
| `SUPABASE_URL` | **Critical** | Server-side admin operations (Prisma + Storage + email dispatch) | `src/lib/db/supabase.ts`, `src/lib/services/email.ts` (admin scope) |
| `SUPABASE_SERVICE_ROLE_KEY` | **Critical** | Same as above, with full-privilege Postgres + Storage access | Same |
| `NEXT_PUBLIC_SUPABASE_URL` | **Required** | Browser + SSR `createClient()` — Supabase project URL | `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/middleware.ts` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Required** | Browser-side + SSR client — JWT-locked to `anon` role via RLS | Same |
| `NEXT_PUBLIC_APP_URL` | **Required (auth-adjacent)** | Absolute URL builder — OAuth `redirectTo`, transactional emails | `src/components/auth/auth-form.tsx`, `src/lib/services/email.ts`, payment providers |
| `GOOGLE_CLIENT_ID` | Optional (auth-side) | Only if bypassing Supabase and calling Google APIs directly | Not used by Supabase-mediated OAuth (which is the app's path). Diagnostic-included for visibility. |
| `GOOGLE_CLIENT_SECRET` | Optional (auth-side) | Same as above | Same |

> `NEXT_PUBLIC_*` vars are exposed to the browser, which is intentional —
> the `anon` key is JWT-locked to the `anon` Postgres role via RLS policies.
> Neither the project URL nor the anon key carry privilege escalation risk
> on their own. The service-role key is **server-only** — never with
> `NEXT_PUBLIC_` prefix.

### 4.2 Where to set each var

**Vercel → Project → Settings → Environment Variables.**

Add each var in three scopes: `Production`, `Preview`, `Development` (the
defaults shown in the new-var UI). The Preview scope controls staging / PR
previews; Development is for `vercel dev` (rare; usually local `.env.local`
suffices).

```bash
# Quick add (production only, the most common scope):
npx vercel env add SUPABASE_URL production
# (paste: https://<PROJECT-REF>.supabase.co)

npx vercel env add SUPABASE_SERVICE_ROLE_KEY production
# (paste: the service-role JWT — Vercel prompts for the value securely)

npx vercel env add NEXT_PUBLIC_SUPABASE_URL production
npx vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
npx vercel env add NEXT_PUBLIC_APP_URL production
# (paste: https://www.courssy.com)
```

> After adding any var, redeploy: `npx vercel --prod --yes` (manual) or
> trigger via the deploy-gate workflow.

### 4.3 The OAuth-only path (no email)

For OAuth-only setups (no email/password), the same env vars apply but the
minimum set is **3**:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_APP_URL        # for OAuth redirectTo
```

`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are still required for
server-side operations (even with no email signups, the service-role key
is used by the post-OAuth user-creation path to insert the `User` row +
`Order` row + `AccessGrant` row). The OAuth flow without these vars
silently fails post-redirect with `relation "User" does not exist` (the
Prisma client can't reach Postgres).

### 4.4 Local dev file (`.env.local`)

For local dev, copy the production values to `.env.local` (gitignored).

```bash
# Minimum for OAuth alone:
NEXT_PUBLIC_SUPABASE_URL=https://<PROJECT-REF>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key-from-supabase-dashboard>
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Server-side (Prisma + email + admin):
SUPABASE_URL=https://<PROJECT-REF>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>

# GOOGLE_* are NOT required for local dev (Supabase manages them in its
# dashboard). Only set for direct-Google-API work — see §4.1 table.
```

> `NEXT_PUBLIC_APP_URL` MUST be `http://localhost:3000` (NOT
> `https://...`) for the dev server. The Supabase `Site URL` can stay
> pointed at production if you don't test OAuth locally; if you do
> test OAuth locally, set `Site URL = http://localhost:3000` in
> the dev Supabase project.

### 4.5 Rotation policy (Auth tier)

Per [`docs/production.md` §5](../production.md#5--secret-rotation), Auth-tier
secrets have a **365-day** rotation cadence (or immediate on compromise).
The dual-key-path is recommended for `SUPABASE_SERVICE_ROLE_KEY` (critical
tier) — see production.md §5.2 for the full procedure. `NEXT_PUBLIC_*` keys
can be rotated in-place (single var replacement + redeploy) because they
are public.

| Secret | Rotation method | Recovery time |
| --- | --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | Dual-key (`SUPABASE_SERVICE_ROLE_KEY` + `SUPABASE_SERVICE_ROLE_KEY_V2`) + revoke old after smoke-test | 15 min |
| `SUPABASE_URL` | In-place — change to the same value (low churn) | 5 min |
| `NEXT_PUBLIC_SUPABASE_URL` | In-place — change to same value | 5 min |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | In-place — replace + redeploy | 15 min |
| `NEXT_PUBLIC_APP_URL` | In-place — replace + redeploy (Site URL allowlist updates separately) | 15 min |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Dual-key not possible in Vendor; rotate in Google Cloud + paste new in Supabase provider config | 30 min |

---

## §5 — Verification

After any change to §1–§4, run the layered diagnostic to confirm end-to-end
green:

```bash
# 1) Layered diagnostic (env → Supabase settings → OAuth flow probe)
npx tsx scripts/diagnose-oauth.ts
# Expected: 🎉 All checks passed.

# 2) Manual sanity — initiate OAuth from the browser
#    http://localhost:3000/login (or https://www.courssy.com/login in prod)
#    Click "Continue with Google" → pick a Google account → land on /dashboard
#    If you see `?oauth_error=…` in the redirect, the route.ts has surfaced
#    the Supabase-side error to the form (start from §3.4 / OAUTH-SETUP §4).

# 3) For staging/prod: visit the auth-required dashboard
#    https://www.courssy.com/api/diagnose-oauth (with CRON_SECRET)
curl -sS -H "Authorization: Bearer $CRON_SECRET" https://www.courssy.com/api/diagnose-oauth | jq
# Expected: all checks "pass" status.

# 4) Cross-env smoke: trigger an email-confirm (any email) and verify the
#    link resolves to https://www.courssy.com/auth/callback (NOT localhost
#    or any other host). Email-template Site URL drift surfaces here.
```

The diagnostic outputs a structured JSON-like checklist — pipe through `jq`
for archiving or alerting.

---

## §6 — Common failure modes

| Symptom | Root cause | Fix |
| --- | --- | --- |
| `Unable to exchange external code: 4/0A` after Google → app redirect | **Site URL mismatch** between Supabase and `NEXT_PUBLIC_APP_URL`; OR Google consent screen in **Testing** mode without test-user add; OR `GOOGLE_CLIENT_SECRET` not yet in Supabase provider config | Verify §1 (Site URL = `NEXT_PUBLIC_APP_URL`). Add the user's email as a Test user in Google Cloud. Re-paste Client Secret in Supabase. |
| `redirect_uri_mismatch` (Google-side) | Google Cloud Console's Authorized redirect URIs does NOT contain `https://<PROJECT>.supabase.co/auth/v1/callback`; OR it incorrectly contains your app's `/auth/callback` | Google Cloud Console → Credentials → edit OAuth client → add the Supabase callback URL. Remove your app's `/auth/callback` from Google's redirect URIs (it goes in **Supabase**'s allowlist, not Google's). |
| `400: invalid_request` from Google | OAuth client created as **Desktop app** or other non-Web-application type | Re-create in Google Cloud as **Web application**. |
| `provider_disabled` from Supabase | Google provider toggle is OFF in Supabase Dashboard → Providers → Google | Toggle ON, paste Client ID + Secret, Save. |
| `access_denied` | User denied consent in the Google prompt, OR app not yet published in Google Cloud | For dev: re-attempt. For prod: publish the consent screen via Google Cloud OAuth consent screen → "Publish App". |
| OAuth succeeds but `/dashboard` is a redirect-loop | `sb-*-auth-token` cookie is set with wrong `secure`/`httpOnly`/`sameSite` flags. Browser rejects it. | Vercel/Supabase sets these automatically. Check `localhost` vs production domain mismatch (cookie won't cross hosts). |
| Email-confirm link redirects to a 404 or wrong host | Supabase `Site URL` is wrong OR `/auth/callback` not in Redirect URLs allowlist | §1 + §2.1 above. |
| Email-confirm link works but landing page shows login form again | `next=` was filtered by `isSafeCallbackUrl` (fallback to `/dashboard` triggered). The user requested an unsafe `next=`. | Either make the path safe (add to allowlist in `src/lib/utils/is-safe-callback-url.ts`) or update the auth-form to omit `next=` for unsafe targets. |
| The diagnostic reports "Google OAuth endpoint reachable" but live sign-in fails | Probably a stale Test user list on the Google consent screen (Testing mode), OR a Google Cloud API scope mismatch | Re-add the user as a Test user; verify the consent screen Scopes match what Supabase requests (default is `email` + `profile` — both non-sensitive, no verification needed). |
| `#error=server_error` in URL fragment after redirect | Supabase internal error — generic catch-all. Check Supabase logs for the exact reason. | Supabase Dashboard → Logs → Auth. Look for the `error` row with the user's timestamp. |

---

## §7 — Operational hygiene

### 7.1 What to audit quarterly

- **Vercel env var list** matches production reality (`npx vercel env ls`)
  and matches this runbook's §4.1 table. Drift = mis-debug risk.
- **Supabase URL Configuration** has both `https://www.courssy.com/auth/callback`
  AND wildcard `https://www.courssy.com/**`. Without the wildcard, a
  new locale-prefixed page silently breaks OAuth.
- **Site URL** = production canonical origin (no `www` vs non-`www` drift).
- **Google Cloud OAuth consent screen** is in **In production** state, not
  Testing. Prolonged Testing state = Google blocks the app after a few
  sign-ins with `4/0A`.
- **Refresh tokens** issued under `access_type: "offline"` (set in
  `auth-form.tsx`) actually refresh — Supabase's auto-refresh is on by
  default; verify by inspecting session expiry on a long-lived client.

### 7.2 What to check on any vendor-side change

| Vendor changed | What to verify in the app |
| --- | --- |
| **Supabase rotated the project URL** (rare — typically only on plan-tier migrations) | Update `SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_URL` + Supabase `Site URL` allowlist together. Re-run §5 verification. |
| **Supabase rotated the anon JWT** (more common — happens on key compromise) | Update `NEXT_PUBLIC_SUPABASE_ANON_KEY` in Vercel. Redeploy. No other site changes needed. |
| **Google changed the OAuth consent screen policy** | Re-publish the consent screen in Google Cloud. Verify the published scopes match what Supabase requests. Sign-in regresses silently if scopes widened without re-publish. |
| **Google rotated an OAuth client secret** | Re-paste in Supabase provider config. Re-run §5. No Vercel changes needed (we don't hold Google secrets directly). |

### 7.3 What to update when the codebase changes

If you change ANY of these source files, update this runbook + OAUTH-SETUP.md:

| Code change | Runbook section to update |
| --- | --- |
| `src/app/auth/callback/route.ts` — added a `?param=` or changed error semantics | §2.2 behavior matrix + §6 "Common failure modes" |
| `src/components/auth/auth-form.tsx` — changed `redirectTo` template | §3.2 + cross-ref §2.5 |
| `src/lib/utils/is-safe-callback-url.ts` — allowlist changed | §2.2 behavior matrix (the "next" row) |
| `src/lib/env.ts` — added/removed/renamed any of the 5 Supabase or 2 Google vars | §4.1 table + §4.2 / §4.4 |
| `scripts/diagnose-oauth.ts` — added a new probe | §3.3 |

### 7.4 What this runbook does NOT cover (cross-link to other docs)

| Topic | See |
| --- | --- |
| Threat model / RBAC / known security gaps | [`../../SECURITY.md`](../../SECURITY.md) |
| Three-layer Google OAuth diag + Google Cloud Console walkthrough | [`../../OAUTH-SETUP.md`](../../OAUTH-SETUP.md) |
| Deploy pipeline + secret rotation + secret inventory | [`../production.md`](../production.md) |
| Course access decision (AccessGate) — what happens AFTER successful sign-in | [`ARCHITECTURE.md`](../../ARCHITECTURE.md) (system data flow) |
| Incident response (P0/P1 semantics for auth downtime) | [`../production.md` §3](../production.md#3--incident-response) |
| Verifying the OAuth flow as part of pre-release CI matrix | `tests/e2e/journey.spec.ts` (LS-first post FASE 1.8) + `tests/e2e/checkout.ls.spec.ts` |

---

## Document control

| Field | Value |
| --- | --- |
| First written | FASE 3.1 (this runbook is a sibling of `OAUTH-SETUP.md`, not a replacement) |
| Source of truth for Supabase-side wiring | Supabase Dashboard (URL Configuration + Providers → Google) — this runbook is the **procedural** mirror |
| Cross-checked against | OAUTH-SETUP.md (Google three-layer), SECURITY.md (RBAC), production.md (rotation), src/lib/env.ts (typed schema), scripts/diagnose-oauth.ts (diags) |
| Maintainer | ops-lead (TBD) |
| Review cadence | quarterly audit (per §7.1); immediate update on any source-file change listed in §7.3 |
