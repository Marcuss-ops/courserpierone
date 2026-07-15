"use client";

import { useState } from "react";
import { Play, Check } from "lucide-react";

interface LessonThumbnailProps {
  /**
   * YouTube hqdefault.jpg URL (or null for non-YouTube lessons).
   * When null OR when the <img> onError fires, the component falls back
   * to a dark placeholder with a Play icon.
   */
  thumbnailUrl: string | null;
  /** Alt text for the <img>. Falls back to "Lesson" if empty. */
  title: string;
  /** Lesson duration (e.g. "5:00"). Shown as a YouTube-style badge overlay. */
  duration?: string;
  /** True if the user has completed this lesson. Shows a gold checkmark. */
  isCompleted?: boolean;
  /**
   * Extra classes for the inner <img> hover effect. Defaults to
   * `group-hover:scale-105 transition-transform duration-500` — works
   * as long as the parent <Link> has the `group` Tailwind class.
   */
  imageClassName?: string;
}

/**
 * LessonThumbnail — the YouTube-style thumbnail used in the portal
 * lesson cards (src/app/(locale)/[locale]/[domain]/(member)/page.tsx).
 *
 * Extracted as a Client Component because `onError` requires event
 * handlers (Server Components can't attach them). The error state is
 * a simple boolean — `true` means the YouTube thumbnail 404'd (or the
 * video was deleted/made private) and we should show the fallback
 * placeholder instead of a broken image.
 *
 * Why not use next/image with onError?
 *   - next/image is for optimized local/remote images. YouTube serves
 *     the thumbnail directly from Google's CDN; we don't need our
 *     optimizer in the path.
 *   - next/image's onError would require "use client" + the same
 *     useState boilerplate we're already using here.
 *   - The fallback is a simple dark div with a Play icon, not an
 *     image — so we don't need image optimization for it either.
 */
export function LessonThumbnail({
  thumbnailUrl,
  title,
  duration,
  isCompleted,
  imageClassName = "w-full h-full object-cover group-hover:scale-105 transition-transform duration-500",
}: LessonThumbnailProps) {
  // Track whether the YouTube thumbnail failed to load (e.g. the
  // video was deleted or made private after the lesson was created).
  // Initial state is `false`; flips to `true` when the <img> onError
  // fires. Then the fallback placeholder takes over for the rest of
  // the component's lifetime (no retry — YouTube doesn't change its
  // mind).
  const [errored, setErrored] = useState(false);
  const showImage = thumbnailUrl !== null && !errored;

  return (
    <div className="relative w-full sm:w-44 md:w-56 shrink-0 aspect-video sm:aspect-auto bg-black overflow-hidden">
      {showImage ? (
        // Using a plain <img> (not next/image): the YouTube thumbnail
        // is served from Google's CDN, which doesn't need our image
        // optimizer. `unoptimized` with next/image would also work
        // but adds a processing hop for a 3rd-party URL.
        <img
          src={thumbnailUrl ?? ""}
          alt={title || "Lesson"}
          className={imageClassName}
          loading="lazy"
          onError={() => setErrored(true)}
        />
      ) : (
        <div className="w-full h-full min-h-[140px] flex items-center justify-center bg-cream-dark-bg">
          <Play className="w-12 h-12 text-cream-dark-text-soft/30 fill-current" />
        </div>
      )}

      {/* Duration badge (YouTube-style bottom-right overlay) — shown
          whenever the lesson has a duration, regardless of whether
          the thumbnail loaded. The badge is positioned absolutely on
          the thumbnail container, so it's visible over the placeholder
          too (useful for non-YouTube lessons that still have a
          duration in the course config). */}
      {duration && (
        <span className="absolute bottom-2 right-2 bg-black/85 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
          {duration}
        </span>
      )}

      {/* Completion checkmark (top-left overlay) — gold accent badge
          shown when the user has marked the lesson as complete. */}
      {isCompleted && (
        <span className="absolute top-2 left-2 inline-flex items-center justify-center w-7 h-7 rounded-full bg-cream-dark-gold text-cream-dark-bg shadow-lg">
          <Check className="w-3.5 h-3.5" />
        </span>
      )}
    </div>
  );
}
