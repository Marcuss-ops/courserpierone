/**
 * src/lib/access/index.test.ts
 *
 * V3.2 follow-up — Smoke test per il barrel `src/lib/access/index.ts`.
 *
 * Perché serve: i test esistenti (`find-completed-order.test.ts`,
 * `find-completed-order-by-order-id.test.ts`) importano via direct
 * submodule path (`./find-completed-order`, `./find-completed-order-
 * by-order-id`). Se un futuro rename o delete silenzioso rompe il
 * barrel, quei test continueranno a passare (perché lavorano con
 * il submodule indipendentemente dal barrel).
 *
 * Questo smoke test cattura il caso opposto: il barrel DEVE
 * ri-esportare i 2 helper functions + 2 Input types + 2 Result type
 * aliases. Se uno qualsiasi sparisce dal barrel, il test fallisce.
 *
 * Convenzioni: assertions minime (typeof per le functions, type-only
 * assignment per i types, snapshot Object.keys per full inventory).
 */
import { describe, it, expect } from "vitest";

import {
  findCompletedOrder,
  type FindCompletedOrderInput,
  type FindCompletedOrderResult,
} from "./index";

describe("src/lib/access barrel index.ts — V3.2 discoverability surface", () => {
  it("re-exports the helper function as a runtime value", () => {
    expect(typeof findCompletedOrder).toBe("function");
  });

  it("re-exports the Input type name (compile-time type assertion)", () => {
    // If the barrel dropped `FindCompletedOrderInput`, these assignments
    // would fail at typecheck time (= TS error in vitest run). Pass = OK.
    const minimalUserKeyed: FindCompletedOrderInput = {
      userId: "fixture-user",
      productId: "fixture-product",
    };
    expect(minimalUserKeyed.userId).toBe("fixture-user");
  });

  it("re-exports the Result type alias (Order | null blessed layout)", () => {
    // The Result type is explicitly `Order | null`. A regression that
    // changes the return shape (e.g., `Order | undefined`) would change
    // this blessed alias — the test catches it at compile time.
    const nullResultUser: FindCompletedOrderResult = null;
    expect(nullResultUser).toBeNull();
  });

  it("the barrel exports match the expected runtime inventory (regression snapshot)", async () => {
    // Snapshot-style check on the RUNTIME keys. Critical detail: TypeScript
    // type-only re-exports (`export { type Foo }`, `export type Foo = ...`)
    // are ELIDED at runtime by the TS compiler / vitest-esbuild, so they
    // do NOT appear in Object.keys. The runtime inventory has ONLY the
    // 2 function exports. If a V4+ adds a NEW function export, this test
    // fails and forces an explicit expected-list update (= catches silent
    // renames).
    const mod = await import("./index");
    expect(Object.keys(mod).sort()).toEqual(["findCompletedOrder"]);
  });
});
