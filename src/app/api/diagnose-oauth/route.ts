/**
 * GET /api/diagnose-oauth
 *
 * Web-accessible OAuth diagnostic that probes:
 *   - Env vars (Supabase URL + ANON key)
 *   - Supabase /auth/v1/settings (Google provider enabled?)
 *   - Full OAuth redirect chain (Supabase → Google) to verify redirect_uri
 *
 * AUTH: requires `Authorization: Bearer ${CRON_SECRET}` header.
 * This prevents attackers from fingerprinting the Supabase project.
 *
 * Usage:
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://www.courssy.com/api/diagnose-oauth | jq
 */

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

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
const SITE_URL =
  process.env.NEXT_PUBLIC_APP_URL
  || process.env.SITE_URL
  || "https://www.courssy.com";
const CRON_SECRET = process.env.CRON_SECRET;

function bearerMatches(provided: string, expected: string): boolean {
  if (!expected) return false;
  // Length must match for timingSafeEqual
  if (provided.length !== expected.length) return false;
  // Constant-time comparison to prevent byte-by-byte timing attacks
  try {
    return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  // ── Gate: require CRON_SECRET bearer token (constant-time) ──
  const authHeader = request.headers.get("authorization") ?? "";
  const provided = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";
  if (!CRON_SECRET || !bearerMatches(provided, CRON_SECRET)) {
    return NextResponse.json(
      { error: "Unauthorized — provide `Authorization: Bearer ${CRON_SECRET}`" },
      { status: 401 }
    );
  }

  const checks: Check[] = [];

  checks.push({
    status: SUPABASE_URL ? "info" : "fail",
    label: "NEXT_PUBLIC_SUPABASE_URL env var",
    detail: SUPABASE_URL ?? "NOT SET",
    fix: !SUPABASE_URL ? "Set in Vercel → Settings → Environment Variables" : undefined,
  });

  checks.push({
    status: ANON_KEY ? "info" : "fail",
    label: "NEXT_PUBLIC_SUPABASE_ANON_KEY env var",
    detail: ANON_KEY ? `${ANON_KEY.slice(0, 12)}…${ANON_KEY.slice(-6)}` : "NOT SET",
  });

  if (!SUPABASE_URL || !ANON_KEY) {
    return NextResponse.json({
      ok: false,
      siteUrl: SITE_URL,
      checks,
      checklist: generateChecklist(null, false),
    });
  }

  const projectRef = SUPABASE_URL.replace(/^https?:\/\//, "").replace(".supabase.co", "");
  let googleEnabled = false;
  let supabaseRedirectUrl: string | null = null;
  let googleClientId: string | null = null;

  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/settings?apikey=${ANON_KEY}`, {
      headers: { apikey: ANON_KEY },
    });
    if (res.ok) {
      const data = await res.json() as {
        external?: { google?: { enabled?: boolean; client_id?: string } };
        redirect_url?: string;
      };
      googleEnabled = !!data.external?.google?.enabled;
      googleClientId = data.external?.google?.client_id ?? null;
      supabaseRedirectUrl = data.redirect_url ?? null;

      checks.push({
        status: "pass",
        label: "Supabase project reachable",
        detail: `${projectRef}.supabase.co (HTTP ${res.status})`,
      });

      checks.push({
        status: googleEnabled ? "pass" : "fail",
        label: "Google provider enabled in Supabase",
        detail: googleEnabled
          ? `Enabled (client_id: ${googleClientId?.slice(0, 20) ?? "unknown"}…)`
          : "NOT enabled",
        fix: !googleEnabled
          ? "Enable in Supabase Dashboard → Authentication → Providers → Google. Provide GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET from Google Cloud Console."
          : undefined,
      });

      if (supabaseRedirectUrl) {
        const matches = supabaseRedirectUrl.startsWith(SITE_URL);
        checks.push({
          status: matches ? "pass" : "fail",
          label: "Supabase redirect URL matches SITE_URL",
          detail: `${supabaseRedirectUrl} ${matches ? "✅" : `(expected: ${SITE_URL}/auth/callback)`}`,
          fix: !matches
            ? `Set Supabase Site URL = ${SITE_URL} and add ${SITE_URL}/auth/callback to Redirect URLs`
            : undefined,
        });
      }
    } else {
      checks.push({
        status: "fail",
        label: "Supabase /auth/v1/settings",
        detail: `HTTP ${res.status} ${res.statusText}`,
        fix: "Verify NEXT_PUBLIC_SUPABASE_URL and ANON_KEY match the same Supabase project",
      });
    }
  } catch (err) {
    checks.push({
      status: "fail",
      label: "Supabase reachable",
      detail: `Network error: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  // Probe the OAuth flow by following the real redirect chain
  try {
    const params = new URLSearchParams({
      provider: "google",
      code_challenge: "diagnostic-challenge",
      code_challenge_method: "plain",
      redirect_to: `${SITE_URL}/auth/callback?next=/dashboard`,
    });
    const url = `${SUPABASE_URL}/auth/v1/authorize?${params}`;
    const res = await fetch(url, { method: "GET", redirect: "follow" });
    const finalUrl = res.url;

    if (finalUrl.includes("accounts.google.com/o/oauth2")) {
      checks.push({
        status: "pass",
        label: "OAuth flow: Supabase → Google redirect chain works",
        detail: finalUrl.slice(0, 120) + "…",
      });

      // Extract redirect_uri Google receives from Supabase
      const redirectUri = new URL(finalUrl).searchParams.get("redirect_uri");
      if (redirectUri) {
        const matchesSupabase = redirectUri.endsWith(".supabase.co/auth/v1/callback");
        checks.push({
          status: matchesSupabase ? "pass" : "warn",
          label: "Supabase → Google redirect_uri format",
          detail: redirectUri,
          fix: !matchesSupabase
            ? `Expected https://${projectRef}.supabase.co/auth/v1/callback (this is what Supabase gives Google). Your app's /auth/callback is configured separately in Supabase URL Configuration.`
            : undefined,
        });
      }

      // Extract scope
      const scope = new URL(finalUrl).searchParams.get("scope");
      checks.push({
        status: scope ? "pass" : "warn",
        label: "OAuth scopes requested by Supabase",
        detail: scope ?? "(no scope param — Supabase may not have included it)",
      });
    } else if (finalUrl.includes("/login") || finalUrl.includes("/auth/v1/error")) {
      checks.push({
        status: "fail",
        label: "OAuth flow",
        detail: `Landed on ${finalUrl.slice(0, 100)} instead of Google`,
        fix: "Google provider may not be configured correctly. Check Supabase → Providers → Google and Site URL.",
      });
    } else {
      checks.push({
        status: "warn",
        label: "OAuth flow",
        detail: `Unexpected final URL: ${finalUrl.slice(0, 100)}`,
      });
    }
  } catch (err) {
    checks.push({
      status: "warn",
      label: "OAuth flow probe",
      detail: `Network error: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  const failures = checks.filter(c => c.status === "fail").length;
  return NextResponse.json({
    ok: failures === 0,
    siteUrl: SITE_URL,
    supabaseProject: projectRef,
    googleEnabled,
    googleClientIdPresent: !!googleClientId,
    supabaseRedirectUrl,
    checks,
    checklist: generateChecklist(projectRef, googleEnabled),
    timestamp: new Date().toISOString(),
  });
}

function generateChecklist(projectRef: string | null, googleEnabled: boolean) {
  return {
    supabase_dashboard: [
      `Authentication → URL Configuration`,
      `  • Site URL: ${SITE_URL}`,
      `  • Redirect URLs (one per line):`,
      `    ${SITE_URL}/auth/callback`,
      `    ${SITE_URL}/**`,
      `Authentication → Providers → Google`,
      `  • Enabled: ${googleEnabled ? "✅" : "❌ TURN ON"}`,
      `  • Client ID: from Google Cloud Console`,
      `  • Secret: from Google Cloud Console`,
    ],
    google_cloud_console: [
      `Project: console.cloud.google.com → select your project`,
      `APIs & Services → OAuth consent screen`,
      `  • User type: External`,
      `  • Publishing status: must NOT block @gmail.com users (or add your test email as a Test user)`,
      `  • Authorized domains: supabase.co, courssy.com`,
      `APIs & Services → Credentials → OAuth 2.0 Client IDs (type: Web application)`,
      `  • Authorized JavaScript origins:`,
      `    ${SITE_URL}`,
      `    https://${projectRef ?? "YOUR-PROJECT"}.supabase.co`,
      `  • Authorized redirect URIs (CRITICAL):`,
      `    https://${projectRef ?? "YOUR-PROJECT"}.supabase.co/auth/v1/callback`,
      `    (NOT your app's /auth/callback — only Supabase's)`,
    ],
    how_to_call_this_endpoint: [
      `curl -H "Authorization: Bearer \\$CRON_SECRET" https://www.courssy.com/api/diagnose-oauth | jq`,
    ],
  };
}
