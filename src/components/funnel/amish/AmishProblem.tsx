// ─── AmishProblem — Problem cards section ──────────────────

import { TrendingDown, Zap, Clock } from "lucide-react";
import type { AmishT } from "./types";

const PROBLEM_ICONS = [TrendingDown, Zap, Clock] as const;

interface AmishProblemProps {
  t: AmishT;
  accent: string;
}

export function AmishProblem({ t, accent }: AmishProblemProps) {
  const title = t("problem_title");
  if (!title) return null;

  const items = [
    { title: t("problem_1_title"), text: t("problem_1_text") },
    { title: t("problem_2_title"), text: t("problem_2_text") },
    { title: t("problem_3_title"), text: t("problem_3_text") },
  ].filter((item) => item.title || item.text);

  if (items.length === 0) return null;

  return (
    <section className="relative z-10 py-20 lg:py-28">
      <div className="max-w-5xl mx-auto px-6">
        <h2
          className="text-4xl md:text-5xl text-center mb-14"
          style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            color: "#1A1208",
          }}
        >
          {title}
        </h2>
        <div className="grid md:grid-cols-3 gap-6">
          {items.map((item, i) => {
            const Icon = PROBLEM_ICONS[i % PROBLEM_ICONS.length];
            return (
              <div
                key={i}
                className="rounded-2xl p-7"
                style={{
                  background: "rgba(255,255,255,0.7)",
                  border: `1px solid ${accent}18`,
                  backdropFilter: "blur(8px)",
                  boxShadow: `0 4px 24px ${accent}0A`,
                }}
              >
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center mb-5"
                  style={{ background: `${accent}15`, color: accent }}
                >
                  <Icon className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-lg mb-2 text-gray-900">
                  {item.title}
                </h3>
                <p className="text-gray-600 text-base leading-relaxed">
                  {item.text}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
