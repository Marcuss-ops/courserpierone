# ADR-0020: Identity & Access vertical slice

- **Status:** Accepted
- **Date:** 2026-08-06
- **Scope:** Product access resolution

## Context

Product access was previously implemented in `src/lib/commerce/access/resolve-product-access.ts`. That module mixed the access decision with Prisma persistence and became the shared dependency of routes, server components, and messaging code. The result was a stable behavior contract but no explicit application/domain/persistence boundary.

The first migration slice must preserve behavior while making the dependency direction enforceable and testable.

## Decision

The canonical Identity & Access flow is:

```text
Route / server component
  -> src/domains/identity/index.ts (composition root)
  -> application/resolve-product-access.ts (use case)
  -> domain/access-decision.ts and access-reasons.ts (pure rules)
  -> ports/product-access-port.ts (persistence contract)
  -> adapters/prisma-product-access-adapter.ts (Prisma implementation)
```

The use case preserves the existing result and input contract, including:

- Product id/slug resolution and CUID fast path;
- administrator bypass after product existence validation;
- active, non-expired `AccessGrant` checks;
- pending/refunded order denial classification;
- provider-scoped anonymous checkout lookup.

Existing imports from `@/lib/commerce/access/resolve-product-access` remain supported temporarily as a re-export shim. Runtime consumers use `@/domains/identity` directly so the new composition root is exercised in production code.

## Consequences

- Domain, application, and port files do not import Prisma or route/UI modules.
- Persistence changes are isolated to the adapter and can be replaced by a test double.
- Existing callers keep the same result shape during the incremental migration.
- The compatibility shim can be removed after external consumers are migrated and a separate cleanup change is reviewed.

## Verification

The slice has focused use-case tests, legacy compatibility tests, and an architecture test that checks persistence isolation and canonical consumer imports. The release quality gate remains responsible for typecheck, lint, unit tests, integration tests, migrations, build, E2E, and deploy aggregation.
