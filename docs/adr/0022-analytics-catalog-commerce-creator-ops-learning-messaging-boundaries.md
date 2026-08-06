# ADR 0022 — Analytics, Catalog, Commerce, Creator Ops, Learning and Messaging boundaries

- **Status:** Accepted
- **Date:** 2026-08-06
- **Deciders:** Platform architecture review
- **Related:** ADR-0016 (modular monolith), ADR-0018 (ten-domain boundaries), ADR-0021 (quality governance)

## Decision

The existing vertical slices keep explicit ownership under `src/domains`:

- **Analytics** owns event identity and analytics application contracts.
- **Catalog** owns bundled/content registry and creator content rules.
- **Commerce** owns checkout pricing and payment-domain contracts.
- **Creator Ops** owns creator onboarding, creator access, and creator read models.
- **Learning** owns continue-watching and learning progress use cases.
- **Messaging** owns offer-card and messaging eligibility policies.

Each slice follows the modular-monolith dependency direction:

```text
Route/UI → application use case → domain rule → port → adapter
```

Cross-domain consumers use public contracts. Domain rules do not import Prisma or
UI code. Persistence remains in adapters and shared infrastructure remains in
`src/lib` only while a compatibility migration is active.

## Consequences

These domains can evolve and be tested independently while remaining in one
repository and deployment. Their public contracts are subject to the import and
registry quality gates. A future extraction or consolidation must update this ADR
and preserve the dependency direction.

## Verification

```bash
npm run check:architecture
npm run check:registry-drift
npm run check:full
```
