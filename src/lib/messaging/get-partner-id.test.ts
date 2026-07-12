/**
 * Tests for `getPartnerId` — Phase 2.0 V2 DRY helper.
 *
 * Covers:
 *   1. meId === userOneId → returns userTwoId
 *   2. meId === userTwoId → returns userOneId
 *   3. Behavior alignment con canonical sort (Fase 1.3: min/max)
 *   4. Type parameter flexibility: helper works with subset shape
 */
import { describe, it, expect } from "vitest";
import { getPartnerId } from "./get-partner-id";

const SAMPLE_CONV = {
  userOneId: "bob-id",
  userTwoId: "alice-id",
  productId: "prod-1",
};

describe("getPartnerId", () => {
  it("returns userTwoId when meId === userOneId (left side)", () => {
    expect(getPartnerId(SAMPLE_CONV, "bob-id")).toBe("alice-id");
  });

  it("returns userOneId when meId === userTwoId (right side)", () => {
    expect(getPartnerId(SAMPLE_CONV, "alice-id")).toBe("bob-id");
  });

  it("returns the OTHER participant regardless of which side I'm on (symmetry)", () => {
    // Verifica swap consistency: da entrambi i lati, partner() è
    // sempre l'altro. Ordinala per evitare dipendenza dall'ordine
    // lessicografico (la coppia canonica Fase 1.3 mette min/max, ma
    // l'utente "alice"/"bob" qui NON è lessicografico — verifichiamo
    // comunque indipendentemente dall'ordinamento).
    expect([getPartnerId(SAMPLE_CONV, "alice-id"), getPartnerId(SAMPLE_CONV, "bob-id")].sort())
      .toEqual(["alice-id", "bob-id"]);
  });

  it("accepts a Conversation-shaped subset (type flexibility)", () => {
    // Il helper è generics su {userOneId, userTwoId} — può essere
    // chiamato con un subset. Questo evita di forzare il chiamante
    // a fare un cast o un type narrowing quando ha solo la coppia.
    const slim = { userOneId: "x", userTwoId: "y" };
    expect(getPartnerId(slim, "x")).toBe("y");
    expect(getPartnerId(slim, "y")).toBe("x");
  });
});
