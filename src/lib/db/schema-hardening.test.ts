import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(__dirname, "../../..");
const schema = fs.readFileSync(path.join(projectRoot, "prisma/schema.prisma"), "utf8");
const migration = fs.readFileSync(
  path.join(projectRoot, "prisma/migrations/20260806150000_harden_product_data/migration.sql"),
  "utf8",
);

describe("Product schema hardening contract", () => {
  it("uses Prisma JSON fields and exposes the soft-delete marker", () => {
    expect(schema).toMatch(/pricesByCurrency\s+Json\?/);
    expect(schema).toMatch(/countryOverrides\s+Json\?/);
    expect(schema).toMatch(/deletedAt\s+DateTime\?/);
    expect(schema).toMatch(/@@index\(\[deletedAt\]\)/);
  });

  it("retains conversations and access grants when a product is hard-deleted", () => {
    expect(schema).toMatch(
      /product\s+Product\s+@relation\(fields: \[productId\], references: \[id\], onDelete: Restrict\)/,
    );
    expect(schema).toMatch(
      /product Product @relation\("ProductAccessGrants", fields: \[productId\], references: \[id\], onDelete: Restrict\)/,
    );
    expect(migration).toContain(
      'FOREIGN KEY ("productId") REFERENCES "Product"("id")\n  ON DELETE RESTRICT',
    );
  });

  it("adds CHECK constraints for economic states and grant provenance", () => {
    const constraints = [
      '"Product_status_check"',
      '"Order_status_check"',
      '"AccessGrant_status_check"',
      '"AccessGrant_sourceType_check"',
      '"OutboxEvent_status_check"',
      '"OutboxDeliveryAttempt_status_check"',
      '"ProcessedWebhook_status_check"',
      '"OfferCard_status_check"',
      '"AbandonedCheckout_status_check"',
    ];

    for (const constraint of constraints) {
      expect(migration).toContain(constraint);
    }

    expect(migration).toContain(
      'CHECK ("sourceType" IN (\'order\', \'free_enrollment\', \'admin\', \'bundle\', \'watchlist\'))',
    );
  });

  it("preflights legacy JSON and status data before altering tables", () => {
    expect(migration).toContain("has invalid pricesByCurrency JSON");
    expect(migration).toContain("has invalid countryOverrides JSON");
    expect(migration).toContain("Product contains an unsupported status");
    expect(migration).toContain("AccessGrant contains an unsupported sourceType");
    expect(migration).toContain('ALTER COLUMN "pricesByCurrency" TYPE JSONB');
    expect(migration).toContain('ALTER COLUMN "countryOverrides" TYPE JSONB');
  });

  it("guards numeric JSON conversion instead of relying on OR short-circuiting", () => {
    expect(migration).toContain("parsed_price := (entry.value->>'price')::numeric;");
    expect(migration).toContain("Product % has invalid pricesByCurrency price");
    expect(migration).toContain("Product % has invalid countryOverrides price");
  });
});
