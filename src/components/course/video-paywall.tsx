"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Lock, Play, Loader2, Eye, Clock, ArrowRight } from "lucide-react";
import { t } from "@/lib/i18n/player-locale";
import { PremiumVideoPlayer } from "./premium-video-player";

interface VideoPaywallProps {
  videoUrl: string;
  title: string;
  productSlug: string;
  lessonId: string;
  isAuthenticated: boolean;
  /**
   * True if this is a free/open-access course (slug in NEXT_PUBLIC_FREE_COURSE_SLUGS
   * + price === 0). Bypasses the isAuthenticated check and renders the
   * video for any guest. See src/lib/courses/is-free-course.ts.
   */
  isFreeCourse?: boolean;
  locale?: string;
  /** Seconds before showing the paywall overlay (default: 120 = 2 min) */
  previewDuration?: number;
}

// Fallback placeholder when no video URL is provided
function VideoPlaceholder() {
  return (
    <div className="w-full h-full flex items-center justify-center bg-zinc-900">
      <div className="text-center">
        <Play className="w-16 h-16 text-zinc-700 mx-auto mb-4" />
        <p className="text-zinc-600 text-sm font-medium">Video non disponibile</p>
      </div>
    </div>
  );
}

export function VideoPaywall({
  videoUrl,
  title,
  productSlug,
  lessonId,
  isAuthenticated,
  isFreeCourse = false,
  locale = "it",
  previewDuration = 120,
}: VideoPaywallProps) {
  const router = useRouter();
  const [hasAccess, setHasAccess] = useState<boolean | null>(
    isFreeCourse ? true : isAuthenticated ? null : false
  );
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [showOverlay, setShowOverlay] = useState(false);
  const [checking, setChecking] = useState(true);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const previewDurationRef = useRef(previewDuration);

  // Keep ref in sync without re-running the timer effect
  useEffect(() => {
    previewDurationRef.current = previewDuration;
  }, [previewDuration]);

  // Check access via API
  useEffect(() => {
    async function checkAccess() {
      try {
        const res = await fetch(`/api/access?productId=${productSlug}`);
        const data = await res.json();
        setHasAccess(data.hasAccess);
      } catch (e) {
        console.warn("[VideoPaywall] Failed to check access:", e);
        setHasAccess(false);
      } finally {
        setChecking(false);
      }
    }

    // Free courses: guests have full access without any API check.
    // Short-circuit BEFORE the isAuthenticated guard so the video renders.
    if (isFreeCourse) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- initial access bootstrap for free courses
      setHasAccess(true);
      setChecking(false);
      return;
    }
    if (!isAuthenticated) {
      setHasAccess(false);  
      setChecking(false);
      return;
    }
    void checkAccess();
  }, [productSlug, isAuthenticated, isFreeCourse]);

  // Timer countdown — starts 3s after page load for preview duration
  useEffect(() => {
    if (hasAccess || checking) return;

    const startDelay = setTimeout(() => {
      if (!timerRef.current) {
        timerRef.current = setInterval(() => {
          setTimeElapsed((prev) => {
            const next = prev + 1;
            if (next >= previewDurationRef.current) {
              setShowOverlay(true);
              if (timerRef.current) clearInterval(timerRef.current);
            }
            return next;
          });
        }, 1000);
      }
    }, 3000);

    return () => {
      clearTimeout(startDelay);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [hasAccess, checking]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const timeLeft = Math.max(0, previewDuration - timeElapsed);
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  // Fetch video URL via API when access is granted (server-side gate).
  // The URL is NEVER taken from the prop — it must pass the API access check.
  useEffect(() => {
    if (!hasAccess) return;
    const fetchUrl = async () => {
      try {
        const params = new URLSearchParams({ lessonId, productSlug, lang: locale });
        const res = await fetch(`/api/videos/stream?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          setSignedUrl(data.videoUrl);
        }
      } catch (e) {
        console.warn("[VideoPaywall] Failed to fetch video URL:", e);
      }
    };
    void fetchUrl();
  }, [hasAccess, lessonId, productSlug, locale]);

  // If user has full access, show video via API-fetched URL only.
  // The videoUrl prop is intentionally ignored here — must pass server-side access gate.
  if (hasAccess) {
    if (!signedUrl) {
      return (
        <div className="relative aspect-video w-full rounded-[2.5rem] overflow-hidden premium-glass border border-white/10 shadow-2xl">
          <div className="absolute inset-0 flex items-center justify-center bg-black/70">
            <Loader2 className="w-8 h-8 animate-spin text-accent-primary" />
          </div>
        </div>
      );
    }
    return (
      <div className="relative aspect-video w-full rounded-[2.5rem] overflow-hidden premium-glass border border-white/10 shadow-2xl">
        <PremiumVideoPlayer
          videoUrl={signedUrl}
          productSlug={productSlug}
          title={title}
        />
      </div>
    );
  }

  // Show preview with paywall overlay (only render iframe behind the overlay)
  return (
    <div className="relative aspect-video w-full rounded-[2.5rem] overflow-hidden premium-glass border border-white/10 shadow-2xl group">
      {/* Loading state */}
      {checking && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70">
          <Loader2 className="w-8 h-8 animate-spin text-accent-primary" />
        </div>
      )}

      {/* Video preview - only render if we have a URL and not checking access */}
      {!checking && videoUrl ? (
        <iframe
          src={videoUrl}
          className="w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      ) : !checking ? (
        <VideoPlaceholder />
      ) : null}

      {/* Gradient overlay (always present, heavier when paywall is active) */}
      <div
        className={`absolute inset-0 transition-opacity duration-700 pointer-events-none ${
          showOverlay ? "opacity-100" : "opacity-60"
        }`}
        style={{
          background: showOverlay
            ? "linear-gradient(180deg, rgba(5,5,5,0.3) 0%, rgba(5,5,5,0.95) 60%, #050505 100%)"
            : "linear-gradient(180deg, transparent 40%, rgba(5,5,5,0.6) 100%)",
        }}
      />

      {/* Preview timer badge (before paywall triggers) */}
      {!showOverlay && !checking && (
        <div className="absolute top-6 left-6 flex items-center gap-2 px-4 py-2 premium-glass rounded-full border border-white/10 shadow-lg z-20">
          <Clock className="w-4 h-4 text-accent-primary" />
          <span className="text-xs font-black text-white uppercase tracking-wider">
            {t(locale, "preview")} {minutes}:{seconds.toString().padStart(2, "0")}
          </span>
        </div>
      )}

      {/* Paywall overlay */}
      {showOverlay && (
        <div className="absolute inset-0 z-20 flex items-center justify-center p-6 lg:p-12">
          <div className="max-w-lg w-full space-y-6 text-center animate-fadeIn">
            {/* Lock icon */}
            <div className="w-20 h-20 mx-auto premium-glass rounded-full flex items-center justify-center border border-white/10 shadow-2xl">
              <Lock className="w-10 h-10 text-accent-primary" />
            </div>

            {/* Messaggio */}
            <div className="space-y-3">
              <h3 className="text-2xl lg:text-3xl font-black text-white text-contrast tracking-tight">
                {t(locale, "previewEnded")}
              </h3>
              <p className="text-zinc-400 text-sm lg:text-base font-medium leading-relaxed max-w-md mx-auto">
                {t(locale, "previewDesc", { minutes: previewDuration / 60, title })}
              </p>
            </div>

            {/* CTA buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4">
              <a
                href={`/${productSlug}`}
                className="glow-btn px-8 py-4 rounded-2xl text-sm font-black text-white premium-glass flex items-center gap-2 group/btn w-full sm:w-auto justify-center"
              >
                <Play className="w-4 h-4 fill-current" />
                {t(locale, "buyNow")}
                <ArrowRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />
              </a>
              <button
                onClick={() => router.push(`/login?productId=${productSlug}`)}
                className="px-8 py-4 premium-glass rounded-2xl text-sm font-black text-zinc-300 hover:text-white transition-all border border-white/5 flex items-center gap-2 w-full sm:w-auto justify-center"
              >
                <Eye className="w-4 h-4" />
                {t(locale, "alreadyBought")}
              </button>
            </div>

            {/* Trust badge */}
            <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest flex items-center justify-center gap-2">
              <Lock className="w-3 h-3" /> {t(locale, "secureTransaction")}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
