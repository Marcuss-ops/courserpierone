import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase Admin API helpers for E2E journey tests.
 *
 * Why admin API?
 *   The auth-form.tsx client component relies on `signUpWithPassword` or
 *   `signInWithPassword`. By creating the test user via admin API with
 *   `email_confirm: true`, we bypass the email confirmation step AND let
 *   the journey test exercise the real login UI path (signInWithPassword)
 *   rather than simulating the signup confirmation flow.
 *
 * Skip-pattern:
 *   If `SUPABASE_SERVICE_ROLE_KEY` or `NEXT_PUBLIC_SUPABASE_URL` is missing,
 *   `getSupabaseAdmin()` throws a descriptive error so the calling test
 *   can wrap the creation in `test.skip(...)` at the file level.
 */

let _admin: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (_admin) return _admin;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Supabase test admin credentials missing: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required for journey E2E tests. Set them in .env or skip."
    );
  }

  _admin = createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return _admin;
}

export async function signUpTestUser(
  email: string,
  password: string
): Promise<{ id: string; email: string }> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // bypass email confirmation
  });

  if (error || !data.user) {
    throw new Error(
      `Failed to create test Supabase user ${email}: ${error?.message ?? "unknown error"}`
    );
  }

  return { id: data.user.id, email: data.user.email! };
}

export async function deleteSupabaseUserById(userId: string): Promise<void> {
  const admin = getSupabaseAdmin();
  try {
    await admin.auth.admin.deleteUser(userId);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);

    // 404 / "not found" / 410 are acceptable — user was already deleted by a
    // concurrent cleanup; do nothing.
    const isAlreadyGone =
      message.includes("not found") ||
      message.includes("404") ||
      message.includes("410");

    if (isAlreadyGone) {
      return;
    }

    // Anything else (5xx, 429 rate-limit, permission denied) is a real failure.
    // Log a warning so the test reporter surfaces it in stdout, but do not
    // propagate: we don't want a stuck cleanup to flip a passing test into a
    // failure. Test-side annotations on `test.info()` could improve visibility
    // for failure reporters, but the helper does not carry a Playwright test
    // reference (kept Playwright-agnostic by design).
    console.warn(
      `[supabase-auth] deleteUser(${userId}) failed with non-404 error: ${message}`
    );
  }
}
