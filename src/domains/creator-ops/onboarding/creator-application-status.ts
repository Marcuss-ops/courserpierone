/**
 * src/domains/creator-ops/onboarding/creator-application-status.ts
 *
 * Phase 6 — Creator Application Status Machine.
 *
 * Canonical 5 states for the external-creator onboarding flow.
 * Terminal states: approved, rejected.
 */

export type CreatorApplicationStatus =
  | "draft"
  | "submitted"
  | "under_review"
  | "approved"
  | "rejected";

export const CREATOR_APPLICATION_STATUSES: ReadonlySet<CreatorApplicationStatus> = new Set([
  "draft",
  "submitted",
  "under_review",
  "approved",
  "rejected",
]);

export const TERMINAL_CREATOR_APPLICATION_STATUSES: ReadonlySet<CreatorApplicationStatus> =
  new Set<CreatorApplicationStatus>(["approved", "rejected"]);

export const CREATOR_APPLICATION_TRANSITIONS: ReadonlyMap<
  CreatorApplicationStatus,
  ReadonlySet<CreatorApplicationStatus>
> = new Map<CreatorApplicationStatus, ReadonlySet<CreatorApplicationStatus>>([
  ["draft", new Set<CreatorApplicationStatus>(["submitted"])],
  ["submitted", new Set<CreatorApplicationStatus>(["under_review", "approved", "rejected"])],
  ["under_review", new Set<CreatorApplicationStatus>(["approved", "rejected"])],
  ["approved", new Set<CreatorApplicationStatus>([])],
  ["rejected", new Set<CreatorApplicationStatus>([])],
]);

export function isValidCreatorApplicationTransition(
  from: CreatorApplicationStatus,
  to: CreatorApplicationStatus,
): boolean {
  return CREATOR_APPLICATION_TRANSITIONS.get(from)?.has(to) ?? false;
}

export function assertValidCreatorApplicationTransition(
  from: CreatorApplicationStatus,
  to: CreatorApplicationStatus,
): void {
  if (!isValidCreatorApplicationTransition(from, to)) {
    throw new Error(
      `Invalid CreatorApplication transition: ${from} → ${to}. ` +
        `Allowed: ${Array.from(CREATOR_APPLICATION_TRANSITIONS.get(from) ?? []).join(", ") || "(none)"}`,
    );
  }
}

export function isTerminalCreatorApplicationStatus(
  status: CreatorApplicationStatus,
): boolean {
  return TERMINAL_CREATOR_APPLICATION_STATUSES.has(status);
}
