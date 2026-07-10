// ─── LumioStory — Story/features 2-column section ──────────

import type { LumioLocaleContent, LumioT } from "./types";

interface LumioStoryProps {
  storia?: string;
  coverUrl?: string;
  lc?: LumioLocaleContent;
  t: LumioT;
}

export function LumioStory({ storia, coverUrl, lc, t }: LumioStoryProps) {
  if (!storia) return null;

  return (
    <section id="features" className="py-20">
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid items-center gap-12 md:grid-cols-2">
          {/* Cover / Placeholder */}
          <div
            className="flex h-[400px] items-center justify-center rounded-[40px] overflow-hidden"
            style={{ background: "#F0EFEB" }}
          >
            {coverUrl ? (
              <img
                src={coverUrl}
                alt="Cover"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="text-center">
                <div
                  className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl"
                  style={{
                    background: "linear-gradient(135deg, #FF416C, #FF4B2B)",
                  }}
                >
                  <span className="text-3xl text-white">📖</span>
                </div>
                <p className="text-sm font-medium" style={{ color: "#8C8880" }}>
                  {lc?.ui?.labels?.cover_placeholder ||
                    t("cover_placeholder", "Cover del Prodotto")}
                </p>
              </div>
            )}
          </div>
          {/* Text */}
          <div>
            <span
              className="mb-3 inline-block rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider"
              style={{ background: "#F0EFEB", color: "#8C8880" }}
            >
              {lc?.story?.badge || t("our_story", "La Nostra Storia")}
            </span>
            <h2
              className="mt-3 font-bold"
              style={{
                fontSize: "clamp(24px, 3vw, 36px)",
                lineHeight: 1.2,
                color: "#1B1B1B",
              }}
            >
              {storia.split("\n")[0] ?? "La storia del prodotto"}
            </h2>
            <p
              className="mt-4 leading-relaxed"
              style={{ color: "#8C8880", lineHeight: 1.7 }}
            >
              {storia.split("\n").slice(1).join("\n") || storia}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
