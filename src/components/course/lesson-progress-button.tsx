"use client";

import { useState, useEffect, useCallback } from "react";
import { CheckCircle2, Loader2, Lock } from "lucide-react";
import { t } from "@/lib/i18n/player-locale";

import { useSearchParams } from "next/navigation";

interface LessonProgressButtonProps {
  lessonId: string;
  productSlug: string;
  isAuthenticated: boolean;
  /**
   * True if this is a free/open-access course. The button still
   * requires authentication to toggle progress (API requires a user);
   * for free-course guests the button stays in the "Login to complete"
   * disabled state, matching the non-authenticated behavior.
   */
  isFreeCourse?: boolean;
}

export function LessonProgressButton({
  lessonId,
  productSlug,
  isAuthenticated,
  isFreeCourse: _isFreeCourse,
}: LessonProgressButtonProps) {
  const [completed, setCompleted] = useState(false);
  const [loading, setLoading] = useState(false);
  const searchParams = useSearchParams();
  const isLight = searchParams.get("theme") === "light";
  const currentLang = searchParams.get("lang") || "it";

  const fetchProgress = useCallback(async () => {
    try {
      const res = await fetch(`/api/progress?productSlug=${productSlug}`);
      if (res.ok) {
        const data = await res.json();
        const lessonIds = data.progress.map((p: { lessonId: string; completed: boolean }) => p.lessonId);

        setCompleted(lessonIds.includes(lessonId));
      }
    } catch (e) {
      console.warn("[Progress] Failed to fetch progress:", e);
    }
  }, [lessonId, productSlug]);

  useEffect(() => {
    if (isAuthenticated) {
      void fetchProgress(); // eslint-disable-line react-hooks/set-state-in-effect -- TODO: refactor (FASE 1.10)
    }
  }, [isAuthenticated, fetchProgress]);

  const toggleComplete = async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    try {
      const res = await fetch("/api/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lessonId,
          completed: !completed,
        }),
      });
      if (res.ok) {
        setCompleted(!completed);
        // Also track analytics
        if (!completed) {
          fetch("/api/analytics", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              eventType: "lesson_complete",
              productSlug,
              metadata: { lessonId },
            }),
          }).catch((e) => console.warn("[Analytics] Failed to track lesson complete:", e));
        }
        await fetchProgress(); // Refresh progress
      }
    } catch (e) {
      console.warn("[Progress] Failed to toggle completion:", e);
    } finally {
      setLoading(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <button
        disabled
        className={`px-6 py-3 rounded-2xl text-sm font-bold text-zinc-500 flex items-center gap-2 cursor-not-allowed opacity-60 border ${
          isLight ? "bg-zinc-100 border-zinc-200" : "premium-glass border-white/5"
        }`}
      >
        <Lock className="w-4 h-4" />
        {t(currentLang, "loginToComplete")}
      </button>
    );
  }

  return (
    <div className="flex gap-4">
      <button
        onClick={toggleComplete}
        disabled={loading}
        className={`px-6 py-3 rounded-2xl text-sm font-bold transition-all flex items-center gap-2 border ${
          isLight 
            ? "bg-zinc-100 hover:bg-zinc-200 border-zinc-200" 
            : "premium-glass hover:bg-white/5 border-white/5"
        } ${
          completed
            ? "text-accent-tertiary border border-accent-tertiary/30"
            : isLight ? "text-zinc-800 hover:text-zinc-950" : "text-white hover:text-white"
        }`}
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : completed ? (
          <CheckCircle2 className="w-4 h-4 text-accent-tertiary" />
        ) : (
          <CheckCircle2 className="w-4 h-4" />
        )}
        {completed ? t(currentLang, "completed") : t(currentLang, "markComplete")}
      </button>
    </div>
  );
}

// ─── Progress Bar Component ────────────────────────────────

interface ProgressBarProps {
  productSlug: string;
  totalLessons: number;
  isAuthenticated: boolean;
  /**
   * True if this is a free/open-access course. Free-course guests
   * don't see the progress bar (API requires auth to fetch stats).
   */
  isFreeCourse?: boolean;
}

export function ProgressBar({
  productSlug,
  totalLessons,
  isAuthenticated,
  isFreeCourse: _isFreeCourse,
}: ProgressBarProps) {
  const [percent, setPercent] = useState(0);
  const searchParams = useSearchParams();
  const isLight = searchParams.get("theme") === "light";

  useEffect(() => {
    if (!isAuthenticated) return;
    fetch(`/api/progress?productSlug=${productSlug}`)
      .then((r) => r.json())
      .then((data) => {
        const completed = data.progress.filter((p: { completed: boolean }) => p.completed).length;
        if (totalLessons > 0) {
          setPercent(Math.round((completed / totalLessons) * 100));
        }
      })
      .catch((e) => console.warn("[Progress] Failed to load stats:", e));
  }, [productSlug, totalLessons, isAuthenticated]);

  if (!isAuthenticated) return null;

  return (
    <div className="flex items-center gap-2 mt-3">
      <div className={`w-full h-1.5 rounded-full overflow-hidden ${isLight ? "bg-zinc-200" : "bg-white/5"}`}>
        <div
          className="bg-accent-primary h-full shadow-[0_0_10px_#4d8eff] transition-all duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="text-[10px] font-black text-accent-primary">{percent}%</span>
    </div>
  );
}
