import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(process.cwd());
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("Messaging vertical slice architecture", () => {
  it("keeps the partner helper pure and routes use the public API", () => {
    const helper = read("src/domains/messaging/conversations/get-partner-id.ts")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");
    const route = read("src/app/api/conversations/[id]/stream/route.ts");

    expect(helper).not.toMatch(/@prisma|@\/lib\/db\/prisma|\bprisma\./);
    expect(route).toContain('from "@/domains/messaging"');
  });

  it("keeps the legacy helper as a compatibility shim", () => {
    const shim = read("src/lib/messaging/get-partner-id.ts");
    expect(shim).toContain("Temporary compatibility shim");
    expect(shim).toContain('export * from "@/domains/messaging/conversations/get-partner-id"');
  });
});
