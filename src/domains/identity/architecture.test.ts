import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const DOMAIN_ROOT = join(process.cwd(), "src", "domains", "identity");
const SRC_ROOT = join(process.cwd(), "src");
const INNER_LAYERS = ["domain", "application", "ports"] as const;
const LEGACY_IMPORT = "@/lib/commerce/access/resolve-product-access";
const CANONICAL_IMPORT = "@/domains/identity";

function runtimeSourceFiles(directory: string): string[] {
  const result: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      result.push(...runtimeSourceFiles(path));
    } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".test.ts") && !entry.name.endsWith(".test.tsx")) {
      result.push(path);
    }
  }
  return result;
}

describe("Identity & Access architecture", () => {
  it("keeps Prisma out of domain, application, and port layers", () => {
    for (const layer of INNER_LAYERS) {
      const fileNames = layer === "domain"
        ? ["access-reasons.ts", "access-decision.ts"]
        : layer === "application"
          ? ["resolve-product-access.ts"]
          : ["product-access-port.ts"];

      for (const fileName of fileNames) {
        const source = readFileSync(join(DOMAIN_ROOT, layer, fileName), "utf8");
        expect(source, `${layer}/${fileName}`).not.toMatch(/@\/lib\/db|@prisma|\bprisma\./);
      }
    }
  });

  it("keeps persistence composition in the adapter layer", () => {
    const adapter = readFileSync(
      join(DOMAIN_ROOT, "adapters", "prisma-product-access-adapter.ts"),
      "utf8",
    );
    expect(adapter).toContain("@/lib/db/prisma");
  });

  it("routes runtime access consumers through the canonical Identity module", () => {
    const shim = join(SRC_ROOT, "lib", "commerce", "access", "resolve-product-access.ts");
    for (const filePath of runtimeSourceFiles(SRC_ROOT)) {
      if (filePath === shim || filePath.includes(`${join("domains", "identity")}${join("", "")}`)) continue;
      const source = readFileSync(filePath, "utf8");
      if (source.includes("resolveProductAccess")) {
        expect(source, filePath).not.toContain(LEGACY_IMPORT);
      }
    }

    const shimSource = readFileSync(shim, "utf8");
    expect(shimSource).toContain(CANONICAL_IMPORT);
  });
});
