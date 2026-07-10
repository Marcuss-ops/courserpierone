// ─── HorizonTestimonials — Centered quote + avatar ─────────

import type { HorizonLocaleContent } from "./types";

interface HorizonTestimonialsProps {
  recensioni?: string;
  lc?: HorizonLocaleContent;
}

export function HorizonTestimonials({
  recensioni,
  lc,
}: HorizonTestimonialsProps) {
  if (!recensioni) return null;

  return (
    <section className="py-20">
      <div className="mx-auto max-w-3xl px-6 text-center">
        <span
          className="mb-4 inline-block rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider"
          style={{ background: "#f3ede2", color: "#89726b" }}
        >
          {lc?.testimonials?.badge || "Testimonianze"}
        </span>
        <p
          className="mt-6 font-bold"
          style={{
            fontSize: "clamp(20px, 3vw, 32px)",
            lineHeight: 1.4,
            color: "#1d1c15",
          }}
        >
          &ldquo;{recensioni}&rdquo;
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <div
            className="h-10 w-10 rounded-full"
            style={{
              background: "linear-gradient(135deg, #FF9A9E, #FECFEF)",
            }}
          />
          <div className="text-left">
            <p className="text-sm font-semibold" style={{ color: "#1d1c15" }}>
              {lc?.testimonials?.items?.[0]?.name || "Nome Cliente"}
            </p>
            <p className="text-xs" style={{ color: "#89726b" }}>
              {lc?.testimonials?.items?.[0]?.role || "Ruolo, Azienda"}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
