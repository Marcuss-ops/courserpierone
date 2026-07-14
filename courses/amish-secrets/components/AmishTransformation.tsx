// ─── AmishTransformation — Before / After section ──────────

import type { AmishT } from "./types";

interface AmishTransformationProps {
  t: AmishT;
  accent: string;
}

export function AmishTransformation({ t, accent }: AmishTransformationProps) {
  const title = t("transform_title");
  if (!title) return null;

  return (
    <section className="relative z-10 py-16">
      <div className="max-w-4xl mx-auto px-6">
        <div
          className="rounded-[28px] p-8 md:p-12"
          style={{
            background: `linear-gradient(135deg, ${accent}0D 0%, ${accent}06 100%)`,
            border: `1px solid ${accent}20`,
          }}
        >
          <h3
            className="text-3xl md:text-4xl text-center mb-10 text-gray-900"
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
            }}
          >
            {title}
          </h3>
          <div className="grid md:grid-cols-2 gap-10">
            {/* Before */}
            <div>
              <p className="text-xs uppercase tracking-widest text-gray-400 mb-4 font-bold">
                {t("transform_before_label")}
              </p>
              <ul className="space-y-3">
                {[
                  t("transform_before_1"),
                  t("transform_before_2"),
                  t("transform_before_3"),
                ]
                  .filter(Boolean)
                  .map((item, i) => (
                    <li key={i} className="flex gap-3 text-gray-600">
                      <span className="text-red-400 font-bold mt-0.5 shrink-0">
                        ×
                      </span>
                      <span>{item}</span>
                    </li>
                  ))}
              </ul>
            </div>
            {/* After */}
            <div
              className="md:pl-10 md:border-l"
              style={{ borderColor: `${accent}25` }}
            >
              <p
                className="text-xs uppercase tracking-widest mb-4 font-bold"
                style={{ color: accent }}
              >
                {t("transform_after_label")}
              </p>
              <ul className="space-y-3">
                {[
                  t("transform_after_1"),
                  t("transform_after_2"),
                  t("transform_after_3"),
                ]
                  .filter(Boolean)
                  .map((item, i) => (
                    <li
                      key={i}
                      className="flex gap-3 text-gray-700 font-medium"
                    >
                      <span
                        className="font-bold mt-0.5 shrink-0"
                        style={{ color: accent }}
                      >
                        ✓
                      </span>
                      <span>{item}</span>
                    </li>
                  ))}
              </ul>
            </div>
          </div>
          {t("transform_disclaimer") && (
            <p className="text-center text-xs text-gray-400 mt-8">
              {t("transform_disclaimer")}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
