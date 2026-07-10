// ─── AmishAuthor — Author bio + story images ───────────────

import { User } from "lucide-react";
import type { AmishProps, AmishT } from "./types";

interface AmishAuthorProps {
  data: AmishProps["data"];
  t: AmishT;
  accent: string;
}

export function AmishAuthor({ data, t, accent }: AmishAuthorProps) {
  const hasTitle = !!t("author_title");
  const hasBio = !!(t("author_bio_1") || t("author_bio_2") || t("author_bio_3"));

  if (!hasTitle && !hasBio) return null;

  return (
    <section className="relative z-10 py-20 lg:py-28">
      <div className="max-w-5xl mx-auto px-6">
        <div
          className="rounded-[32px] p-8 md:p-14 grid md:grid-cols-[220px_1fr] gap-10 items-start"
          style={{
            background: "rgba(255,255,255,0.66)",
            border: `1px solid ${accent}18`,
            backdropFilter: "blur(10px)",
            boxShadow: `0 8px 40px ${accent}0C`,
          }}
        >
          {/* Author avatar */}
          <div className="text-center md:text-left">
            <div
              className="w-40 h-40 mx-auto md:mx-0 rounded-2xl overflow-hidden animate-fade-in"
              style={{
                border: `2px solid ${accent}25`,
                background: `${accent}0A`,
              }}
            >
              {data.authorImageUrl ? (
                <img
                  src={data.authorImageUrl}
                  alt={data.author ?? ""}
                  className="w-full h-full object-cover"
                />
              ) : data.coverUrl ? (
                <img
                  src={data.coverUrl}
                  alt={data.author ?? ""}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <User className="w-16 h-16" style={{ color: `${accent}40` }} />
                </div>
              )}
            </div>
            <p
              className="mt-4 text-2xl font-semibold text-gray-900"
              style={{
                fontFamily: "'Playfair Display', Georgia, serif",
              }}
            >
              {data.author}
            </p>
            {t("author_role") && (
              <p
                className="text-base font-semibold mt-1"
                style={{ color: accent }}
              >
                {t("author_role")}
              </p>
            )}
          </div>

          {/* Bio */}
          <div>
            {t("author_title") && (
              <h2
                className="text-3xl md:text-4xl mb-5 text-gray-900 font-semibold"
                style={{
                  fontFamily: "'Playfair Display', Georgia, serif",
                }}
              >
                {t("author_title")}
              </h2>
            )}
            <div className="space-y-4 text-gray-600 text-base leading-relaxed">
              {[t("author_bio_1"), t("author_bio_2"), t("author_bio_3")]
                .filter(Boolean)
                .map((bio, i) => (
                  <p key={i}>{bio}</p>
                ))}
            </div>
          </div>

          {/* Story Images Gallery */}
          {data.storyImages && data.storyImages.length > 0 && (
            <div
              className="md:col-span-2 mt-8 pt-8 border-t"
              style={{ borderColor: `${accent}18` }}
            >
              <p
                className="text-xs uppercase tracking-widest mb-4 font-bold"
                style={{ color: accent }}
              >
                {t("story_gallery_title") || "I Momenti della Storia"}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                {data.storyImages.map((img, idx) => (
                  <div key={idx} className="space-y-2">
                    <div
                      className="aspect-[4/3] rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-300"
                      style={{ border: `1px solid ${accent}15` }}
                    >
                      <img
                        src={img}
                        alt={t(`caption_${idx + 1}`) || ""}
                        className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                      />
                    </div>
                    {t(`caption_${idx + 1}`) && (
                      <p className="text-xs text-gray-500 italic text-center">
                        {t(`caption_${idx + 1}`)}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
