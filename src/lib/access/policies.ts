/**
 * Temporary compatibility shim.
 * Canonical Identity & Access policy API: `@/domains/identity`.
 */
export {
  evaluateAccess,
  evaluatePolicy,
} from "@/domains/identity";
export type {
  AccessContext,
  AccessDecision,
  AccessDenyReason,
  AccessAllowReason,
  AccessPolicy,
} from "@/domains/identity";
