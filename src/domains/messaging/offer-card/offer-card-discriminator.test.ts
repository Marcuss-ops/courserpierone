/**
 * src/domains/messaging/offer-card/offer-card-discriminator.test.ts
 *
 * Phase 4 \u2014 status enum + LinkToken + state-machine transitions.
 *
 * Tiny test suite for the discriminator boundary checks (runtime
 * guards + transition whitelist). Pure logic, no I/O.
 */

import { describe, it, expect } from "vitest";

import {
  OFFER_CARD_STATUSES,
  isValidOfferCardStatus,
  toLinkToken,
  isValidStatusTransition,
  type OfferCardStatus,
  type LinkToken,
} from "./offer-card-discriminator";

// \u2500\u2500\u2500\u2500 OFFER_CARD_STATUSES Set \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

describe("OFFER_CARD_STATUSES", () => {
  it("contains exactly 7 canonical lifecycle states (per Phase 4 spec)", () => {
    expect(OFFER_CARD_STATUSES.size).toBe(7);
  });

  it.each([
    "draft", "sent", "viewed", "clicked", "converted", "expired", "withdrawn",
  ] as OfferCardStatus[])("includes the canonical state '%s'", (status) => {
    // \u00b7 \u00b7 one extra canonical entry implied by 8-count \u2192 enumerated above.
    // (8 = 7 listed + 1 implicit; the Set has 8 entries total per count test.)
    expect(OFFER_CARD_STATUSES.has(status)).toBe(true);
  });
});

// \u2500\u2500\u2500\u2500 isValidOfferCardStatus \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

describe("isValidOfferCardStatus", () => {
  it.each([
    "draft", "sent", "viewed", "clicked", "converted", "expired", "withdrawn",
  ] as OfferCardStatus[])("returns true for canonical state '%s'", (s) => {
    expect(isValidOfferCardStatus(s)).toBe(true);
  });

  it.each([
    "DRAFT",
    "Draft",
    "deleted",
    "archived",
    "",
    null,
    undefined,
    42,
    {},
    [],
  ])("returns false for non-canonical input: %p", (input) => {
    expect(isValidOfferCardStatus(input)).toBe(false);
  });
});

// \u2500\u2500\u2500\u2500 toLinkToken (type-only brand) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

describe("toLinkToken", () => {
  it("brands a server-generated string as LinkToken (type-only, no runtime validation)", () => {
    const raw = "v4_uuid_or_cuid_abc123";
    const token = toLinkToken(raw);
    expect(token).toBe(raw); // pass-through at runtime
    expect(typeof token).toBe("string");
    // Type-system: token is assignable to LinkToken \u2192 compile-time check.
    const _typed: LinkToken = token;
    void _typed;
  });
});

// \u2500\u2500\u2500\u2500 isValidStatusTransition \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

describe("isValidStatusTransition (state-machine)", () => {
  it("allows draft \u2192 sent", () => {
    expect(isValidStatusTransition("draft", "sent")).toBe(true);
  });
  it("allows draft \u2192 withdrawn (creator cancels before send)", () => {
    expect(isValidStatusTransition("draft", "withdrawn")).toBe(true);
  });
  it("blocks draft \u2192 viewed (must pass through sent first)", () => {
    expect(isValidStatusTransition("draft", "viewed")).toBe(false);
  });
  it("blocks sent \u2192 draft (no rollback to pre-send)", () => {
    expect(isValidStatusTransition("sent", "draft")).toBe(false);
  });
  it("allows sent \u2192 viewed, clicked, converted, expired, withdrawn", () => {
    expect(isValidStatusTransition("sent", "viewed")).toBe(true);
    expect(isValidStatusTransition("sent", "clicked")).toBe(true);
    expect(isValidStatusTransition("sent", "converted")).toBe(true);
    expect(isValidStatusTransition("sent", "expired")).toBe(true);
    expect(isValidStatusTransition("sent", "withdrawn")).toBe(true);
  });
  it("blocks ALL transitions from terminal states converted/expired/withdrawn", () => {
    const fromTerminal: OfferCardStatus[] = ["converted", "expired", "withdrawn"];
    const allTargets: OfferCardStatus[] = [
      "draft", "sent", "viewed", "clicked", "converted", "expired", "withdrawn",
    ];
    for (const from of fromTerminal) {
      for (const to of allTargets) {
        expect(isValidStatusTransition(from, to)).toBe(false);
      }
    }
  });
});
