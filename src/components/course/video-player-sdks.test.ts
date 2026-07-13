import { describe, it, expect, vi } from "vitest";
import {
  isYTPlayer,
  type YTPlayer,
  type VimeoPlayer,
} from "./video-player-sdks";

// ─── isYTPlayer (C3 batch 2 FOLLOWUP-6) ──────────────────────
//
// The guard is the single point of truth for narrowing the
// `playerRef.current` union (YTPlayer | VimeoPlayer | null) in
// premium-video-player.tsx. All four interactive handlers
// (play/pause, mute, volume, playback-rate) depend on it for
// type-safe access to YT-only methods.

describe("isYTPlayer", () => {
  it("returns true for YTPlayer-shaped objects (has seekTo)", () => {
    // Minimal YTPlayer stub: only `seekTo` is required by the guard,
    // but we include one extra method to ensure the `in` check is
    // discriminating on `seekTo` specifically (not just truthiness
    // of any method).
    const p = {
      seekTo: vi.fn(),
      playVideo: vi.fn(),
    } as unknown as YTPlayer;
    expect(isYTPlayer(p)).toBe(true);
  });

  it("returns false for VimeoPlayer-shaped objects (no seekTo)", () => {
    // VimeoPlayer uses `setCurrentTime` (Promise-returning) instead
    // of YT's synchronous `seekTo`. The guard must reject it.
    const p = {
      setCurrentTime: async () => 0,
      getDuration: async () => 0,
    } as unknown as VimeoPlayer;
    expect(isYTPlayer(p)).toBe(false);
  });

  it("returns false for null (the initial ref value before SDK loads)", () => {
    // `useRef<YTPlayer | VimeoPlayer | null>(null)` — the ref starts
    // as null and remains null until the SDK loads. The guard must
    // not throw on null (TypeScript's `p !== null` short-circuit).
    expect(isYTPlayer(null)).toBe(false);
  });
});
