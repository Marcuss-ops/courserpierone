// ─── SharedFAQ — Reusable animated FAQ accordion ──────────
// Extracted from AmishFAQ, usable by any template.

import { useState } from "react";
import { ChevronDown } from "lucide-react";

export interface FAQItem {
  q: string;
  a: string;
}

interface SharedFAQProps {
  items: FAQItem[];
  title?: string;
  /** Accent color for active border, chevron, and hover. Default: #C9840D. */
  accentColor?: string;
  /** Title font family override. Default: serif. */
  titleFont?: string;
  /** Optional CTA rendered below the FAQ list */
  cta?: React.ReactNode;
}

export function SharedFAQ({
  items,
  title,
  accentColor = "#C9840D",
  titleFont = "'Playfair Display', Georgia, serif",
  cta,
}: SharedFAQProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (items.length === 0) return null;

  return (
    <section className="relative z-10 py-20 lg:py-28">
      <div className="max-w-3xl mx-auto px-6">
        {title && (
          <h2
            className="text-4xl md:text-5xl text-center mb-12 text-gray-900"
            style={{ fontFamily: titleFont }}
          >
            {title}
          </h2>
        )}
        <div className="space-y-3">
          {items.map((item, i) => (
            <div
              key={i}
              className="rounded-2xl overflow-hidden transition-colors"
              style={{
                background: "rgba(255,255,255,0.65)",
                border: `1px solid ${openIndex === i ? accentColor + "30" : accentColor + "12"}`,
                backdropFilter: "blur(8px)",
              }}
            >
              <button
                onClick={() => setOpenIndex(openIndex === i ? null : i)}
                className="w-full text-left flex justify-between items-center px-6 py-5"
              >
                <span className="font-bold text-lg pr-4 text-gray-900">
                  {item.q}
                </span>
                <ChevronDown
                  className="w-5 h-5 shrink-0 transition-transform duration-300"
                  style={{
                    color: accentColor,
                    transform: openIndex === i ? "rotate(180deg)" : "none",
                  }}
                />
              </button>
              <div
                className={`grid transition-all duration-300 ${
                  openIndex === i ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                }`}
              >
                <div className="overflow-hidden">
                  <div className="px-6 pb-5 text-gray-600 text-base leading-relaxed">
                    {item.a}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
        {cta && <div className="text-center mt-12">{cta}</div>}
      </div>
    </section>
  );
}
