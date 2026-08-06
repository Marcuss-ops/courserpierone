import { describe, expect, it } from "vitest";
import { checkArchitectureFiles, isCompatibilityShim } from "./check-architecture";

describe("architecture boundary checker", () => {
  it("accepts a legacy lib compatibility shim", () => {
    expect(isCompatibilityShim('export * from "@/domains/commerce/pricing";')).toBe(true);
  });

  it("rejects newly added business logic in src/lib", () => {
    const violations = checkArchitectureFiles([
      {
        path: "src/lib/commerce/new-service.ts",
        status: "A",
        source: "export function calculatePrice() { return 1; }",
      },
    ]);
    expect(violations.map((violation) => violation.rule)).toContain(
      "no-new-lib-business-logic",
    );
  });

  it("rejects new top-level business files in src/lib", () => {
    const violations = checkArchitectureFiles([
      {
        path: "src/lib/checkout.ts",
        status: "A",
        source: "export const process = () => {};",
      },
    ]);
    expect(violations.map((violation) => violation.rule)).toContain(
      "no-new-lib-business-logic",
    );
  });

  it("allows relative imports to infrastructure but rejects legacy business imports", () => {
    expect(
      checkArchitectureFiles([
        {
          path: "src/domains/learning/application/service.ts",
          status: "A",
          source: 'import { log } from "../../../lib/logging/constants";',
        },
      ]),
    ).toEqual([]);

    const violations = checkArchitectureFiles([
      {
        path: "src/domains/learning/application/service.ts",
        status: "A",
        source: 'import { oldAccess } from "../../../lib/access/rules";',
      },
    ]);
    expect(violations.map((violation) => violation.rule)).toContain(
      "domain-no-legacy-business-import",
    );
  });

  it("rejects executable code disguised as a compatibility shim", () => {
    expect(
      isCompatibilityShim(
        'export * from "@/domains/commerce";\nexport const extra = true;',
      ),
    ).toBe(false);
  });

  it("allows existing legacy files during the progressive migration", () => {
    expect(
      checkArchitectureFiles([
        {
          path: "src/lib/commerce/existing-service.ts",
          status: "M",
          source: "export function calculatePrice() { return 1; }",
        },
      ]),
    ).toEqual([]);
  });

  it("checks only added lines for modified app and domain files", () => {
    expect(
      checkArchitectureFiles([
        {
          path: "src/app/api/example/route.ts",
          status: "M",
          source: 'import { prisma } from "@/lib/db/prisma";',
          addedSource: "export async function GET() {}",
        },
        {
          path: "src/domains/learning/domain/rules.ts",
          status: "M",
          source: 'import { Prisma } from "@prisma/client";',
          addedSource: "export const rule = true;",
        },
      ]),
    ).toEqual([]);

    const violations = checkArchitectureFiles([
      {
        path: "src/app/api/example/route.ts",
        status: "M",
        source: "export async function GET() {}",
        addedSource: 'import { prisma } from "@/lib/db/prisma";',
      },
    ]);
    expect(violations.map((violation) => violation.rule)).toContain("app-no-prisma");
  });

  it("rejects Prisma in app composition code", () => {
    const violations = checkArchitectureFiles([
      {
        path: "src/app/api/example/route.ts",
        status: "M",
        source: 'import { prisma } from "@/lib/db/prisma"; export async function GET() {}',
      },
    ]);
    expect(violations.map((violation) => violation.rule)).toContain("app-no-prisma");
  });

  it("rejects legacy business imports and internal cross-domain imports", () => {
    const violations = checkArchitectureFiles([
      {
        path: "src/domains/commerce/application/use-case.ts",
        status: "A",
        source: [
          'import { old } from "@/lib/commerce/old";',
          'import { adapter } from "@/domains/messaging/internal/adapter";',
        ].join("\n"),
      },
    ]);
    expect(violations.map((violation) => violation.rule)).toEqual(
      expect.arrayContaining([
        "domain-no-legacy-business-import",
        "cross-domain-public-api",
      ]),
    );
  });

  it("ignores domain-internal imports in quality tooling", () => {
    expect(
      checkArchitectureFiles([
        {
          path: "scripts/quality/check-registry-drift.ts",
          status: "A",
          source: 'import { REGISTRY } from "@/domains/catalog/internal-registry";',
        },
      ]),
    ).toEqual([]);
  });

  it("keeps persistence out of the domain layer", () => {
    const violations = checkArchitectureFiles([
      {
        path: "src/domains/learning/domain/rules.ts",
        status: "M",
        source: 'import { Prisma } from "@prisma/client"; export const x = Prisma;',
      },
    ]);
    expect(violations.map((violation) => violation.rule)).toContain(
      "domain-no-persistence",
    );
  });
});
