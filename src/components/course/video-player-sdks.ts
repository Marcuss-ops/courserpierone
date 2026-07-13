// Local type shim for the YouTube IFrame API + Vimeo Player API surface used
// by ./premium-video-player.tsx. Mirrors the codebase's pattern of locally-
// generated types (cf. src/lib/supabase/database.types.ts) instead of pulling
// in @types/youtube or @types/vimeo-player as dev dependencies. See ADR 0010
// (lint cleanup) C3 batch 2 — the type-aware sweep that produced this shim.

/** YouTube IFrame API PlayerState enum values (subset of @types/youtube). */
export type YTPlayerState = -1 | 0 | 1 | 2 | 3 | 5;

/** Payload of the YouTube IFrame API `onStateChange` event. */
export interface YTOnStateChangeEvent {
  data: YTPlayerState;
}

/** Payload of the YouTube IFrame API `onReady` event. */
export interface YTOnReadyEvent {
  target: YTPlayer;
}

/** YouTube IFrame API `YT.Player` constructor options (subset used here). */
export interface YTPlayerOptions {
  events?: {
    onReady?: (event: YTOnReadyEvent) => void;
    onStateChange?: (event: YTOnStateChangeEvent) => void;
  };
}

/** YouTube IFrame API `YT.Player` instance (methods this component uses). */
export interface YTPlayer {
  setVolume(volume: number): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  playVideo(): void;
  pauseVideo(): void;
  mute(): void;
  unMute(): void;
  setPlaybackRate(rate: number): void;
}

/** YouTube IFrame API `YT` namespace (subset used here). */
export interface YTNamespace {
  Player: new (element: HTMLElement, options?: YTPlayerOptions) => YTPlayer;
}

/** Payload of the Vimeo Player API `timeupdate` event. */
export interface VimeoTimeUpdateData {
  seconds: number;
  percent: number;
  duration: number;
}

/** Vimeo Player API `Vimeo.Player` instance (methods this component uses). */
export interface VimeoPlayer {
  setCurrentTime(seconds: number): Promise<number>;
  getDuration(): Promise<number>;
  on(event: "timeupdate", callback: (data: VimeoTimeUpdateData) => void): void;
  ready(): Promise<void>;
}

/** Vimeo Player API `Vimeo` namespace (subset used here). */
export interface VimeoNamespace {
  Player: new (element: HTMLElement) => VimeoPlayer;
}

/**
 * Type guard: narrows `YTPlayer | VimeoPlayer | null` to `YTPlayer`.
 *
 * The two SDK surfaces are structurally disjoint on the methods used here:
 * - `YTPlayer` has `seekTo(seconds, allowSeekAhead)` (YouTube IFrame API)
 * - `VimeoPlayer` has `setCurrentTime(seconds)` (Vimeo Player API)
 *
 * The `in` check is type-safe because both interfaces are nominal from
 * the consumer's perspective (we never have an object that's both).
 *
 * The `p !== null` short-circuit handles the initial `useRef<...>(null)`
 * value before the SDK loads — the ref stays null until the YT/Vimeo
 * SDK is fetched and the player instance is assigned.
 */
export function isYTPlayer(
  p: YTPlayer | VimeoPlayer | null,
): p is YTPlayer {
  return p !== null && "seekTo" in p;
}

declare global {
  interface Window {
    YT?: YTNamespace;
    Vimeo?: VimeoNamespace;
  }
}
