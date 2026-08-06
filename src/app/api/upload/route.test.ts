/**
 * PARTE 3 di 3 upload cleanup — regression tests.
 *
 * Lock-in dei tre invariants introdotti in PARTE 1/2:
 *   (a) bucket missing → 500 fail-fast, NO `createBucket` retry runtime.
 *   (b) file > MAX_UPLOAD_BYTES → 413, nessuna bufferizzazione (`file.arrayBuffer()`
 *       non viene chiamata) e nessun upload.
 *   (c) happy path → 200 con `publicUrl`.
 *
 * Mock strategy:
 *   - `requireAdmin` → controllo diretto via mock fn (null = admin OK).
 *   - `getSupabaseAdmin` → fake client con `storage.from().upload()`.
 *   - `withRateLimit` → pass-through (rate-limit coperto da test dedicati).
 *   - File → stub object con `size`/`type`/`name`/`arrayBuffer` (no Node File).
 *   - `vi.resetModules()` in `beforeEach` → ricarica il modulo route ad ogni
 *     test così `MAX_UPLOAD_BYTES = getUploadMaxBytes()` viene rivalutato
 *     dopo lo stub di `process.env.UPLOAD_MAX_BYTES` (env-driven module-
 *     level constant). Senza resetModules il modulo è cached e la costante
 *     riflette l'env del primo import.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

// ─── Module mocks (Vitest auto-hoisted) ─────────────────────

const mockRequireAdmin = vi.fn();
vi.mock("@/domains/identity", () => ({
  requireAdmin: mockRequireAdmin,
}));

const mockGetSupabaseAdmin = vi.fn();
vi.mock("@/lib/db/supabase", () => ({
  getSupabaseAdmin: mockGetSupabaseAdmin,
}));

// Pass-through wrapper: i test non coprono rate-limit qui (ci sono suite dedicate).
vi.mock("@/lib/utils/rate-limit", () => ({
  withRateLimit: (handler: unknown): unknown => handler,
  rateLimitAsync: vi.fn(),
  rateLimit: vi.fn(),
  RATE_TIERS: { AUTH: { max: 30, windowMs: 60_000 } },
}));

// ─── Helpers ────────────────────────────────────────────────

interface FileStub {
  size: number;
  type: string;
  name: string;
  arrayBuffer: () => Promise<ArrayBuffer>;
}

function makeFileStub(opts: {
  size?: number;
  type?: string;
  name?: string;
  bytes?: ArrayBuffer;
}): FileStub {
  const bytes = opts.bytes ?? new ArrayBuffer(opts.size ?? 1024);
  return {
    size: opts.size ?? bytes.byteLength,
    type: opts.type ?? "image/png",
    name: opts.name ?? "fake.png",
    arrayBuffer: vi.fn().mockResolvedValue(bytes),
  };
}

/**
 * Build a minimal `NextRequest`-shaped stub that the route's `request.formData()`
 * can consume. The route calls only `formData().get("file")` so the stub
 * exposes just `.formData()` and a FormData-shaped `{ get }` accessor — no
 * need to construct a real `Request`/`FormData` polyfill under Vitest.
 */
function buildFormDataRequest(file: FileStub | null): NextRequest {
  const formDataMock = {
    get: vi.fn((key: string) => (key === "file" ? file : null)),
  };
  return {
    formData: vi.fn().mockResolvedValue(formDataMock),
  } as unknown as NextRequest;
}

const BUCKET = "covers";
const PUBLIC_URL =
  "https://fake.supabase.co/storage/v1/object/public/covers/products/1700000000000-abc1234.png";

// ─── Setup ──────────────────────────────────────────────────

beforeEach(() => {
  vi.resetAllMocks();
  // CRITICAL: re-evaluation module-level `const MAX_UPLOAD_BYTES = getUploadMaxBytes()`.
  vi.resetModules();
  // default 10 MB — tests che vogliono cap custom lo sovrascrivono prima dell'import.
  delete process.env.UPLOAD_MAX_BYTES;
});

// ─── Tests ───────────────────────────────────────────────────
//
// Ogni test begins with `expect(mockRequireAdmin).toHaveBeenCalledTimes(1)`
// per lock-in dell'admin-first invariant: il requireAdmin gate precede
// size check, type check, e upload in route.ts. Se un futuro refactor
// riordinasse questi gate (es. spostando size check prima di admin),
// la assertion cattura l'inversione di priorità che permetterebbe a
// richieste non-autenticate di consumare la size validation.
//

describe("POST /api/upload", () => {
  // ── (a) Bucket missing → 500 fail-fast ─────────────────────
  it("(a) returns 500 on bucket missing (fail-fast, NO createBucket retry)", async () => {
    mockRequireAdmin.mockResolvedValueOnce(null); // admin OK
    // Default 10 MB cap, file sotto cap.
    const fileStub = makeFileStub({ size: 50_000, type: "image/png" });
    const request = buildFormDataRequest(fileStub);

    const mockFrom = vi.fn();
    const mockUpload = vi.fn().mockResolvedValueOnce({
      error: {
        name: "StorageError",
        statusCode: "404",
        message: "Bucket not found",
      },
    });
    const mockGetPublicUrl = vi.fn();
    mockGetSupabaseAdmin.mockReturnValueOnce({
      storage: { from: mockFrom },
    });
    // `from()` invoked only once here — upload fails with 404 → route
    // short-circuits to 500 before `.getPublicUrl()`. mockReturnValueOnce
    // is precise (vs test (c) happy-path which needs stable mockReturnValue
    // because `from()` is called twice there).
    mockFrom.mockReturnValueOnce({
      upload: mockUpload,
      getPublicUrl: mockGetPublicUrl,
    });

    const { POST } = await import("./route");
    const response = await POST(request);

    // admin gate runs first (precedes any other validation/upload).
    expect(mockRequireAdmin).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toMatch(/Storage upload fallito/);
    expect(body.error).toMatch(/CONFIGURAZIONE/);
    expect(body.error).toMatch(/scripts\/supabase\/setup-storage\.sql/);
    // CRITICAL invariant: `upload()` called exactly ONCE. A pre-PARTE-1 retry
    // path would have called it twice (original 404 + post-createBucket retry).
    expect(mockUpload).toHaveBeenCalledTimes(1);
    expect(mockFrom).toHaveBeenCalledTimes(1);
    expect(mockFrom).toHaveBeenCalledWith(BUCKET);
  });

  // ── (b) File > UPLOAD_MAX_BYTES → 413 ──────────────────────
  it("(b) returns 413 when file size > UPLOAD_MAX_BYTES (no bufferization, no upload)", async () => {
    process.env.UPLOAD_MAX_BYTES = "100"; // 100 byte cap
    mockRequireAdmin.mockResolvedValueOnce(null); // admin OK

    const fileStub = makeFileStub({ size: 200, type: "image/png" }); // > 100
    const request = buildFormDataRequest(fileStub);

    const { POST } = await import("./route");
    const response = await POST(request);

    // admin gate runs first (before size check).
    expect(mockRequireAdmin).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(413);
    const body = await response.json();
    expect(body.error).toMatch(/File troppo grande/i);
    expect(body.error).toMatch(/UPLOAD_MAX_BYTES/);
    // Fail-fast criteria: short-circuit MUST happen before buffer allocation
    // and before any Supabase call.
    expect(fileStub.arrayBuffer).not.toHaveBeenCalled();
    expect(mockGetSupabaseAdmin).not.toHaveBeenCalled();
  });

  // ── (c) Happy path → 200 + publicUrl ────────────────────────
  it("(c) returns 200 with publicUrl on valid upload", async () => {
    mockRequireAdmin.mockResolvedValueOnce(null); // admin OK

    const fileStub = makeFileStub({ size: 50_000, type: "image/png" });
    const request = buildFormDataRequest(fileStub);

    const mockFrom = vi.fn();
    const mockUpload = vi.fn().mockResolvedValueOnce({ error: null });
    const mockGetPublicUrl = vi.fn().mockReturnValueOnce({
      data: { publicUrl: PUBLIC_URL },
    });
    mockGetSupabaseAdmin.mockReturnValueOnce({
      storage: { from: mockFrom },
    });
    // `from()` is called TWICE in this codepath: once before `.upload()` and
    // once before `.getPublicUrl()`. mockReturnValueOnce would return
    // undefined on the second call, so use stable object identity.
    mockFrom.mockReturnValue({
      upload: mockUpload,
      getPublicUrl: mockGetPublicUrl,
    });

    const { POST } = await import("./route");
    const response = await POST(request);

    // admin gate runs first (precedes upload/getPublicUrl).
    expect(mockRequireAdmin).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.url).toBe(PUBLIC_URL);
    expect(mockUpload).toHaveBeenCalledTimes(1);
    // Bufferize happened exactly once → arrayBuffer was called.
    expect(fileStub.arrayBuffer).toHaveBeenCalledTimes(1);
  });
});
