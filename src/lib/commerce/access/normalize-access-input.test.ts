/**
 * Tests for src/lib/commerce/access/normalize-access-input.ts.
 *
 * The adapter is the SINGLE place that maps legacy `/api/access`
 * inputs to the canonical order-identity contract. Matrix pinned here:
 *   - providerOrderId present            → forwarded explicitly (canonical), no warn
 *   - providerOrderId wins over orderId  → canonical providerOrderId only, no warn
 *   - internal cuid orderId              → forwarded as internal orderId, no warn
 *   - provider-looking orderId           → forwarded as orderId (legacy) + console.warn
 *   - no order identifiers               → `{ productId }` only
 *   - empty-string identifiers           → treated as absent
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { normalizeAccessInput } from "./normalize-access-input";

const PRODUCT_ID = "prod-1";
const CUID_LIKE_ORDER_ID = "c123456789012345678901234";
const PROVIDER_ORDER_ID = "order_ls_abc123";

function spyWarn() {
  return vi.spyOn(console, "warn").mockImplementation(() => undefined);
}

describe("normalizeAccessInput — canonical order identity adapter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("providerOrderId present -> forwarded explicitly (canonical), no warn", () => {
    const warn = spyWarn();
    expect(
      normalizeAccessInput({ productId: PRODUCT_ID, providerOrderId: PROVIDER_ORDER_ID }),
    ).toEqual({ productId: PRODUCT_ID, providerOrderId: PROVIDER_ORDER_ID });
    expect(warn).not.toHaveBeenCalled();
  });

  it("providerOrderId wins when both orderId and providerOrderId are present", () => {
    const warn = spyWarn();
    expect(
      normalizeAccessInput({
        productId: PRODUCT_ID,
        orderId: CUID_LIKE_ORDER_ID,
        providerOrderId: PROVIDER_ORDER_ID,
      }),
    ).toEqual({ productId: PRODUCT_ID, providerOrderId: PROVIDER_ORDER_ID });
    expect(warn).not.toHaveBeenCalled();
  });

  it("providerOrderId wins over a provider-looking orderId — NO warn (legacy branch never reached)", () => {
    const warn = spyWarn();
    expect(
      normalizeAccessInput({
        productId: PRODUCT_ID,
        orderId: "order_other_xyz",
        providerOrderId: PROVIDER_ORDER_ID,
      }),
    ).toEqual({ productId: PRODUCT_ID, providerOrderId: PROVIDER_ORDER_ID });
    expect(warn).not.toHaveBeenCalled();
  });

  it("internal cuid-shaped orderId -> treated as internal Order.id, no warn", () => {
    const warn = spyWarn();
    expect(
      normalizeAccessInput({ productId: PRODUCT_ID, orderId: CUID_LIKE_ORDER_ID }),
    ).toEqual({ productId: PRODUCT_ID, orderId: CUID_LIKE_ORDER_ID });
    expect(warn).not.toHaveBeenCalled();
  });

  it("provider-looking orderId -> forwarded (legacy) + console.warn flags the misuse", () => {
    const warn = spyWarn();
    expect(
      normalizeAccessInput({ productId: PRODUCT_ID, orderId: PROVIDER_ORDER_ID }),
    ).toEqual({ productId: PRODUCT_ID, orderId: PROVIDER_ORDER_ID });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain("[legacy]");
  });

  it("no order identifiers -> productId only", () => {
    const warn = spyWarn();
    expect(normalizeAccessInput({ productId: PRODUCT_ID })).toEqual({
      productId: PRODUCT_ID,
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it("empty-string identifiers are treated as absent (no warn, no forwarding)", () => {
    const warn = spyWarn();
    expect(
      normalizeAccessInput({ productId: PRODUCT_ID, orderId: "", providerOrderId: "" }),
    ).toEqual({ productId: PRODUCT_ID });
    expect(warn).not.toHaveBeenCalled();
  });
});
