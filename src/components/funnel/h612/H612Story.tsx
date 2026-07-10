// ─── H612Story — Thin wrapper ───────────────────────────

import { SharedStory } from "@/components/funnel/shared/SharedStory";
import type { H612LocaleContent, H612T } from "./types";

interface H612StoryProps {
  storia?: string;
  coverUrl?: string;
  lc?: H612LocaleContent;
  t: H612T;
}

export function H612Story({ storia, coverUrl, lc, t }: H612StoryProps) {
  return (
    <SharedStory
      storia={storia}
      coverUrl={coverUrl}
      variant="h612"
      badgeText={lc?.story?.badge || t("our_story", "Our Story")}
      coverPlaceholder={
        <>
          <div
            className="absolute h-32 w-32 rounded-full opacity-60"
            style={{
              background: "linear-gradient(135deg, #4facfe, #00f2fe)",
              filter: "blur(40px)",
              animation: "liquidFlow 6s ease-in-out infinite",
            }}
          />
          <div
            className="absolute h-24 w-24 rounded-full opacity-40"
            style={{
              background: "linear-gradient(135deg, #f093fb, #f5576c)",
              filter: "blur(30px)",
              animation: "liquidFlow 8s ease-in-out infinite reverse",
              top: "30%",
              left: "60%",
            }}
          />
          <div className="relative z-10 text-center">
            <div
              className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-xl"
              style={{ background: "#2a2a2a" }}
            >
              <span className="text-2xl">📖</span>
            </div>
            <p className="text-sm" style={{ color: "#8e9192" }}>
              {t("cover_placeholder", "Cover del Prodotto")}
            </p>
          </div>
        </>
      }
    />
  );
}
