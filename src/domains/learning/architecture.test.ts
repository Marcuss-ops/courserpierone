import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(process.cwd());
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("Learning vertical slice architecture", () => {
  it("keeps the use case free of Prisma and exposes the adapter only at composition", () => {
    const useCase = read("src/domains/learning/continue-watching/continue-watching.ts");
    const adapter = read("src/domains/learning/continue-watching/prisma-continue-watching-repository.ts");
    const route = read("src/app/api/learning/continue-watching/route.ts");

    const executableUseCase = useCase
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");
    expect(executableUseCase).not.toMatch(/@prisma|@\/lib\/db\/prisma|\bprisma\./);
    expect(adapter).toContain("@/lib/db/prisma");
    expect(route).toContain('from "@/domains/learning"');
  });

  it("keeps legacy Learning paths as re-export shims", () => {
    for (const file of [
      "src/lib/learning/continue-watching.ts",
      "src/lib/learning/continue-watching-types.ts",
      "src/lib/learning/prisma-continue-watching-repository.ts",
    ]) {
      const source = read(file);
      expect(source).toContain("Temporary compatibility shim");
      expect(source).toMatch(/export \* from "@\/domains\/learning/);
    }
  });
});
