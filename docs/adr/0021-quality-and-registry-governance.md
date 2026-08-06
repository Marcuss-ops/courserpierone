# ADR 0021 — Quality gates and registry governance

- **Status:** Accepted
- **Date:** 2026-08-06
- **Deciders:** Platform architecture review
- **Related:** ADR-0016 (modular monolith), ADR-0017 (dependency policy)

## Decision

The repository has one executable quality-gate registry:

```text
scripts/quality/quality-gates.ts
```

The registry defines the `static`, `repo`, `check` and `full` suites. Individual
checks remain independently runnable npm scripts, but suite composition is not
repeated in `package.json`, CI or documentation. `check:full` must contain every
check in `check` and additional build, integration, migration and E2E checks.
This relationship is locked by `quality-gates.test.ts`.

ESLint exceptions are reviewed data, not automation. The allowlist lives in
`scripts/quality/eslint-disable-allowlist.ts` and
`check-eslint-disables.ts` fails when a directive is added, removed, or changed
without an explicit allowlist review. The old script that appended directives
automatically has been removed; it was not a remediation mechanism.

Extensible platform concepts have one canonical registry owner:

- payment providers: `PAYMENT_PROVIDER_SLUGS` and `paymentProviderRegistry`;
- content kinds/statuses: `content-type-registry.ts`;
- agent metadata: `agent-catalog.ts` and runtime manifests in `agent-registry.ts`;
- discovery policies: `POLICY_CATALOG` and `RANKING_POLICIES`.

`scripts/quality/check-registry-drift.ts` verifies duplicate-free values, provider
adapter/registration coverage, policy catalog/runtime parity, and runtime agent
manifest values. A consumer must import these contracts instead of creating a
parallel union or literal array.

## Consequences

- Quality commands have one auditable composition and `check:full` cannot silently
  become a non-superset of `check`.
- ESLint warnings remain visible and reviewable; new exceptions fail closed.
- Registry changes become explicit and drift is detected before release.
- Existing compatibility shims and legacy domain files can migrate incrementally;
  this ADR does not require a flag-day directory move.

## Verification

```bash
npm run typecheck
npm run check:eslint-disables
npm run check:registry-drift
npm exec vitest run scripts/quality --config vitest.config.ts
npm run check:full
```
