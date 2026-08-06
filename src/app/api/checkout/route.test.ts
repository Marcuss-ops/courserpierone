/**
 * Tests for POST /api/checkout.
 *
 * Step 10 — Route-level test for the centralized "published products
 * only" gate. The route doesn't add its own status check anymore —
 * `apiError(response)` propagates the orchestrator's typed error. So
 * the suite covers:
 *   - 400 with code "PRODUCT_NOT_PUBLISHED" when orchestrator denies
 *     (draft, archived — same code path exposed).
 *   - 200 with `{ url }` on the published success path.
 *   - 404 NOT_FOUND when the route's pre-check `findFirst` misses
 *     (race: the route catches this BEFORE the orchestrator runs).
 *   - 400 with code "CHECKOUT_ERROR" for the unchanged fallthrough
 *     (e.g. published but no lemonVariantId — regression guard).
 *   - 400 validation_error when productId is missing in body.
 *   - Authenticated path uses `dbUser.email` (set on the orchestrator
 *     call) when body does not carry an email.
 *
 * Mocking architecture:
 *   - `prisma.product.findFirst` → mock the route's pre-check.
 *   - `PricingService`/`CheckoutService` mocked as classes whose
 *     methods are pre-set mock functions (so the `new` instance inside
 *     the route module picks them up).
 *   - `getServerUser` mocked per-test.
 *   - `withRateLimit` mocked to pass-through so tests call the inner
 *     handler directly.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockRequest } from "@/app/api/__test-helpers__/mock-request";

const {
  mockPrismaFindFirst,
  mockPricingResolve,
  mockPricingValidate,
  mockCreateCheckout,
  mockGetServerUser,
} = vi.hoisted(() => ({
  mockPrismaFindFirst: vi.fn(),
  mockPricingResolve: vi.fn(),
  mockPricingValidate: vi.fn(),
  mockCreateCheckout: vi.fn(),
  mockGetServerUser: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: { product: { findFirst: mockPrismaFindFirst } },
}));

vi.mock("@/lib/supabase/get-user", () => ({
  getServerUser: mockGetServerUser,
}));

vi.mock("@/lib/utils/rate-limit", () => ({
  withRateLimit: (fn: (...args: unknown[]) => unknown) => fn,
}));

vi.mock("@/lib/commerce/checkout/pricing", () => ({
  PricingService: class {
    resolve = mockPricingResolve;
    validateProvider = mockPricingValidate;
  },
}));

vi.mock("@/lib/commerce/checkout/create-checkout", () => ({
  CheckoutService: class {
    createCheckout = mockCreateCheckout;
  },
}));

import { ProductNotPublishedError, CheckoutError, NotFoundError } from "@/lib/errors";

const PRODUCT_ID = "prod-1";
const VALID_BODY = { productId: PRODUCT_ID, locale: "it-it" };

// ─── Default fixture helpers ──────────────────────────────────────
function setAuthenticatedUser(email = "buyer@test.com") {
  mockGetServerUser.mockResolvedValue({
    user: { email },
    dbUser: { id: "u-1", email },
  });
}

function setProductFoundInRoute() {
  mockPrismaFindFirst.mockResolvedValue({
    id: PRODUCT_ID,
    slug: "course-a",
    lemonVariantId: "var-1",
    price: 9900,
    currency: "eur",
    pricesByCurrency: null,
    countryOverrides: null,
  });
}

function setPricingOk() {
  mockPricingResolve.mockReturnValue({
    lemonVariantId: "var-1",
    discountCode: undefined,
  });
  mockPricingValidate.mockReturnValue(undefined);
}

function setOrchestratorOk() {
  mockCreateCheckout.mockResolvedValue({
    url: "https://ls.test/checkout/abc",
    provider: "lemonsqueezy",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  setAuthenticatedUser();
  setProductFoundInRoute();
  setPricingOk();
  setOrchestratorOk();
});

// ─── Tests ─────────────────────────────────────────────────────────
describe("POST /api/checkout — product.status SSOT gate", () => {
  it("returns 400 PRODUCT_NOT_PUBLISHED when orchestrator rejects draft product", async () => {
    // The orchestrator does the actual re-read — the route just passes
    // whatever error up. Simulate the orchestrator's denial.
    mockCreateCheckout.mockRejectedValueOnce(new ProductNotPublishedError());

    const { POST } = await import("./route");
    const res = await POST(
      createMockRequest("/api/checkout", { method: "POST", body: VALID_BODY }),
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe("PRODUCT_NOT_PUBLISHED");
    expect(body.error).toMatch(/non.*disponibile/i);
  });

  it("returns 400 PRODUCT_NOT_PUBLISHED when orchestrator rejects archived product", async () => {
    mockCreateCheckout.mockRejectedValueOnce(
      new ProductNotPublishedError("archived"),
    );

    const { POST } = await import("./route");
    const res = await POST(
      createMockRequest("/api/checkout", { method: "POST", body: VALID_BODY }),
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe("PRODUCT_NOT_PUBLISHED");
  });

  it("returns 200 with {url} when product is published", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      createMockRequest("/api/checkout", { method: "POST", body: VALID_BODY }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ url: "https://ls.test/checkout/abc" });
    expect(mockCreateCheckout).toHaveBeenCalledTimes(1);
  });

  it("returns 404 when route's pre-check `product.findUnique` returns null", async () => {
    // Race / never-existed: the route's initial `findFirst` fails
    // BEFORE reaching the orchestrator. Both NotFoundError thrown by
    // the route and the orchestrator's defensive re-read converge to 404
    // via apiErrorResponse.
    mockPrismaFindFirst.mockResolvedValueOnce(null);

    const { POST } = await import("./route");
    const res = await POST(
      createMockRequest("/api/checkout", { method: "POST", body: VALID_BODY }),
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.code).toBe("NOT_FOUND");
    expect(mockCreateCheckout).not.toHaveBeenCalled();
  });

  it("returns 400 with PRICING_ERROR when published but no lemonVariantId", async () => {
    // Regression-guard for the unchanged fallthrough: when the
    // pricing service resolves to null lemonVariantId, the route
    // throws CheckoutPricingError (code "PRICING_ERROR") BEFORE the
    // orchestrator runs. The mock PricingService class doesn't carry
    // the real validateProvider throw logic, so we re-implement the
    // rejection via mockImplementationOnce on validateProvider for
    // this single call. We throw a CheckoutError with the same code
    // rather than importing CheckoutPricingError (which the
    // vi.mock factory for @/lib/commerce/checkout/pricing strips out
    // in favor of the PricingService class).
    mockPricingResolve.mockReturnValueOnce({
      lemonVariantId: null,
      discountCode: undefined,
    });
    mockPricingValidate.mockImplementationOnce(() => {
      throw new CheckoutError(
        "Nessun metodo di pagamento configurato per questo prodotto. Aggiungi un Lemon Variant ID.",
        { code: "PRICING_ERROR" },
      );
    });

    const { POST } = await import("./route");
    const res = await POST(
      createMockRequest("/api/checkout", { method: "POST", body: VALID_BODY }),
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe("PRICING_ERROR");
    expect(mockCreateCheckout).not.toHaveBeenCalled();
  });

  it("returns 400 when body is missing productId (zod validation)", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      createMockRequest("/api/checkout", {
        method: "POST",
        body: { locale: "it-it" }, // missing productId
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    // prisma.findUnique MUST NOT have been called — invalid input is
    // caught by zod before any DB hit.
    expect(mockPrismaFindFirst).not.toHaveBeenCalled();
    expect(mockCreateCheckout).not.toHaveBeenCalled();
    // The validation helper shape is `error` (string) + `details` (array)
    expect(body.error).toBeTruthy();
  });

  it("uses dbUser.email for the checkout when body has no email field", async () => {
    setAuthenticatedUser("session@test.com");
    const { POST } = await import("./route");
    await POST(
      createMockRequest("/api/checkout", {
        method: "POST",
        body: { productId: PRODUCT_ID, locale: "it-it" }, // no email
      }),
    );

    // CreateCheckout receives userEmail from session, not from body.
    expect(mockCreateCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        userEmail: "session@test.com",
      }),
    );
  });

  it("uses session email when both dbUser.email AND body.email are present (session wins)", async () => {
    // The route's existing canonical precedence is
    // `user?.email ?? body.email ?? ""` — the authenticated session
    // email is the trusted identity. body.email is a fallback for
    // anonymous (unauthenticated) checkouts. This is by design and
    // protects against unverified body inputs masquerading as the
    // authenticated user.
    setAuthenticatedUser("session@test.com");
    const { POST } = await import("./route");
    await POST(
      createMockRequest("/api/checkout", {
        method: "POST",
        body: { ...VALID_BODY, email: "explicit@test.com" },
      }),
    );

    expect(mockCreateCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        userEmail: "session@test.com",
      }),
    );
  });

  it("falls back to empty string when unauthenticated AND body has no email", async () => {
    mockGetServerUser.mockResolvedValue({ user: null, dbUser: null });

    const { POST } = await import("./route");
    await POST(
      createMockRequest("/api/checkout", {
        method: "POST",
        body: { ...VALID_BODY, email: undefined },
      }),
    );

    expect(mockCreateCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ userEmail: "" }),
    );
  });

  it("passes the resolved product + pricing + session context to the orchestrator", async () => {
    // The route reads `prisma.product.findFirst` and feeds the
    // orchestrator the full product via `createCheckout({product})`.
    // Assert the full set of forwarded fields so future refactors that
    // accidentally drop the `createCheckout` spread are caught: locale
    // and userEmail must reach the provider entry-point unchanged.
    setAuthenticatedUser("buyer@test.com");
    const { POST } = await import("./route");
    await POST(
      createMockRequest("/api/checkout", { method: "POST", body: VALID_BODY }),
    );

    const callArg = mockCreateCheckout.mock.calls[0]?.[0];
    expect(callArg?.product?.id).toBe(PRODUCT_ID);
    expect(callArg?.pricing?.lemonVariantId).toBe("var-1");
    expect(callArg?.locale).toBe("it-it");
    expect(callArg?.userEmail).toBe("buyer@test.com");
  });
});

describe("POST /api/checkout — apiErrorResponse error mapping", () => {
  // Sanity: every CheckoutError subclass surfaces via the standard
  // { error, code } JSON shape with the right HTTP status. This guards
  // against regressions where a new error class is added without
  // updating apiErrorResponse + the route's try/catch wiring.
  it("unknown error becomes 500 INTERNAL_ERROR", async () => {
    mockCreateCheckout.mockRejectedValueOnce(new Error("boom"));

    const { POST } = await import("./route");
    const res = await POST(
      createMockRequest("/api/checkout", { method: "POST", body: VALID_BODY }),
    );
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.code).toBe("INTERNAL_ERROR");
  });

  it("NotFoundError surfaces as 404 (regression for race condition path)", async () => {
    // Race: route's pre-check passed (product existed), orchestrator's
    // defensive re-read fails (product deleted meanwhile). The
    // orchestrator's NotFoundError must surface as 404 via
    // apiErrorResponse.
    mockPrismaFindFirst.mockResolvedValueOnce({
      id: PRODUCT_ID,
      slug: "course-a",
      lemonVariantId: "var-1",
    });
    mockCreateCheckout.mockRejectedValueOnce(new NotFoundError("Product not found"));

    const { POST } = await import("./route");
    const res = await POST(
      createMockRequest("/api/checkout", { method: "POST", body: VALID_BODY }),
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.code).toBe("NOT_FOUND");
  });
});
