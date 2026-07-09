# Google OAuth Setup — Runbook

Use this guide whenever Google sign-in breaks (e.g. `Unable to exchange external code: 4/0A`). It walks through both the Supabase Dashboard and the Google Cloud Console, with diagnostic scripts to verify each layer.

---

## TL;DR — Three layers must agree

For Google sign-in to work end-to-end, **three pieces of configuration must match**:

```
┌─ Layer 1: Vercel env vars ──────────────  NEXT_PUBLIC_SUPABASE_URL  → https://YOUR.supabase.co
│                                          NEXT_PUBLIC_SUPABASE_ANON_KEY
│                                          NEXT_PUBLIC_APP_URL          → https://www.courssy.com
│
├─ Layer 2: Supabase Dashboard ────────────  Site URL          =  https://www.courssy.com
│                                          Redirect URLs     =  https://www.courssy.com/auth/callback
│                                                           +  https://www.courssy.com/**
│                                          Google provider ENABLED with correct CLIENT_ID/SECRET
│
└─ Layer 3: Google Cloud Console ──────────  Authorized Web Origins = https://www.courssy.com
                                              Authorized Redirect URIs = https://YOUR.supabase.co/auth/v1/callback
                                              (NOT your /auth/callback — only Supabase's)
```

If any one of the three is wrong, you get `Unable to exchange external code: 4/0A` or `#error=server_error` in the URL after Google redirects back.

---

## Step 0 — Run the diagnostic

Before changing anything, run **both** diagnostics. They tell you exactly which layer is broken.

### From the terminal (recommended)
```bash
npx tsx scripts/diagnose-oauth.ts
```
With `.env.local` set to production values:
```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
NEXT_PUBLIC_APP_URL=https://www.courssy.com
```

### From the web (requires `CRON_SECRET`)
The endpoint is **gated** with `Authorization: Bearer ${CRON_SECRET}` to prevent attackers from fingerprinting the Supabase project. Set the header:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
     https://www.courssy.com/api/diagnose-oauth | jq
```

> If you don't have `CRON_SECRET` configured, set it in Vercel → Settings → Environment Variables (generate with `openssl rand -base64 32`), then redeploy.

---

## Step 1 — Vercel environment variables

Vercel → Project → Settings → Environment Variables.

Required:
| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://YOUR-PROJECT-REF.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | (the `anon` `public` JWT from Supabase → Project Settings → API) |
| `NEXT_PUBLIC_APP_URL` | `https://www.courssy.com` |

> ⚠️ Variables prefixed `NEXT_PUBLIC_` are exposed to the browser, so they're safe to keep public. Without these three, the diagnostic will fail at Layer 1.

After changing env vars on Vercel: **redeploy** (`npx vercel --prod --yes` or via Vercel dashboard → Deployments → Redeploy).

---

## Step 2 — Supabase Dashboard

### 2a. URL Configuration
**Authentication → URL Configuration**

| Field | Value |
| --- | --- |
| **Site URL** | `https://www.courssy.com` |
| **Redirect URLs** (one per line) | `https://www.courssy.com/auth/callback` |
| | `https://www.courssy.com/**` |

> The `/**` wildcard covers every locale-prefixed path (`/en-us/...`, `/it-it/...`). Without it, OAuth may break on locale-prefixed URLs.

### 2b. Google Provider
**Authentication → Providers → Google**

| Field | Value |
| --- | --- |
| **Google enabled** | ✅ ON |
| **Client ID** | From Google Cloud Console → Credentials (looks like `xxxxx.apps.googleusercontent.com`) |
| **Secret** | From Google Cloud Console → Credentials |
| **Authorized callback URL** (displayed by Supabase) | `https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback` |

> You don't need to add anything to your app's `/auth/callback` here — Supabase calls Google with **its own** callback URL and forwards the result to your `/auth/callback` via the auth-code flow.

### 2c. Email Templates (only if sign-up uses email confirmation)
**Authentication → Email Templates → Confirm signup**
Set the **Confirm link** to:
```
{{ .SiteURL }}/auth/callback?redirect_to={{ .ConfirmationURL }}
```
Or simpler: `{{ .ConfirmationURL }}` and let Supabase handle it.

---

## Step 3 — Google Cloud Console

### 3a. OAuth consent screen
**APIs & Services → OAuth consent screen**

| Field | Value |
| --- | --- |
| **User type** | External |
| **App name** | Courssy |
| **User support email** | (your support email) |
| **App domain → Application home page** | `https://www.courssy.com` |
| **Authorized domains** | `supabase.co`<br>`courssy.com` |
| **Developer contact** | (your email) |

**Publishing status — CRITICAL**:
- For testing: leave in **Testing** and add your email as a **Test user** (otherwise Google blocks it after the first few sign-ins with `4/0A`).
- For production: click **Publish App** to move to **In production** (requires Google verification for sensitive scopes; only `email` + `profile` are non-sensitive and skip review).

### 3b. Credentials
**APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID → Web application**

| Field | Value |
| --- | --- |
| Name | `Courssy Production` |
| **Authorized JavaScript origins** | `https://www.courssy.com`<br>`https://YOUR-PROJECT-REF.supabase.co` |
| **Authorized redirect URIs** ⚠️ | `https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback` |

> ⚠️ The redirect URI must be **Supabase's**, NOT your app's `/auth/callback`. Google → Supabase → Your-app is the chain. If you put `https://www.courssy.com/auth/callback` here, you get `redirect_uri_mismatch`.

### 3c. Copy Client ID + Secret back to Supabase
After creating the OAuth client in Google Cloud, paste:
- **Client ID** → Supabase Dashboard → Authentication → Providers → Google → Client ID
- **Client Secret** → Supabase Dashboard → Authentication → Providers → Google → Secret

Save. Now re-run the diagnostic — both layers should pass.

---

## Step 4 — Common error codes

| Supabase error code | Google error | Root cause | Fix |
| --- | --- | --- | --- |
| `redirect_uri_mismatch` | 400 | Google redirect URI doesn't match | Fix Google Cloud Authorized redirect URIs (use Supabase's URL, not yours) |
| `400: invalid_request` (unsupported_response_type) | 400 | OAuth client misconfigured in Google Cloud | Re-create OAuth client in Google Cloud with Web Application type |
| `4/0A` (your reported error) | `server_error` | Code exchange fails between Google → Supabase | Usually: Supabase Site URL mismatch, or Google consent screen in Testing without test-user, or Supabase `GOOGLE_CLIENT_SECRET` not configured |
| `access_denied` | — | User denied consent, or app not approved | Resubmit Google consent screen, or publish app |
| `4xx: provider_disabled` | — | Google provider off in Supabase | Toggle ON in Supabase Dashboard → Providers → Google |

---

## Step 5 — Verify

After applying fixes, run all three of these:

1. **Browser diagnostic**:
   ```
   https://www.courssy.com/api/diagnose-oauth
   ```
   Expect `"ok": true`, all checks ✅ pass.

2. **Local diagnostic** (terminal):
   ```
   npx tsx scripts/diagnose-oauth.ts
   ```
   Expect `🎉 All checks passed`.

3. **Live test**:
   - Open `https://www.courssy.com/login` in an **incognito window**.
   - Click **Continue with Google**.
   - Pick a Google account.
   - Expect to land on `/dashboard` (or whatever `next=` was).
   - If you see an error message in the form, the actual reason is now shown — copy it and search this guide.

---

## Step 6 — Edge cases

### "Sign-in succeeds but I'm not logged in"
Your app's `/auth/callback` is being hit but the browser isn't seeing the session cookie. Check:
- `httpsOnly` setting on `sb-*-auth-token` cookies — Next.js sets them automatically; should be `false`.
- `secure` flag — must be `true` in production, `false` in dev.
- Site URL in Supabase matches the actual page URL exactly (no trailing slash, no `www` mismatch).

### "Google sign-in works but email confirmation loops forever"
Confirmation email link uses the wrong Site URL. Fix the **Confirm signup** template (Step 2c).

### "OAuth works in dev but not in production"
Almost always a Vercel env var mismatch. Run `npx vercel env ls` and confirm `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_APP_URL` match the production values.

---

## Quick reference — Vercel env var commands

```bash
# Show current env vars on Vercel
npx vercel env ls

# Edit a var (interactive)
npx vercel env edit NEXT_PUBLIC_SUPABASE_URL production

# Add a new one
echo "https://YOUR.supabase.co" | npx vercel env add NEXT_PUBLIC_SUPABASE_URL production

# After editing, redeploy
npx vercel --prod --yes
```
