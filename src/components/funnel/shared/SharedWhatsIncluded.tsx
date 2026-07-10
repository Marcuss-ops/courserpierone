// ─── SharedWhatsIncluded — Checklist + cover image section ──
// Extracted from AmishWhatsIncluded. Reusable by any template.

import { Check, BookOpen } from "lucide-react";

interface SharedWhatsIncludedProps {
  /** Section title. Component returns null if falsy. */
  title?: string;
  /** Checklist items. Falsy items are filtered out. */
  items: (string | undefined | null)[];
  /** Cover image URL (optional). */
  coverUrl?: string;
  /** Accent color for check icons, glow, and borders. */
  accentColor?: string;
  /** Extra class names. */
  className?: string;
}

export function SharedWhatsIncluded({
  title,
  items,
  coverUrl,
  accentColor = "#C9840D",
  className = "",
}: SharedWhatsIncludedProps) {
  if (!title) return null;

  const filtered = items.filter(Boolean) as string[];

  return (
    <section className={`relative z-10 py-20 lg:py-28 ${className}`}>
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
            {filtered.map((item, i) => (
              <li key={i} className="flex gap-3 text-gray-700 text-base">
                <Check
                  className="w-5 h-5 shrink-0 mt-0.5"
                  strokeWidth={2.5}
                  style={{ color: accentColor }}
                />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="relative">
          <div
            className="absolute -inset-6 blur-[50px] rounded-full -z-10"
            style={{ background: `${accentColor}10` }}
          />
          {coverUrl ? (
            <img
              src={coverUrl}
              alt=""
              className="relative rounded-[28px] w-full h-[420px] object-cover"
              style={{
                border: `1px solid ${accentColor}18`,
                boxShadow: `0 16px 50px ${accentColor}18`,
              }}
            />
          ) : (
            <div
              className="relative rounded-[28px] w-full h-[420px] flex items-center justify-center"
              style={{
                background: `linear-gradient(160deg, ${accentColor}12 0%, ${accentColor}06 100%)`,
                border: `1px solid ${accentColor}20`,
              }}
            >
              <BookOpen className="w-16 h-16" style={{ color: `${accentColor}40` }} />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
