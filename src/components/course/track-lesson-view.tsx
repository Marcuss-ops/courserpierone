"use client";

import { useEffect } from "react";

interface TrackLessonViewProps {
  lessonId: string;
  isAuthenticated: boolean;
  /**
   * True if this is a free/open-access course. Even free-course guests
   * are NOT tracked (the API requires an authenticated user); the prop
   * is accepted for consistency with other lesson components.
   */
  isFreeCourse?: boolean;
}

/**
 * Client component that tracks when a user views a lesson.
 * Updates lastWatchedAt on LessonProgress for "Continue Learning" feature.
 */
export function TrackLessonView({ lessonId, isAuthenticated, isFreeCourse: _isFreeCourse }: TrackLessonViewProps) {
  useEffect(() => {
    if (!isAuthenticated) return;

    // Debounce: track after 5 seconds (avoid tracking on quick page flips)
    const timer = setTimeout(() => {
      fetch("/api/progress/track-watch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonId }),
      }).catch((e) => console.warn("[TrackLesson] Failed to track view:", e));
    }, 5000);

    return () => clearTimeout(timer);
  }, [lessonId, isAuthenticated]);

  return null;
}
