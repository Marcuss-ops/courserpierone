// ─── AmishTestimonials — Testimonials grid ─────────────────

import { Star } from "lucide-react";
import type { AmishT } from "./types";

interface AmishTestimonialsProps {
  testimonials: { name: string; location: string; avatar: string; text: string }[];
  t: AmishT;
  accent: string;
}

export function AmishTestimonials({
  testimonials,
  t,
  accent,
}: AmishTestimonialsProps) {
  if (testimonials.length === 0) return null;

  return (
    <section className="relative z-10 py-20 lg:py-28">
      <div className="max-w-6xl mx-auto px-6">
        <h2
          className="text-4xl md:text-5xl text-center mb-3 text-gray-900"
          style={{
            fontFamily: "'Playfair Display', Georgia, serif",
          }}
        >
          {t("testimonials_title")}
        </h2>
        {t("testimonials_subtitle") && (
          <p className="text-center text-gray-400 mb-12 text-sm">
            {t("testimonials_subtitle")}
          </p>
        )}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {testimonials.map((tst, i) => (
            <div
              key={i}
              className="rounded-2xl p-6"
              style={{
                background: "rgba(255,255,255,0.65)",
                border: `1px solid ${accent}15`,
                backdropFilter: "blur(8px)",
                boxShadow: `0 4px 20px ${accent}08`,
              }}
            >
              <div className="flex items-center gap-3 mb-4">
                {tst.avatar ? (
                  <img
                    src={tst.avatar}
                    alt=""
                    className="w-11 h-11 rounded-full object-cover"
                    style={{ boxShadow: `0 0 0 2px ${accent}30` }}
                  />
                ) : (
                  <div
                    className="w-11 h-11 rounded-full flex items-center justify-center font-bold text-white text-sm"
                    style={{
                      background: `linear-gradient(135deg, ${accent} 0%, ${accent}AA 100%)`,
                    }}
                  >
                    {tst.name?.[0] ?? "?"}
                  </div>
                )}
                <div>
                  <p className="font-semibold text-sm text-gray-900">
                    {tst.name}
                  </p>
                  <p
                    className="text-xs font-medium"
                    style={{ color: accent }}
                  >
                    {tst.location}
                  </p>
                </div>
              </div>
              <div className="flex mb-3" style={{ color: accent }}>
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-3.5 h-3.5 fill-current" />
                ))}
              </div>
              <p className="text-base leading-relaxed text-gray-600">
                &ldquo;{tst.text}&rdquo;
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
