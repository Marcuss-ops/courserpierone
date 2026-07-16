/**
 * src/lib/brand/brand-migration-keys.ts
 *
 * Phase 0 — Canonical brand migration key names.
 *
 * Centralizes the localStorage keys and BroadcastChannel names used
 * during the 30-day brand migration window (ADR-0015). Keeping them
 * in one file makes them testable and prevents accidental
 * canonicalization of the legacy keys.
 */

/** Current video progress localStorage key prefix. */
export const VIDEO_PROGRESS_KEY = "courssy-progress";

/** Legacy video progress localStorage key prefix (pre-rename). */
export const VIDEO_PROGRESS_LEGACY_KEY = "courser-progress";

/** Current inbox BroadcastChannel name. */
export const INBOX_CHANNEL = "courssy-inbox";

/** Legacy inbox BroadcastChannel name (pre-rename). */
export const INBOX_CHANNEL_LEGACY = "courser-inbox";
