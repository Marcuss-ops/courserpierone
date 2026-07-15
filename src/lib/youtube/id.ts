/**
 * src/lib/youtube/id.ts
 *
 * Shared YouTube utilities used by both the lesson player
 * (src/components/course/premium-video-player.tsx) and the portal
 * lesson cards (src/app/(locale)/[locale]/[domain]/(member)/page.tsx).
 *
 * Centralized here so the URL → ID parsing logic isn't duplicated
 * (DRY) — previously each consumer had its own inline regex split,
 * which is fragile and easy to drift.
 */

/**
 * Extract the YouTube video ID from any of the supported URL formats:
 *   - https://www.youtube.com/watch?v=<id>
 *   - https://www.youtube.com/embed/<id>
 *   - https://youtu.be/<id>
 * Returns `null` for non-YouTube URLs (Vimeo, MP4, etc.) or invalid
 * input. The function never throws — callers can use the nullish
 * return to fall back to a non-YouTube embed path.
 */
export function extractYouTubeId(
  url: string | null | undefined,
): string | null {
  if (!url) return null;
  if (url.includes("youtube.com/embed/")) {
    return url.split("youtube.com/embed/")[1]?.split(/[?&]/)[0] || null;
  }
  if (url.includes("youtube.com/watch")) {
    try {
      return new URL(url).searchParams.get("v") || null;
    } catch {
      return null;
    }
  }
  if (url.includes("youtu.be/")) {
    return url.split("youtu.be/")[1]?.split(/[?&]/)[0] || null;
  }
  return null;
}

/**
 * Build the public YouTube thumbnail URL for a given video ID.
 * Google's CDN serves these without auth — no API key required.
 *
 * Quality names match YouTube's actual CDN suffixes — the type IS the
 * suffix, so the template is just `${quality}` (no string concatenation
 * that could double the "default" segment). Suffixes:
 *   - "default.jpg"      (120x90)
 *   - "mqdefault.jpg"    (320x180)
 *   - "hqdefault.jpg"    (480x360)  ← default
 *   - "sddefault.jpg"    (640x480)
 *   - "maxresdefault.jpg" (1280x720, may not exist for all videos)
 */
export type YouTubeThumbnailQuality =
  | "default.jpg"
  | "mqdefault.jpg"
  | "hqdefault.jpg"
  | "sddefault.jpg"
  | "maxresdefault.jpg";

export function youTubeThumbnailUrl(
  id: string,
  quality: YouTubeThumbnailQuality = "hqdefault.jpg",
): string {
  return `https://img.youtube.com/vi/${id}/${quality}`;
}
