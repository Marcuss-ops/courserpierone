import { describe, expect, it } from "vitest";
import { buildAnalyticsProductWhere } from "./product-identity";

describe("buildAnalyticsProductWhere", () => {
  it("uses the internal product ID as productId", () => {
    expect(buildAnalyticsProductWhere({ productId: "clxyz1234567890abcdefghij" })).toEqual({
      OR: [{ productId: "clxyz1234567890abcdefghij" }],
    });
  });

  it("keeps a non-CUID productId compatible with legacy slug rows", () => {
    expect(buildAnalyticsProductWhere({ productId: "course-1" })).toEqual({
      OR: [{ productId: "course-1" }, { productSlug: "course-1" }],
    });
  });

  it("matches normalized and historical slug-in-productId rows", () => {
    expect(buildAnalyticsProductWhere({ productSlug: "course-1" })).toEqual({
      OR: [{ productSlug: "course-1" }, { productId: "course-1" }],
    });
  });

  it("supports provider product identifiers independently", () => {
    expect(buildAnalyticsProductWhere({ providerProductId: "variant-42" })).toEqual({
      providerProductId: "variant-42",
    });
  });

  it("combines all explicit identities without conflating them", () => {
    expect(buildAnalyticsProductWhere({
      productId: "clxyz1234567890abcdefghij",
      productSlug: "course-1",
      providerProductId: "variant-42",
    })).toEqual({
      AND: [
        {
          OR: [
            { productId: "clxyz1234567890abcdefghij" },
            { productSlug: "course-1" },
            { productId: "course-1" },
          ],
        },
        { providerProductId: "variant-42" },
      ],
    });
  });
});
