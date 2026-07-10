// ─── AmishWhatsIncluded — Check-list section ───────────────

import { Check, BookOpen } from "lucide-react";
import type { AmishProps, AmishT } from "./types";

interface AmishWhatsIncludedProps {
  data: AmishProps["data"];
  t: AmishT;
  accent: string;
}

export function AmishWhatsIncluded({
  data,
  t,
  accent,
}: AmishWhatsIncludedProps) {
  const title = t("whats_included_title");
  if (!title) return null;

  return (
    <section className="relative z-10 py-20 lg:py-28">
      <div className="max-w-5xl mx-auto px-6 grid lg:grid-cols-2 gap-14 items-center">
        <div>
          <h2
            className="text-4xl md:text-5xl mb-8 text-gray-900"
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
            }}
          >
            {title}
          </h2>
          <ul className="space-y-4">
            {[1, 2, 3, 4, 5, 6].map((n) => {
              const item = t(`whats_included_${n}`);
              return item ? (
                <li key={n} className="flex gap-3 text-gray-700 text-base">
                  <Check
                    className="w-5 h-5 shrink-0 mt-0.5"
                    strokeWidth={2.5}
                    style={{ color: accent }}
                  />
                  <span>{item}</span>
                </li>
              ) : null;
            })}
          </ul>
        </div>
        <div className="relative">
          <div
            className="absolute -inset-6 blur-[50px] rounded-full -z-10"
            style={{ background: `${accent}10` }}
          />
          {data.coverUrl ? (
            <img
              src={data.coverUrl}
              alt=""
              className="relative rounded-[28px] w-full h-[420px] object-cover"
              style={{
                border: `1px solid ${accent}18`,
                boxShadow: `0 16px 50px ${accent}18`,
              }}
            />
          ) : (
            <div
              className="relative rounded-[28px] w-full h-[420px] flex items-center justify-center"
              style={{
                background: `linear-gradient(160deg, ${accent}12 0%, ${accent}06 100%)`,
                border: `1px solid ${accent}20`,
              }}
            >
              <BookOpen className="w-16 h-16" style={{ color: `${accent}40` }} />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
