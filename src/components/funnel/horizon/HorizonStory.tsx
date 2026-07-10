// ─── HorizonStory — Story / features 2-column section ──────

import type { HorizonLocaleContent } from "./types";

interface HorizonStoryProps {
  storia?: string;
  coverUrl?: string;
  lc?: HorizonLocaleContent;
}

export function HorizonStory({ storia, coverUrl, lc }: HorizonStoryProps) {
  if (!storia) return null;

  return (
    <section id="features" className="py-20">
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid items-center gap-12 md:grid-cols-2">
          {/* Cover / Visual */}
          <div
            className="flex h-[400px] items-center justify-center overflow-hidden rounded-3xl"
            style={{ background: "#f3ede2" }}
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
                  style={{ background: "#ff8a65" }}
                >
                  <span className="text-3xl text-white">📖</span>
                </div>
                <p className="text-sm font-medium" style={{ color: "#89726b" }}>
                  {lc?.ui?.labels?.cover_placeholder || "Cover del Prodotto"}
                </p>
              </div>
            )}
          </div>
          {/* Text */}
          <div>
            <span
              className="mb-3 inline-block rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider"
              style={{ background: "#f3ede2", color: "#89726b" }}
            >
              {lc?.story?.badge || "La Nostra Storia"}
            </span>
            <h2
              className="mt-3 font-bold"
              style={{
                fontSize: "clamp(24px, 3vw, 36px)",
                lineHeight: 1.2,
                color: "#1d1c15",
              }}
            >
              {storia.split("\n")[0] ?? "La storia del prodotto"}
            </h2>
            <p
              className="mt-4 leading-relaxed"
              style={{ color: "#555555" }}
            >
              {storia.split("\n").slice(1).join("\n") || storia}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
