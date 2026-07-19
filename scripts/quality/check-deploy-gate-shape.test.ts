/**
 * scripts/quality/check-deploy-gate-shape.test.ts
 *
 * Unit tests for the deploy-gate regression guard. Each test mutates
 * ONE part of a canonical-good fixture so a failure pinpoints exactly
 * which invariant broke.
 *
 * Mirrors scripts/quality/hotspot-score.test.ts and
 * scripts/quality/forbid-deprecated-names.test.ts (vitest, in-place
 * sibling of the source script it covers).
 */
import { describe, it, expect } from "vitest";
import { verifyDeployGate } from "./check-deploy-gate-shape";

// Canonical-good fixture: 3 jobs (foo, quality-gate, deploy-gate) with
// the 5 invariants satisfied. `goodYaml()` clones so tests can mutate
// in isolation without bleeding into each other.
function goodYaml(): string {
  return [
    "",
    "jobs:",
    "  foo:",
    "    name: foo",
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      - name: do stuff",
    "        run: echo hi",
    "",
    "  quality-gate:",
    "    name: quality-gate",
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      - name: build",
    "        run: npm run build",
    "",
    "  deploy-gate:",
    "    name: 🚦 deploy-gate",
    "    runs-on: ubuntu-latest",
    "    needs: [typecheck, lint, unit-tests, e2e-journey, quality-gate]",
    "    if: always()",
    "    permissions:",
    "      contents: read",
    "    steps:",
    "      - name: Aggregate quality-job results",
    "        id: aggregate",
    "        env:",
    "          TC: ${{ needs.typecheck.result }}",
    "          LN: ${{ needs.lint.result }}",
    "          UT: ${{ needs.unit-tests.result }}",
    "          E2E: ${{ needs.e2e-journey.result }}",
    "          QG: ${{ needs.quality-gate.result }}",
    "        run: |",
    "          if [ \"$TC\" = \"success\" ] \\",
    "            && [ \"$LN\" = \"success\" ] \\",
    "            && [ \"$UT\" = \"success\" ] \\",
    "            && [ \"$E2E\" = \"success\" ] \\",
    "            && [ \"$QG\" = \"success\" ]; then",
    "            echo 'gate=green' >> \"$GITHUB_OUTPUT\"",
    "          else",
    "            echo 'gate=red' >> \"$GITHUB_OUTPUT\"",
    "          fi",
    "",
    "      - name: Fail the gate (set status RED)",
    "        if: steps.aggregate.outputs.gate == 'red'",
    "        run: |",
    "          echo '::error::deploy-gate is RED.'",
    "          exit 1",
    "",
  ].join("\n");
}

// ─── Happy path ───────────────────────────────────────────────────────────

describe("verifyDeployGate — happy path", () => {
  it("returns zero violations on the canonical-good fixture", () => {
    expect(verifyDeployGate(goodYaml())).toEqual([]);
  });

  it("returns zero violations when a job is appended AFTER deploy-gate (block slicing works)", () => {
    const yml =
      goodYaml() +
      "\n  trailing-job:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo trailing\n";
    expect(verifyDeployGate(yml)).toEqual([]);
  });

  it("does NOT false-match when a job is named `deploy-gate-helper:` (word-boundary on split)", () => {
    // Confirms the `\b` on the split prevents `deploy-gate-helper:*`
    // from being mistaken for the canonical `deploy-gate:*` block.
    const yml = [
      "  deploy-gate-helper:",
      "    runs-on: ubuntu-latest",
      "    needs: [typecheck, lint, unit-tests, e2e-journey, quality-gate]",
      "    steps:",
      "      - run: echo helper",
    ].join("\n");
    const v = verifyDeployGate(yml);
    // The guard short-circuits on missing `deploy-gate:` job.
    expect(v).toHaveLength(1);
    expect(v[0].invariant).toBe("deploy-gate-job-exists");
  });
});

// ─── Invariant 1 — deploy-gate job exists ────────────────────────────────

describe("verifyDeployGate — invariant 1 (job exists)", () => {
  it("flags a workflow with no deploy-gate job", () => {
    const yml = [
      "",
      "jobs:",
      "  some-other-job:",
      "    runs-on: ubuntu-latest",
      "    steps:",
      "      - run: echo hi",
      "",
    ].join("\n");
    const v = verifyDeployGate(yml);
    expect(v).toHaveLength(1);
    expect(v[0].invariant).toBe("deploy-gate-job-exists");
  });
});

// ─── Invariant 2 — needs includes quality-gate ───────────────────────────

describe("verifyDeployGate — invariant 2 (needs includes quality-gate)", () => {
  it("flags when quality-gate is removed from the needs array", () => {
    const yml = goodYaml().replace(
      "needs: [typecheck, lint, unit-tests, e2e-journey, quality-gate]",
      "needs: [typecheck, lint, unit-tests, e2e-journey]",
    );
    const v = verifyDeployGate(yml);
    expect(
      v.find((x) => x.invariant === "needs-includes-quality-gate"),
    ).toBeTruthy();
  });

  it("does NOT false-positive when quality-gate is wrapped in a multi-line YAML block", () => {
    // Anchored per-key; defensive: supports future reformat into a
    // multi-line array without breaking the guard.
    const yml = goodYaml().replace(
      "needs: [typecheck, lint, unit-tests, e2e-journey, quality-gate]",
      "needs:\n      - typecheck\n      - lint\n      - unit-tests\n      - e2e-journey\n      - quality-gate",
    );
    expect(verifyDeployGate(yml)).toEqual([]);
  });

  it("flags when a multi-line block-list `needs:` omits quality-gate", () => {
    const yml = goodYaml().replace(
      "needs: [typecheck, lint, unit-tests, e2e-journey, quality-gate]",
      "needs:\n      - typecheck\n      - lint\n      - unit-tests\n      - e2e-journey",
    );
    const v = verifyDeployGate(yml);
    expect(
      v.find((x) => x.invariant === "needs-includes-quality-gate"),
    ).toBeTruthy();
  });
});

// ─── Invariant 3 — QG env binding from needs.quality-gate.result ─────────

describe("verifyDeployGate — invariant 3 (QG env binding)", () => {
  it("flags when the QG env binding is deleted", () => {
    const yml = goodYaml().replace(
      "QG: ${{ needs.quality-gate.result }}",
      "",
    );
    const v = verifyDeployGate(yml);
    expect(v.find((x) => x.invariant === "qg-env-binding")).toBeTruthy();
  });

  it("flags when QG is bound to a different needs.* expression (e.g. needs.e2e-journey.result)", () => {
    const yml = goodYaml().replace(
      "QG: ${{ needs.quality-gate.result }}",
      "QG: ${{ needs.e2e-journey.result }}",
    );
    const v = verifyDeployGate(yml);
    expect(v.find((x) => x.invariant === "qg-env-binding")).toBeTruthy();
  });
});

// ─── Invariant 4 — QG comparison in bash ─────────────────────────────────

describe("verifyDeployGate — invariant 4 (QG success comparison)", () => {
  it("flags when the [ \"$QG\" = \"success\" ] row is removed", () => {
    const yml = goodYaml().replace(
      "&& [ \"$QG\" = \"success\" ]; then",
      "&& true; then",
    );
    const v = verifyDeployGate(yml);
    expect(
      v.find((x) => x.invariant === "qg-success-equality"),
    ).toBeTruthy();
  });

  it("flags when the QG comparison is short-circuited to [ 1 = 1 ]", () => {
    const yml = goodYaml().replace(
      '[ "$QG" = "success" ]',
      "[ 1 = 1 ]",
    );
    const v = verifyDeployGate(yml);
    expect(
      v.find((x) => x.invariant === "qg-success-equality"),
    ).toBeTruthy();
  });
});

// ─── Invariant 5 — Fail the gate step + exit 1 ────────────────────────────

describe("verifyDeployGate — invariant 5 (Fail the gate step)", () => {
  it("flags when the Fail-the-gate step is removed entirely", () => {
    // Build the YAML fresh with ALL invariants satisfied EXCEPT #5 —
    // invariant 5 must flag the missing step without false-flagging
    // the other four. Avoids string-surgery of the canonical fixture's
    // exact step name (a future rename of the canonical step name
    // must not silently no-op this test).
    const yml = [
      "  deploy-gate:",
      "    name: 🚦 deploy-gate",
      "    runs-on: ubuntu-latest",
      "    needs: [typecheck, lint, unit-tests, e2e-journey, quality-gate]",
      "    steps:",
      "      - name: Aggregate quality-job results",
      "        id: aggregate",
      "        env:",
      "          QG: ${{ needs.quality-gate.result }}",
      "        run: |",
      "          if [ \"$QG\" = \"success\" ]; then",
      "            echo 'gate=green'",
      "          else",
      "            echo 'gate=red'",
      "          fi",
      // NOTE: no Fail the gate step below — invariant 5 must flag this.
    ].join("\n");
    const v = verifyDeployGate(yml);
    expect(v.find((x) => x.invariant === "fail-the-gate-step")).toBeTruthy();
  });

  it("flags when 'exit 1' is replaced with 'exit 0' in the Fail-the-gate step", () => {
    const yml = goodYaml().replace("exit 1", "exit 0");
    const v = verifyDeployGate(yml);
    expect(v.find((x) => x.invariant === "fail-the-gate-step")).toBeTruthy();
  });

  it("does NOT false-positive when an unrelated step legitimately uses `exit 0`", () => {
    // Build a FULL invariant-satisfying YAML with an informational
    // `exit 0` step BEFORE the canonical Fail-the-gate step with
    // `exit 1`. The guard must still find the Fail-the-gate's `exit 1`
    // (i.e. return `[]`, not a violation).
    const yml = [
      "  deploy-gate:",
      "    name: 🚦 deploy-gate",
      "    needs: [typecheck, lint, unit-tests, e2e-journey, quality-gate]",
      "    steps:",
      "      - name: Aggregate quality-job results",
      "        id: aggregate",
      "        env:",
      "          QG: ${{ needs.quality-gate.result }}",
      "        run: |",
      "          if [ \"$QG\" = \"success\" ]; then",
      "            echo 'gate=green'",
      "          else",
      "            echo 'gate=red'",
      "          fi",
      "      - name: Dead exports scan (informational)",
      "        run: |",
      "          echo dead",
      "          exit 0",
      "      - name: Fail the gate (set status RED)",
      "        if: steps.aggregate.outputs.gate == 'red'",
      "        run: |",
      "          echo ::error::gate red",
      "          exit 1",
    ].join("\n");
    expect(verifyDeployGate(yml)).toEqual([]);
  });
});

// ─── Multi-violation reporting ───────────────────────────────────────────

describe("verifyDeployGate — multi-violation reporting", () => {
  it("short-circuits to ONE violation when deploy-gate job is absent (avoids noise)", () => {
    const yml = "jobs:\n  other-job:\n    runs-on: ubuntu-latest\n";
    const v = verifyDeployGate(yml);
    expect(v).toHaveLength(1);
    expect(v[0].invariant).toBe("deploy-gate-job-exists");
  });
});
