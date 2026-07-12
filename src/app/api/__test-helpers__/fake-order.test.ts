/**
 * src/app/api/__test-helpers__/fake-order.test.ts
 *
 * V3.3.2.x — Factory-invariant tests for `fakeOrder()` so this shared
 * helper is no longer in "untested-factory" state. The 5 tests below
 * lock in the 4 invariants the helper is supposed to satisfy and add
 * one multi-field-merge extension for symmetry.
 *
 * Invariants proven here:
 *
 *   (a) `fakeOrder()` (no args) returns the documented DEFAULTS exactly
 *       — id / userId / productId / locale all match the JSDoc-declared
 *       constants in `fake-order.ts`.
 *
 *   (b) `fakeOrder({ fieldA: valueA })` merges a single-field partial
 *       override on top of DEFAULTS — non-overridden keys keep their
 *       DEFAULTS values (proves the `{ ...DEFAULTS, ...overrides }`
 *       spread order is correct).
 *
 *   (b+) Same merge invariant under a MULTI-field override: every
 *       supplied override wins, every non-supplied key falls back to
 *       DEFAULTS. Symmetry check with (b).
 *
 *   (c) Excess-property check fires at compile time when caller passes
 *       a key that is NOT in `Partial<FakeOrder>`. Locked via
 *       `@ts-expect-error` so the type-level guarantee cannot regress
 *       silently.
 *
 *   (d) Runtime return is NEVER `null` — even though the helper's
 *       declared return type `FakeOrder = Awaited<ReturnType<typeof
 *       findCompletedOrder>>` resolves to `Order | null`, the factory
 *       body only ever returns a spread-object. This test catches a
 *       regression where the body starts returning `null`.
 *
 * Why matchers-only (no direct property access):
 *
 *   `fakeOrder()` is typed `FakeOrder = Order | null`. With the project
 *   tsconfig in strict mode, any direct property access like `order.id`
 *   triggers TS18047 (`'order' is possibly 'null'`). Deep-equal matchers
 *   (`toEqual`, `toMatchObject`) accept the possibly-null input directly
 *   via vitest's matcher typing, so we avoid the strict-null-check
 *   errors without resorting to `as NonNullable<...>` casts (which the
 *   `@typescript-eslint/non-nullable-type-assertion-style` rule rejects).
 *
 *   This pattern preserves runtime invariant checks AND keeps type
 *   safety: if the helper ever regresses to returning `null`, both the
 *   `.not.toBeNull()` and the matcher failures catch it.
 *
 * No local type alias needed: the matchers-only strategy treats the
 * helper's possibly-null return shape (`Order | null`, via the helper's
 * internal `Awaited<ReturnType<typeof findCompletedOrder>>`) as opaque
 * input to vitest matchers (which are typed to accept nullable input
 * directly), so no narrow-casting or local type re-derivation is needed
 * at the test layer.
 */

import { describe, it, expect } from "vitest";

import { fakeOrder } from "./fake-order";

describe("src/app/api/__test-helpers__/fake-order.ts — factory invariants", () => {
  it("(a) fakeOrder() returns the documented DEFAULTS exactly", () => {
    // `toEqual` does structural deep-equality. The helper's body
    // performs `{ ...DEFAULTS, ...overrides }` with empty overrides,
    // so the result is exactly the 4 documented DEFAULTS keys.
    expect(fakeOrder()).toEqual({
      id: "ck-order-1",
      userId: "cu-user-1",
      productId: "cp-product-1",
      locale: "it",
    });
  });

  it("(b) fakeOrder({ field }) merges a single-field override on top of DEFAULTS", () => {
    // Override `locale` only — the other 3 keys must preserve DEFAULTS.
    // Proves the spread order is `{ ...DEFAULTS, ...overrides }` and
    // that single-field overrides don't accidentally drop DEFAULTS.
    expect(fakeOrder({ locale: "es" })).toEqual({
      id: "ck-order-1",
      userId: "cu-user-1",
      productId: "cp-product-1",
      locale: "es",
    });
  });

  it("(b+) fakeOrder({ a, b, c }) merges a multi-field override on top of DEFAULTS", () => {
    // Symmetry check with (b): the merge behavior is identical for
    // single-field and multi-field overrides (same spread semantics).
    // `productId` is not overridden → must fall back to DEFAULTS.
    expect(
      fakeOrder({
        id: "ck-order-99",
        userId: "cu-admin-1",
        locale: "fr",
      }),
    ).toEqual({
      id: "ck-order-99",
      userId: "cu-admin-1",
      productId: "cp-product-1", // not overridden → DEFAULTS
      locale: "fr",
    });
  });

  it("(c) rejects overrides with keys NOT in Partial<FakeOrder> (compile-time check)", () => {
    // The signature is `overrides: Partial<FakeOrder>`. Passing an
    // unknown key exercises TypeScript's excess-property check on
    // object literals — a compile-time error. The `@ts-expect-error`
    // directive below is the assertion: if the helper ever loosens
    // its override type (e.g., to `Record<string, unknown>`), the
    // error vanishes and the directive fires an "Unused @ts-expect-
    // error" mismatch, failing the test.
    //
    // @ts-expect-error - `nonExistentField` is not a key of `Partial<FakeOrder>` (compile-time excess-property check)
    const order = fakeOrder({ nonExistentField: "x" });
    // The runtime call still succeeds (the body spreads DEFAULTS +
    // overrides and casts through `as unknown`), so `order` is
    // defined — assert it to keep the variable referenced and avoid
    // the no-unused-vars linter flag.
    expect(order).toBeDefined();
  });

  it("(d) returns a non-null Order at runtime (preserves non-falsy shape)", () => {
    // The static type `FakeOrder = Order | null` PERMITS null, but
    // the factory's body never produces null — it always returns the
    // spread `{ ...DEFAULTS, ...overrides }` object. The two
    // assertions below catch a regression where the body accidentally
    // starts returning `null`.
    const order = fakeOrder();
    // Headline non-null runtime check:
    expect(order).not.toBeNull();
    // Shape check: the factory always spreads DEFAULTS + overrides,
    // so the result must include the 4 documented keys. A `null`
    // return would fail `.toMatchObject` (matcher requires object
    // input). Use `toMatchObject` (subset) rather than `toEqual`
    // because the helper's body creates plain-object literals with
    // exactly those 4 keys, but Any-future `as NonNullable<...>`-
    // free path should remain robust to any FIELD-DROPPING regression
    // by checking each documented DEFAULTS key is present.
    expect(order).toMatchObject({
      id: expect.any(String),
      userId: expect.any(String),
      productId: expect.any(String),
      locale: expect.any(String),
    });
  });
});
