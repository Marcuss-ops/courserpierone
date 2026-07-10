// ─── BookClaudeStory — 3 images + quote story section ──────

import type { LabelKey } from "./useBookClaudeI18n";

interface BookClaudeStoryProps {
  t: (key: LabelKey) => string;
}

export function BookClaudeStory({ t }: BookClaudeStoryProps) {
  const images = [
    "/images/amish-storia-1.png",
    "/images/amish-storia-2.png",
    "/images/amish-storia-3.png",
  ];

  return (
    <section className="py-20 lg:py-24 px-6">
      <div className="max-w-[1000px] mx-auto">
        <div className="text-center mb-14">
          <span className="font-mono text-xs text-[#6B7280] uppercase tracking-widest block mb-4">
            {t("story_badge")}
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight mb-4">
            {t("story_title")}
          </h2>
          <p className="text-lg text-[#6B7280] max-w-2xl mx-auto">
            {t("story_subtitle")}
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 mb-16">
          {images.map((src, i) => (
            <div
              key={i}
              className="group relative overflow-hidden rounded-3xl border border-[#EAEAEA] shadow-md hover:shadow-xl transition-all duration-500"
            >
              <div className="aspect-[3/2] overflow-hidden">
                <img
                  src={src}
                  alt={`${t("amish_life")} ${i + 1}`}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              </div>
              <div className="p-4 bg-white">
                <p className="text-sm text-[#6B7280] leading-relaxed">
                  {[t("caption_1"), t("caption_2"), t("caption_3")][i]}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-[#FAFAFA] rounded-3xl p-8 lg:p-10 border border-[#EAEAEA]">
          <blockquote className="text-base sm:text-lg text-[#4A4A4A] leading-relaxed italic border-l-4 border-[#FF6B00] pl-6">
            &ldquo;{t("story_quote")}&rdquo;
          </blockquote>
        </div>
      </div>
    </section>
  );
}
