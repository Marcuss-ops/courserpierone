// ─── H612Story — Features split section ───────────────────

import type { H612LocaleContent, H612T } from "./types";

interface H612StoryProps {
  storia?: string;
  coverUrl?: string;
  lc?: H612LocaleContent;
  t: H612T;
}

export function H612Story({ storia, coverUrl, lc, t }: H612StoryProps) {
  if (!storia) return null;

  return (
    <section id="features" className="py-20">
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid items-center gap-12 md:grid-cols-2">
          {/* Visual placeholder */}
          <div
            className="relative flex h-[450px] items-center justify-center overflow-hidden rounded-2xl"
            style={{ background: "#201f1f" }}
          >
            {coverUrl ? (
              <img
                src={coverUrl}
                alt="Cover"
                className="h-full w-full object-cover"
              />
            ) : (
              <>
                {/* Liquid orb */}
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
            )}
          </div>
          {/* Text */}
          <div>
            <span
              className="mb-3 inline-block text-xs font-semibold uppercase tracking-widest"
              style={{ color: "#8e9192" }}
            >
              {lc?.story?.badge || t("our_story", "Our Story")}
            </span>
            <h2
              className="mt-3"
              style={{
                fontFamily: "'Noto Serif', serif",
                fontSize: "clamp(24px, 3vw, 36px)",
                lineHeight: 1.2,
              }}
            >
              {storia.split("\n")[0] ?? "La storia del prodotto"}
            </h2>
            <p
              className="mt-4 leading-relaxed"
              style={{
                color: "#c7c6c6",
                fontFamily: "'Manrope', sans-serif",
              }}
            >
              {storia.split("\n").slice(1).join("\n") || storia}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
