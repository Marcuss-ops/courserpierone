import type { Order } from "@prisma/client";

/**
 * src/app/api/__test-helpers__/fake-order.ts
 *
 * V3.3.2 — Single typed factory for the `Order` shape (`Order | null`),
 * shared between the 4 V3.3.1 AccessGate test files (certificate, ebook,
 * progress, videos). Replaces ~24 LOC of per-file `fakeOrder` +
 * `FakeOrder` type-alias duplication with a single import.
 *
 * Scope: use this helper ONLY in tests of routes that consume an
 * `Order` read (the deprecated `findCompletedOrder` helper has been
 * removed — access now goes through `resolveProductAccess`, which
 * never returns an `Order` row; `fakeOrder` remains for test fixtures
 * that still need a raw Order object, e.g. write-side route mocks).
 * Routes with a DIFFERENT Order shape (e.g., write-side admin endpoints,
 * refund flows, social-proof canvases) should define their own local
 * factory rather than overloading this one — those Order variants often
 * include fields not present in the read-side shape.
 *
 * Global defaults (`fakeOrder()` with no args):
 *   - `id: "ck-order-1"`     — matches across all tests
 *   - `userId: "cu-user-1"`  — matches the `USER_ID` constant used by
 *     `mockCustomer()` in every test file (so the order's userId
 *     matches the authenticated `dbUser.id`)
 *   - `productId: "cp-product-1"` — matches the test-local PRODUCT_ID
 *     in cert / videos / progress (ebook doesn't check it; default is
 *     harmless for the ebook route which keys on productSlug)
 *   - `locale: "it"`         — cert route reads locale for PDF rendering;
 *     harmless default for the others
 *
 * Overrides:
 *   `fakeOrder({ field: value, ... })` — partial overrides via
 *   `Partial<FakeOrder>`. Useful for scenarios like admin mocks
 *   (`fakeOrder({ userId: ADMIN_ID })`) or alternate locales.
 *
 * Why a TYPED factory (vs. `as any` casts)?
 *   - Compile-time safety: the type system enforces that the keys
 *     passed exist on `Order`. No "field doesn't exist on Order"
 *     silent bugs.
 *   - No `as any` casts in any test file → ESLint `no-explicit-any`
 *     stays clean (no file-level eslint-disable directives needed).
 *   - Self-documenting: the `DEFAULTS` object shows what a "typical"
 *     Order looks like for tests.
 *
 * Why a separate helper file (vs. inline `const fakeOrder = ...` in
 * each test)?
 *   - DRY across 4 files
 *   - Single source of truth for the Identity literals (`ck-order-1`,
 *     `cu-user-1`, `cp-product-1`, `it`) — if any of these need to
 *     change for a future test convention, edit one place
 *   - Reusable for upcoming **read-side** admin route tests (V4+)
 *     which mock raw Order rows; a single import replaces another ~7 LOC
 *     of duplication. Note: write-side admin endpoints (createOrder /
 *     refundOrder flows) use a DIFFERENT shape and should NOT use this
 *     helper — see the "Scope" block at the top of this docstring.
 */

type FakeOrder = Order | null;

const DEFAULTS = {
  id: "ck-order-1",
  userId: "cu-user-1",
  productId: "cp-product-1",
  locale: "it",
} as const;

/**
 * Create a fake Order matching the canonical `Order` row shape.
 * See module docstring for default field values + override pattern.
 */
export const fakeOrder = (overrides: Partial<FakeOrder> = {}): FakeOrder => ({
  ...DEFAULTS,
  ...overrides,
  // The cast bypasses the `Order | null` narrow (`null` is a falsy
  // mockable value but tests use this for truthy `Order` cases only).
  // `as unknown` widens the partial-input object to satisfy `Order`,
  // then `FakeOrder` is its real return type.
} as unknown as FakeOrder);
