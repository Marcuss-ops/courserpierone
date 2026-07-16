import { describe, it, expect } from "vitest";
import {
  checkEmptyCatch,
  checkCatchLogging,
  checkNPlusOne,
  isInTarget,
  findCatchBlocks,
  checkAdr,
  collectAudit,
  collectDiff,
  type DiffData,
} from "./check-dod";

// ─── isInTarget — regression-prohibition helper ─────────────────────────────

describe("isInTarget (legacy-handling)", () => {
  it("returns true when targetLines is empty (audit mode)", () => {
    expect(isInTarget(42, new Set())).toBe(true);
  });
  it("returns true when line is in targetLines (changed line)", () => {
    expect(isInTarget(42, new Set([42]))).toBe(true);
  });
  it("returns false when line is not in targetLines (unchanged line)", () => {
    // Regression-prohibition: don't fail CI on pre-existing violations.
    expect(isInTarget(42, new Set([10]))).toBe(false);
  });
});

// ─── findCatchBlocks — catch-block parser ───────────────────────────────────

describe("findCatchBlocks", () => {
  it("finds single-line empty catch", () => {
    const blocks = findCatchBlocks("try { foo(); } catch (e) {}");
    expect(blocks).toHaveLength(1);
    expect(blocks[0].openLine).toBe(1);
    expect(blocks[0].inner).toBe("");
  });
  it("finds multi-line catch with body", () => {
    const blocks = findCatchBlocks(
      "try { foo(); }\ncatch (e) {\n  console.error(e);\n  return null;\n}",
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0].inner).toContain("console.error");
    expect(blocks[0].closeLine).toBe(5);
  });
  it("finds multiple catches in the same file", () => {
    const blocks = findCatchBlocks(
      "try { a(); } catch (e) { x(); }\ntry { b(); } catch (e) { y(); }",
    );
    expect(blocks).toHaveLength(2);
  });
});

// ─── AP-D — empty catch (HARD FAIL) ────────────────────────────────────────

describe("checkEmptyCatch (AP-D, HARD FAIL)", () => {
  it("flags `catch (e) {}`", () => {
    const v = checkEmptyCatch("f.ts", "try { x(); } catch (e) {}", new Set());
    expect(v).toHaveLength(1);
    expect(v[0].severity).toBe("fail");
    expect(v[0].detector).toBe("AP-D");
    expect(v[0].message).toContain("silently");
  });
  it("flags multi-line empty catch", () => {
    const v = checkEmptyCatch("f.ts", "try { x(); }\ncatch (e) {\n}\n", new Set());
    expect(v).toHaveLength(1);
  });
  it("does NOT flag catch with comment-only body (treated as intentional)", () => {
    // Per AP-D spirit: a comment-only body is "intentional no-op" — out of scope.
    const v = checkEmptyCatch(
      "f.ts",
      "try { x(); } catch (e) {\n  // intentional\n}",
      new Set(),
    );
    expect(v).toHaveLength(0);
  });
  it("does NOT flag catch with real body", () => {
    const v = checkEmptyCatch("f.ts", "try { x(); } catch (e) { console.error(e); }", new Set());
    expect(v).toHaveLength(0);
  });
  it("skips violation when line not in targetLines (legacy exemption)", () => {
    const v = checkEmptyCatch("f.ts", "try { x(); } catch (e) {}", new Set([100]));
    expect(v).toHaveLength(0);
  });
});

// ─── D-11 — catch without logger (SOFT WARN) ────────────────────────────────

describe("checkCatchLogging (D-11, SOFT WARN)", () => {
  it("flags catch without logger call", () => {
    const v = checkCatchLogging("f.ts", "try { x(); } catch (e) { return null; }", new Set());
    expect(v).toHaveLength(1);
    expect(v[0].detector).toBe("D-11");
    expect(v[0].severity).toBe("warn");
  });
  it("does not flag catch with console.error", () => {
    const v = checkCatchLogging("f.ts", "try { x(); } catch (e) { console.error(e); }", new Set());
    expect(v).toHaveLength(0);
  });
  it("does not flag catch with logger.error", () => {
    const v = checkCatchLogging("f.ts", "try { x(); } catch (e) { logger.error(e); }", new Set());
    expect(v).toHaveLength(0);
  });
  it("skips empty catch (AP-D handles that)", () => {
    const v = checkCatchLogging("f.ts", "try { x(); } catch (e) {}", new Set());
    expect(v).toHaveLength(0);
  });
});

// ─── D-9 / AP-F — N+1 query inside loop ─────────────────────────────────────

describe("checkNPlusOne (D-9 / AP-F, SOFT WARN)", () => {
  it("flags prisma inside forEach", () => {
    const v = checkNPlusOne(
      "f.ts",
      "items.forEach(async (i) => { await prisma.foo.findUnique({ where: { id: i.id } }); });",
      new Set(),
    );
    expect(v.length).toBeGreaterThan(0);
    expect(v[0].detector).toBe("D-9");
    expect(v[0].severity).toBe("warn");
  });
  it("flags db. inside for-of", () => {
    const v = checkNPlusOne(
      "f.ts",
      "for (const x of xs) {\n  await db.users.findOne({ id: x.id });\n}",
      new Set(),
    );
    expect(v.length).toBeGreaterThan(0);
  });
  it("does NOT flag items.map without prisma", () => {
    const v = checkNPlusOne("f.ts", "items.map((i) => i.name);", new Set());
    expect(v).toHaveLength(0);
  });
  it("does NOT flag prisma outside a loop", () => {
    const v = checkNPlusOne("f.ts", "const x = await prisma.foo.findMany();", new Set());
    expect(v).toHaveLength(0);
  });
  it("skips violation when for-loop line is not in targetLines (legacy)", () => {
    const v = checkNPlusOne(
      "f.ts",
      "items.forEach(async (i) => { await prisma.foo.findUnique({ where: { id: i.id } }); });",
      new Set([100]),
    );
    expect(v).toHaveLength(0);
  });
});

// ─── D-14 — ADR cross-file check (HARD FAIL) ────────────────────────────────

describe("checkAdr (D-14, HARD FAIL, cross-file)", () => {
  it("flags new domain without ADR", () => {
    const diff: DiffData = {
      modified: new Map(),
      added: ["src/domains/messaging/dm.ts"],
      allFiles: ["src/domains/messaging/dm.ts"],
    };
    const v = checkAdr(diff);
    expect(v).toHaveLength(1);
    expect(v[0].severity).toBe("fail");
    expect(v[0].detector).toBe("D-14");
    expect(v[0].message).toContain("messaging");
  });
  it("does NOT flag when ADR is also in diff", () => {
    const diff: DiffData = {
      modified: new Map(),
      added: ["src/domains/messaging/dm.ts", "docs/adr/0019-messaging.md"],
      allFiles: ["src/domains/messaging/dm.ts", "docs/adr/0019-messaging.md"],
    };
    expect(checkAdr(diff)).toHaveLength(0);
  });
  it("flags multiple new domains in one diff", () => {
    const diff: DiffData = {
      modified: new Map(),
      added: ["src/domains/messaging/dm.ts", "src/domains/automation/runner.ts"],
      allFiles: ["src/domains/messaging/dm.ts", "src/domains/automation/runner.ts"],
    };
    const v = checkAdr(diff);
    expect(v).toHaveLength(2);
    expect(v.map((x) => x.message).join(" ")).toContain("messaging");
    expect(v.map((x) => x.message).join(" ")).toContain("automation");
  });
  it("does NOT flag when only existing domain is touched", () => {
    const diff: DiffData = {
      modified: new Map([["src/domains/discovery/feed.ts", new Set([1])]]),
      added: [],
      allFiles: ["src/domains/discovery/feed.ts"],
    };
    expect(checkAdr(diff)).toHaveLength(0);
  });
});

// ─── findCatchBlocks — safety cap on runaway bodies ────────────────────────

describe("findCatchBlocks — safety", () => {
  it("does not hang on a catch with no closing brace (bails after character cap)", () => {
    const body = Array.from({ length: 250 }, () => "  doStuff();").join("\n");
    const code = `try { x(); }\ncatch (e) {\n${body}\n`;
    const blocks = findCatchBlocks(code);
    expect(blocks.length).toBeLessThanOrEqual(1);
  });
});

// ─── collectAudit / collectDiff integration ────────────────────────────────

describe("collectAudit (full-repo walk)", () => {
  it("walks src/ and returns at least one .ts/.tsx file", () => {
    const data = collectAudit();
    expect(data.allFiles.length).toBeGreaterThan(0);
    expect(data.allFiles.some((f) => f.startsWith("src/domains/"))).toBe(true);
    for (const f of data.allFiles) {
      expect(f).toMatch(/\.(ts|tsx)$/);
    }
  });
  it("audit mode: all lines are targets (empty modified maps)", () => {
    const data = collectAudit();
    for (const [, set] of data.modified) {
      expect(set.size).toBe(0);
    }
  });
});

describe("collectDiff (CI mode)", () => {
  it("returns empty data when base is HEAD (clean main, no diff)", () => {
    const data = collectDiff("HEAD");
    expect(data.allFiles).toHaveLength(0);
  });
  it("returns empty data when base ref does not exist (shallow clone fallback)", () => {
    const data = collectDiff("nonexistent-ref-xyz123");
    expect(data.allFiles).toHaveLength(0);
    expect(data.modified.size).toBe(0);
    expect(data.added).toHaveLength(0);
  });
});