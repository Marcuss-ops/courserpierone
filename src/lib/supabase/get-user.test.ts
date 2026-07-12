/**
 * Tests for `getServerUser` — Phase 1.2 addendum (Accept-Language signup backfill).
 *
 * Covers:
 *   1. anon/session-error → null user, null dbUser (no DB hit)
 *   2. auth error → null everything
 *   3. new user + Accept-Language "it-IT,it;q=0.9" → create branch sets preferredLocale="it"
 *   4. new user + Accept-Language "en-US,en;q=0.9" → preferredLocale="en"
 *   5. new user + Accept-Language "fr-FR,fr;q=0.9" → preferredLocale="fr"
 *   6. new user + NO Accept-Language → preferredLocale OMITTED in create.data
 *      (Prisma @default("en") kicks in)
 *   7. existing user + Accept-Language → update branch does NOT touch preferredLocale
 *   8. next/headers() throws (CLI scripts / migration runner scope) →
 *      create branch still proceeds, preferredLocale OMITTED (defensive fallback)
 *
 * Pattern: vi.mock hoisted for `next/headers`, vi.mock for Supabase,
 * vi.mock for Prisma. Supabase env pre-set in beforeEach.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock next/headers BEFORE importing get-user ─────────────
// vi.hoisted because vi.mock is hoisted above all imports.
const mocks = vi.hoisted(() => ({
  getAcceptLanguage: () => null as string | null,
  throwOnHeaders: false,
}));

vi.mock("next/headers", () => ({
  // `await headers()` (production) awaits whatever this returns. Sync
  // mock returning a Headers-like object also awaits to the same value.
  headers: () => {
    if (mocks.throwOnHeaders) {
      throw new Error("next/headers called outside request scope");
    }
    return {
      get: (name: string) =>
        name === "accept-language" ? mocks.getAcceptLanguage() : null,
    };
  },
}));

// ─── Mock Supabase server client (control session outcome) ────
const mockGetUser = vi.fn();
vi.mock("./server", () => ({
  createClient: () => ({
    auth: { getUser: mockGetUser },
  }),
}));

// ─── Mock Prisma client (track upsert calls + control result) ─
const mockUpsert = vi.fn();
vi.mock("@/lib/db/prisma", () => ({
  prisma: { user: { upsert: mockUpsert } },
}));

// ─── Supabase env precondition ────────────────────────────────
beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
});

// ─── Test fixture helpers ─────────────────────────────────────
function setAuth(email: string, metadata?: Record<string, unknown>) {
  mockGetUser.mockResolvedValue({
    data: { user: { email, user_metadata: metadata ?? {} } },
    error: null,
  });
}

function resetMocks() {
  vi.clearAllMocks();
  mocks.getAcceptLanguage = () => null;
  mocks.throwOnHeaders = false;
  // Default: upsert returns existing user (update-branch scenario).
  mockUpsert.mockResolvedValue({
    id: "user-existing",
    email: "existing@example.com",
    name: "Existing",
    role: "student",
    preferredLocale: "en",
  });
}

// ─── Tests ────────────────────────────────────────────────────
describe("getServerUser — Phase 1.2 addendum (Accept-Language signup backfill)", () => {
  beforeEach(resetMocks);

  it("returns null user and dbUser when session has no email", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    const { getServerUser } = await import("./get-user");
    const result = await getServerUser();
    expect(result.user).toBeNull();
    expect(result.dbUser).toBeNull();
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("returns null user and dbUser when auth.getUser errors", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: "session expired" },
    });
    const { getServerUser } = await import("./get-user");
    const result = await getServerUser();
    expect(result.user).toBeNull();
    expect(result.dbUser).toBeNull();
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("sets preferredLocale='it' for new user with Accept-Language 'it-IT,it;q=0.9'", async () => {
    setAuth("newitalian@example.com");
    mocks.getAcceptLanguage = () => "it-IT,it;q=0.9,en;q=0.8";
    mockUpsert.mockResolvedValueOnce({
      id: "user-new",
      email: "newitalian@example.com",
      preferredLocale: "it",
    });

    const { getServerUser } = await import("./get-user");
    const result = await getServerUser();

    expect(mockUpsert).toHaveBeenCalledOnce();
    const callArg = mockUpsert.mock.calls[0][0];
    expect(callArg.create).toMatchObject({
      email: "newitalian@example.com",
      preferredLocale: "it",
      role: "student",
    });
    expect(result.dbUser?.id).toBe("user-new");
  });

  it("sets preferredLocale='en' for new user with Accept-Language 'en-US,en;q=0.9'", async () => {
    setAuth("newuser@example.com");
    mocks.getAcceptLanguage = () => "en-US,en;q=0.9,fr;q=0.8";
    mockUpsert.mockResolvedValueOnce({ id: "user-new-en" });

    const { getServerUser } = await import("./get-user");
    await getServerUser();

    expect(mockUpsert.mock.calls[0][0].create.preferredLocale).toBe("en");
  });

  it("sets preferredLocale='fr' for new user with Accept-Language 'fr-FR,fr;q=0.9'", async () => {
    setAuth("newfrench@example.com");
    mocks.getAcceptLanguage = () => "fr-FR,fr;q=0.9";
    mockUpsert.mockResolvedValueOnce({ id: "user-new-fr" });

    const { getServerUser } = await import("./get-user");
    await getServerUser();

    expect(mockUpsert.mock.calls[0][0].create.preferredLocale).toBe("fr");
  });

  it("OMITS preferredLocale from create.data when Accept-Language header is absent (Prisma @default('en') takes over)", async () => {
    setAuth("newuser@example.com");
    mocks.getAcceptLanguage = () => null;
    mockUpsert.mockResolvedValueOnce({ id: "user-noheader" });

    const { getServerUser } = await import("./get-user");
    await getServerUser();

    const callArg = mockUpsert.mock.calls[0][0];
    expect("preferredLocale" in callArg.create).toBe(false);
  });

  it("does NOT include preferredLocale in update branch (preserves user choice)", async () => {
    setAuth("existing@example.com", { full_name: "Updated Name" });
    mocks.getAcceptLanguage = () => "it-IT";
    mockUpsert.mockResolvedValueOnce({
      id: "user-existing",
      email: "existing@example.com",
      preferredLocale: "en",
    });

    const { getServerUser } = await import("./get-user");
    await getServerUser();

    const callArg = mockUpsert.mock.calls[0][0];
    expect(callArg.update).toEqual({ name: "Updated Name" });
    expect("preferredLocale" in callArg.update).toBe(false);
  });

  it("falls back to schema @default when next/headers() throws (CLI/migration scope)", async () => {
    // next/headers() lancia quando chiamato fuori da request scope
    // (es. CLI scripts, migration runner). Il try/catch difensivo nel
    // getServerUser deve lasciare che il flusso proceda senza
    // preferredLocale in create.data, così Prisma @default("en")
    // kicks in.
    setAuth("newcli@example.com");
    mocks.throwOnHeaders = true;
    mockUpsert.mockResolvedValueOnce({ id: "user-cli" });

    const { getServerUser } = await import("./get-user");
    const result = await getServerUser();

    expect(result.dbUser?.id).toBe("user-cli");
    const callArg = mockUpsert.mock.calls[0][0];
    expect("preferredLocale" in callArg.create).toBe(false);
  });

  // ─── Schema drop regression ─────────────────────────────────
  // Post-migration `20260712220000_drop_nextauth_models` i modelli
  // Account, Session, VerificationToken sono stati rimossi da
  // Prisma schema. Questo test asserisce che getServerUser continua
  // a funzionare happy-path dopo il drop, senza riferimenti runtime
  // alle tabelle rimosse.
  //
  // Meccanismo di asserzione: i mocks sopra espongono SOLO
  // `prisma.user.upsert` — nessun mock di `prisma.account`,
  // `prisma.session`, `prisma.verificationToken`. Se getServerUser
  // tentasse di leggere/scrivere una di queste tabelle,
  // lancierebbe loudmente con "method not found" quando la catena
  // prova ad accedere al mock mancante. L'happy-path asserts sotto
  // NON devono throware, confermando che il drop è trasparente
  // per il codice del consumer.
  it("smoke regression: getServerUser works post-NextAuth-models-drop (Account, Session, VerificationToken removed)", async () => {
    setAuth("postdrop@example.com");
    mocks.getAcceptLanguage = () => "it-IT";
    mockUpsert.mockResolvedValueOnce({
      id: "user-postdrop",
      email: "postdrop@example.com",
      preferredLocale: "it",
    });

    const { getServerUser } = await import("./get-user");
    const result = await getServerUser();

    expect(result.user?.email).toBe("postdrop@example.com");
    expect(result.dbUser?.id).toBe("user-postdrop");
    expect(result.dbUser?.preferredLocale).toBe("it");
    expect(mockUpsert).toHaveBeenCalledOnce();
  });
});
