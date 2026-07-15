"use client";

import { useState, useEffect } from "react";
import { FileText, Download, FileAudio } from "lucide-react";
import { t } from "@/lib/i18n/player-locale";

import { useSearchParams } from "next/navigation";

interface Asset {
  id: string;
  type: string;
  fileUrl: string;
  fileName: string | null;
}

interface LessonAssetsProps {
  lessonId: string;
  locale: string;
  isAuthenticated: boolean;
  /**
   * True if this is a free/open-access course. Guests can see and
   * download assets without authentication. The /api/lessons/:id/assets
   * endpoint must allow public reads for free courses — if it returns
   * 401 for guests, the UI will gracefully render nothing.
   */
  isFreeCourse?: boolean;
}

export function LessonAssets({ lessonId, locale, isAuthenticated, isFreeCourse = false }: LessonAssetsProps) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const searchParams = useSearchParams();
  const isLight = searchParams.get("theme") === "light";

  useEffect(() => {
    async function fetchAssets() {
      try {
        const res = await fetch(`/api/lessons/${lessonId}/assets?locale=${locale}`);
        if (res.ok) {
          const data = await res.json();
          setAssets(data.assets || []);
        }
      } catch (e) {
        console.warn("[Assets] Failed to fetch:", e);
      } finally {
        setLoading(false);
      }
    }
    void fetchAssets();
  }, [lessonId, locale]);

  // Free-course guests can see assets. For paid courses, require auth.
  if ((!isAuthenticated && !isFreeCourse) || loading) return null;

  if (assets.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-3">
      {assets.map((asset) => (
        <a
          key={asset.id}
          href={asset.fileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`px-5 py-3 rounded-2xl text-sm font-bold text-accent-primary hover:text-white transition-all flex items-center gap-2 group border ${
            isLight
              ? "bg-zinc-100 hover:bg-zinc-200 border-zinc-200"
              : "premium-glass hover:bg-white/5 border-white/5"
          }`}
        >
          {asset.type === "audio" ? (
            <FileAudio className="w-4 h-4" />
          ) : (
            <FileText className="w-4 h-4" />
          )}
          <span>{asset.fileName || t(locale, "download")}</span>
          <Download className="w-3.5 h-3.5 group-hover:translate-y-0.5 transition-transform" />
        </a>
      ))}
    </div>
  );
}
