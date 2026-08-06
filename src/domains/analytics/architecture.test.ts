import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(process.cwd());
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("Analytics vertical slice architecture", () => {
  it("keeps product identity logic in the domain and routes on the public API", () => {
    const identity = read("src/domains/analytics/identity/product-identity.ts");
    const dashboard = read("src/app/api/analytics/dashboard/route.ts");
    const funnel = read("src/app/api/analytics/funnel/route.ts");

    expect(identity).toContain('from "./ssot-identifier"');
    expect(dashboard).toContain('from "@/domains/analytics"');
    expect(funnel).toContain('from "@/domains/analytics"');
  });

  it("keeps the legacy product identity path as a compatibility shim", () => {
    const shim = read("src/lib/analytics/product-identity.ts");
    expect(shim).toContain("Temporary compatibility shim");
    expect(shim).toContain('export * from "@/domains/analytics/identity/product-identity"');
  });
});
