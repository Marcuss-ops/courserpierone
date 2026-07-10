// ─── SharedModules — Icon card grid section ─────────────────
// Extracted from AmishModules. Reusable for features/benefits/lessons grids.

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export interface ModuleItem {
  title: string;
  desc: string;
  icon?: LucideIcon;
}

interface SharedModulesProps {
  items: ModuleItem[];
  title?: string;
  description?: string;
  /** Accent color for icons, borders, and hover effects. */
  accentColor?: string;
  /** Title font family. Default: serif. */
  titleFont?: string;
  /** Number of grid columns. Default: 2. */
  columns?: 2 | 3;
  /** Optional CTA rendered below the grid. */
  cta?: ReactNode;
  /** Extra class names. */
  className?: string;
}

export function SharedModules({
  items,
  title,
  description,
  accentColor = "#C9840D",
  titleFont = "'Playfair Display', Georgia, serif",
  columns = 2,
  cta,
  className = "",
}: SharedModulesProps) {
  if (items.length === 0) return null;

  const gridClass =
    columns === 3
      ? "grid gap-5 md:grid-cols-2 lg:grid-cols-3"
      : "grid gap-5 md:grid-cols-2";

  return (
    <section className={`relative z-10 py-20 lg:py-28 ${className}`}>
      <div className="max-w-6xl mx-auto px-6">
        {(title || description) && (
          <div className="text-center max-w-2xl mx-auto mb-14">
            {title && (
              <h2
                className="text-4xl md:text-5xl text-gray-900"
                style={{ fontFamily: titleFont }}
              >
                {title}
              </h2>
            )}
            {description && (
              <p className="mt-4 text-gray-600">{description}</p>
            )}
          </div>
        )}
        <div className={gridClass}>
          {items.map((item, i) => (
            <div
              key={i}
              className="group rounded-2xl p-6 transition-all duration-300 hover:-translate-y-0.5"
              style={{
                background: "rgba(255,255,255,0.65)",
                border: `1px solid ${accentColor}15`,
                backdropFilter: "blur(8px)",
                boxShadow: `0 2px 12px ${accentColor}08`,
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.boxShadow = `0 8px 32px ${accentColor}18`;
                el.style.borderColor = `${accentColor}30`;
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.boxShadow = `0 2px 12px ${accentColor}08`;
                el.style.borderColor = `${accentColor}15`;
              }}
            >
              <div className="flex gap-4">
                {item.icon && (
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors"
                    style={{ background: `${accentColor}14`, color: accentColor }}
                  >
                    <item.icon className="w-5 h-5" />
                  </div>
                )}
                <div>
                  <h4 className="font-bold text-gray-900 text-xl">
                    {item.title}
                  </h4>
                  <p className="text-gray-600 text-base mt-1">{item.desc}</p>
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
