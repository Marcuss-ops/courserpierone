"use client";

import { useState, useEffect } from "react";
import { FileText, Download, Loader2, File, FileAudio } from "lucide-react";
import { t } from "@/lib/player-locale";

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
}

export function LessonAssets({ lessonId, locale, isAuthenticated }: LessonAssetsProps) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);

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

  if (!isAuthenticated || loading) return null;

  if (assets.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-3">
      {assets.map((asset) => (
        <a
          key={asset.id}
          href={asset.fileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="px-5 py-3 premium-glass rounded-2xl text-sm font-bold text-accent-primary hover:text-white transition-all flex items-center gap-2 group"
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
