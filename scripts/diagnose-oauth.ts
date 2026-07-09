/**
 * OAuth Diagnostic — verifies the Google OAuth setup end-to-end.
 *
 * What it checks:
 *   1. Env vars present (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET)
 *   2. Supabase project reachable (GET /auth/v1/settings)
 *   3. Google provider enabled in Supabase (settings.external_providers.google)
 *   4. OAuth endpoint reachable from current SITE_URL
 *   5. Google redirect-URI format sanity check
 *
 * Usage:
 *   npx tsx scripts/diagnose-oauth.ts                  (uses NEXT_PUBLIC_APP_URL or http://localhost:3000)
 *   NEXT_PUBLIC_APP_URL=https://www.courssy.com npx tsx scripts/diagnose-oauth.ts
 *   SITE_URL=https://www.courssy.com npx tsx scripts/diagnose-oauth.ts
 */

import { existsSync } from "fs";

// dotenv is optional — script works without it if env vars are already set in the shell.
// We use a dynamic import so the script doesn't crash if dotenv is not installed.
async function loadEnvFiles() {
  try {
    const dotenv = (await import("dotenv" as string).catch(() => null)) as
      | { config: (opts: { path: string }) => void }
      | null;
    if (!dotenv) return; // dotenv not installed — fall through
    if (existsSync(".env.local")) dotenv.config({ path: ".env.local" });
    if (existsSync(".env")) dotenv.config({ path: ".env" });
  } catch {
    // Ignore — use whatever is in process.env
  }
}

type CheckStatus = "pass" | "fail" | "warn" | "info";
interface Check {
  status: CheckStatus;
  label: string;
  detail: string;
  fix?: string;
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  || process.env.SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const SITE_URL =
  process.env.SITE_URL
  || process.env.NEXT_PUBLIC_APP_URL
  || "http://localhost:3000";

const checks: Check[] = [];

function addCheck(c: Check) {
  checks.push(c);
}

// ── 1. Env vars ────────────────────────────────────────────────────
function checkEnvVars() {
  addCheck({
    status: "info",
    label: "NEXT_PUBLIC_SUPABASE_URL",
    detail: SUPABASE_URL ? SUPABASE_URL.replace(/\/\/.+@/, "//***@") : "❌ NOT SET",
    fix: !SUPABASE_URL ? "Set NEXT_PUBLIC_SUPABASE_URL in .env.local to https://YOUR-PROJECT.supabase.co" : undefined,
  });

  addCheck({
    status: "info",
    label: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    detail: ANON_KEY ? `${ANON_KEY.slice(0, 12)}...${ANON_KEY.slice(-6)}` : "❌ NOT SET",
    fix: !ANON_KEY ? "Set NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local (from Supabase Dashboard → Project Settings → API)" : undefined,
  });

  addCheck({
    status: GOOGLE_CLIENT_ID ? "pass" : "warn",
    label: "GOOGLE_CLIENT_ID (optional — only for direct Google API)",
    detail: GOOGLE_CLIENT_ID ? GOOGLE_CLIENT_ID.replace(/.{20}$/, "***") : "NOT SET (Supabase manages this in its dashboard)",
    fix: !GOOGLE_CLIENT_ID ? "If you want to bypass Supabase and call Google directly, set GOOGLE_CLIENT_ID. Otherwise OAuth is configured in Supabase Dashboard → Authentication → Providers → Google." : undefined,
  });

  addCheck({
    status: GOOGLE_CLIENT_SECRET ? "pass" : "warn",
    label: "GOOGLE_CLIENT_SECRET (optional — only for direct Google API)",
    detail: GOOGLE_CLIENT_SECRET ? `${GOOGLE_CLIENT_SECRET.slice(0, 4)}***` : "NOT SET (Supabase manages this in its dashboard)",
  });
}

// ── 2. Supabase Settings endpoint ─────────────────────────────────
async function checkSupabaseSettings(): Promise<{ projectRef: string | null; googleEnabled: boolean; redirectUrl: string | null }> {
  if (!SUPABASE_URL || !ANON_KEY) {
    addCheck({
      status: "fail",
      label: "Supabase /auth/v1/settings reachable",
      detail: "Cannot probe — env vars missing",
    });
    return { projectRef: null, googleEnabled: false, redirectUrl: null };
  }

  const projectRef = SUPABASE_URL.replace(/^https?:\/\//, "").replace(".supabase.co", "");

  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/settings?apikey=${ANON_KEY}`, {
      headers: { apikey: ANON_KEY },
    });
    if (!res.ok) {
      addCheck({
        status: "fail",
        label: "Supabase /auth/v1/settings",
        detail: `HTTP ${res.status} ${res.statusText}`,
        fix: "Verify NEXT_PUBLIC_SUPABASE_URL and ANON_KEY are correct for the same project.",
      });
      return { projectRef, googleEnabled: false, redirectUrl: null };
    }
    const data = await res.json() as {
      external: { google?: { enabled?: boolean; client_id?: string } };
      redirect_url?: string;
    };

    const googleEnabled = !!data.external?.google?.enabled;
    const supabaseRedirectUrl = data.redirect_url;

    addCheck({
      status: "pass",
      label: "Supabase project reachable",
      detail: `${projectRef}.supabase.co → HTTP ${res.status}`,
    });

    addCheck({
      status: googleEnabled ? "pass" : "fail",
      label: "Google provider enabled in Supabase",
      detail: googleEnabled
        ? `✅ Enabled (client_id: ${data.external?.google?.client_id?.replace(/.{30}$/, "***") || "unknown"})`
        : "❌ NOT enabled",
      fix: !googleEnabled
        ? "Enable in Supabase Dashboard → Authentication → Providers → Google. Provide GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET from Google Cloud Console."
        : undefined,
    });

    if (supabaseRedirectUrl) {
      addCheck({
        status: "info",
        label: "Supabase → Your app redirect URL",
        detail: supabaseRedirectUrl,
        fix: !supabaseRedirectUrl.startsWith(SITE_URL)
          ? `This should point to ${SITE_URL}/auth/callback (currently configured: ${supabaseRedirectUrl}). Set Supabase Site URL to ${SITE_URL} and add ${SITE_URL}/auth/callback to Redirect URLs.`
          : `✅ Matches ${SITE_URL}/auth/callback`,
      });
    }

    return { projectRef, googleEnabled, redirectUrl: supabaseRedirectUrl ?? null };
  } catch (err) {
    addCheck({
      status: "fail",
      label: "Supabase /auth/v1/settings reachable",
      detail: `Network error: ${err instanceof Error ? err.message : String(err)}`,
      fix: "Check network/browser connectivity, and verify NEXT_PUBLIC_SUPABASE_URL is correct.",
    });
    return { projectRef, googleEnabled: false, redirectUrl: null };
  }
}

// ── 3. OAuth flow probe ──────────────────────────────────────────
async function checkOAuthFlow(projectRef: string | null) {
  if (!SUPABASE_URL || !projectRef) {
    addCheck({
      status: "warn",
      label: "OAuth flow probe",
      detail: "Skipped — could not reach Supabase",
    });
    return;
  }

  const redirectTo = `${SITE_URL}/auth/callback?next=/dashboard`;

  try {
    const params = new URLSearchParams({
      provider: "google",
      code_challenge: "test-challenge-ignored",
      code_challenge_method: "plain",
      redirect_to: redirectTo,
    });
    const url = `${SUPABASE_URL}/auth/v1/authorize?${params}`;

    const res = await fetch(url, { method: "GET", redirect: "manual" });
    const location = res.headers.get("location");

    if (res.status === 302 || res.status === 303 || res.status === 307) {
      addCheck({
        status: "pass",
        label: "OAuth flow → Supabase responds with redirect to Google",
        detail: `HTTP ${res.status}, Location: ${location?.slice(0, 100)}...`,
      });

      if (location?.includes("https://accounts.google.com/o/oauth2/v2/auth")) {
        addCheck({
          status: "pass",
          label: "Google OAuth endpoint reachable",
          detail: "https://accounts.google.com/o/oauth2/v2/auth",
        });

        const redirectUri = new URL(location).searchParams.get("redirect_uri");
        addCheck({
          status: redirectUri?.startsWith(SITE_URL) ? "pass" : "fail",
          label: "Google redirect_uri parameter matches SITE_URL",
          detail: redirectUri ? `${redirectUri.slice(0, 80)}...` : "❌ Missing",
          fix: redirectUri && !redirectUri.startsWith(SITE_URL)
            ? `Expected redirect_uri to start with ${SITE_URL}/auth/v1/callback (Supabase's own callback, not your app's). If Google rejects, the Supabase → Google redirect is wrong. Set Supabase Site URL to ${SITE_URL}.`
            : undefined,
        });
      } else if (location?.includes("error")) {
        addCheck({
          status: "fail",
          label: "Google OAuth endpoint reachable",
          detail: `Supabase redirect error: ${location.slice(0, 150)}`,
          fix: "Check that Supabase Site URL matches your app URL and Google provider is enabled.",
        });
      } else {
        addCheck({
          status: "warn",
          label: "Google OAuth endpoint reachable",
          detail: `Unexpected redirect: ${location?.slice(0, 100)}`,
        });
      }
    } else {
      addCheck({
        status: "fail",
        label: "OAuth flow → Supabase /auth/v1/authorize",
        detail: `HTTP ${res.status}: ${await res.text().then(t => t.slice(0, 200))}`,
        fix: "Verify Google provider is enabled in Supabase and NEXT_PUBLIC_SUPABASE_URL is correct.",
      });
    }
  } catch (err) {
    addCheck({
      status: "fail",
      label: "OAuth flow probe",
      detail: `Network error: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

// ── 4. Console checklist ──────────────────────────────────────────
function printConsoleChecklist(googleEnabled: boolean) {
  console.log("\n─────────────────────────────────────────────────────────────");
  console.log("Manual Checklist — verify in BOTH dashboards");
  console.log("─────────────────────────────────────────────────────────────\n");

  console.log("📋 Supabase Dashboard (https://app.supabase.com)");
  console.log(`   1. Authentication → URL Configuration`);
  console.log(`      • Site URL: ${SITE_URL}`);
  console.log(`      • Redirect URLs (one per line):`);
  console.log(`          ${SITE_URL}/auth/callback`);
  console.log(`          ${SITE_URL}/**           (wildcard for all paths)`);
  console.log(`   2. Authentication → Providers → Google:`);
  console.log(`      • Enabled: ${googleEnabled ? "✅" : "❌ TURN ON"}`);
  console.log(`      • Client ID: from Google Cloud Console (matches GOOGLE_CLIENT_ID in Supabase)`);
  console.log(`      • Secret:   from Google Cloud Console`);
  console.log(`      • Redirect URL (shown by Supabase): https://YOUR-PROJECT.supabase.co/auth/v1/callback`);
  console.log("");

  console.log("📋 Google Cloud Console (https://console.cloud.google.com)");
  console.log("   1. APIs & Services → OAuth consent screen");
  console.log("      • User type: External");
  console.log("      • Publishing status: must NOT block @gmail.com users");
  console.log("      • App domain: courssy.com");
  console.log("      • Authorized domains: supabase.co, courssy.com");
  console.log("   2. APIs & Services → Credentials → OAuth 2.0 Client IDs");
  console.log("      • Authorized JavaScript origins:");
  console.log(`          ${SITE_URL}`);
  console.log(`          https://YOUR-PROJECT.supabase.co`);
  console.log("      • Authorized redirect URIs:");
  console.log("          https://YOUR-PROJECT.supabase.co/auth/v1/callback");
  console.log("          (NEVER add your app's /auth/callback here — only the Supabase one)");
  console.log("");
}

// ── Report ────────────────────────────────────────────────────────
function report() {
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("🔍 OAuth Diagnostic — Google Sign-In");
  console.log("═══════════════════════════════════════════════════════════════\n");

  for (const c of checks) {
    const icon =
      c.status === "pass" ? "✅"
      : c.status === "fail" ? "❌"
      : c.status === "warn" ? "⚠️ "
      : "ℹ️ ";
    console.log(`${icon}  ${c.label}`);
    console.log(`     ${c.detail}`);
    if (c.fix) console.log(`     🔧 FIX: ${c.fix}`);
    console.log("");
  }

  const failures = checks.filter(c => c.status === "fail");
  const warnings = checks.filter(c => c.status === "warn");

  console.log("═══════════════════════════════════════════════════════════════");
  if (failures.length === 0 && warnings.length === 0) {
    console.log("🎉 All checks passed. If Google OAuth still fails,");
    console.log("   verify the Manual Checklist below in BOTH dashboards.");
  } else if (failures.length > 0) {
    console.log(`⛔ ${failures.length} critical issue${failures.length > 1 ? "s" : ""} found`);
    console.log("   The OAuth flow will NOT work until these are resolved.");
  } else {
    console.log(`⚠️  ${warnings.length} warning${warnings.length > 1 ? "s" : ""}`);
  }
  console.log("═══════════════════════════════════════════════════════════════");
}

async function main() {
  await loadEnvFiles();

  console.log(`\n📍 Probing: SUPABASE_URL=${SUPABASE_URL ?? "NOT SET"}`);
  console.log(`📍 SITE_URL=${SITE_URL}\n`);

  checkEnvVars();
  const { projectRef, googleEnabled } = await checkSupabaseSettings();
  await checkOAuthFlow(projectRef);

  report();
  printConsoleChecklist(googleEnabled);

  const failures = checks.filter(c => c.status === "fail");
  process.exit(failures.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("\n💥 Diagnostic crashed:", err);
  process.exit(1);
});
