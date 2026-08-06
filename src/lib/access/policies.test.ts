import { describe, expect, it } from "vitest";
import { evaluateAccess, evaluatePolicy } from "@/domains/identity";

describe("legacy access policy compatibility shim", () => {
  it("re-exports the canonical Identity policy evaluator", () => {
    expect(evaluatePolicy({ kind: "admin_role", requiresDb: true }, {
      pathname: "/admin",
      userRole: "admin",
    })).toEqual({ action: "allow", reason: "admin" });
  });

  it("keeps default deny semantics on the canonical evaluator", () => {
    expect(evaluateAccess([], { pathname: "/protected" })).toEqual({
      action: "deny",
      reason: "default_deny",
    });
  });
});
