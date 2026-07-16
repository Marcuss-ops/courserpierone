/**
 * src/lib/brand/brand-migration-keys.test.ts
 *
 * Phase 0 — Brand migration key tests.
 *
 * These tests protect the 30-day migration window (ADR-0015):
 * the legacy keys must remain `courser-*` so users on pre-rename
 * bundles can still read their data. Accidentally canonicalizing
 * the legacy keys would break cross-version fallback.
 */

import { describe, it, expect } from "vitest";
import {
  VIDEO_PROGRESS_KEY,
  VIDEO_PROGRESS_LEGACY_KEY,
  INBOX_CHANNEL,
  INBOX_CHANNEL_LEGACY,
} from "./brand-migration-keys";

describe("brand migration keys", () => {
  it("uses canonical Courssy for the current video progress key", () => {
    expect(VIDEO_PROGRESS_KEY).toBe("courssy-progress");
  });

  it("keeps the legacy Courser video progress key for cross-version fallback", () => {
    expect(VIDEO_PROGRESS_LEGACY_KEY).toBe("courser-progress");
  });

  it("uses canonical Courssy for the current inbox channel", () => {
    expect(INBOX_CHANNEL).toBe("courssy-inbox");
  });

  it("keeps the legacy Courser inbox channel for cross-version fallback", () => {
    expect(INBOX_CHANNEL_LEGACY).toBe("courser-inbox");
  });
});
