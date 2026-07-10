// ─── LumioTestimonials — Quote + avatar section ────────────

import type { LumioLocaleContent, LumioT } from "./types";

interface LumioTestimonialsProps {
  recensioni?: string;
  lc?: LumioLocaleContent;
  t: LumioT;
}

export function LumioTestimonials({
  recensioni,
  lc,
  t,
}: LumioTestimonialsProps) {
  if (!recensioni) return null;

  return (
    <section id="testimonials" className="py-20">
      <div className="mx-auto max-w-3xl px-6 text-center">
        <span
          className="mb-4 inline-block rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider"
          style={{ background: "#F0EFEB", color: "#8C8880" }}
        >
          {lc?.testimonials?.badge || t("testimonials", "Testimonianze")}
        </span>
        <div
          className="mt-6 text-xl leading-relaxed"
          style={{ color: "#1B1B1B" }}
        >
          <span
            style={{
              background: "linear-gradient(135deg, #FF416C, #FF4B2B)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              fontSize: "48px",
            }}
          >
            &ldquo;
          </span>
          <p
            className="mt-2"
            style={{ fontSize: "clamp(18px, 2.5vw, 24px)" }}
          >
            {recensioni}
          </p>
        </div>
        <div className="mt-6 flex items-center justify-center gap-3">
          <div
            className="h-10 w-10 rounded-full"
            style={{
              background: "linear-gradient(135deg, #FF416C, #FF4B2B)",
            }}
          />
          <div className="text-left">
            <p className="text-sm font-semibold" style={{ color: "#1B1B1B" }}>
              {lc?.testimonials?.items?.[0]?.name ||
                t("testimonial_name", "Nome Cliente")}
            </p>
            <p className="text-xs" style={{ color: "#8C8880" }}>
              {lc?.testimonials?.items?.[0]?.role ||
                t("testimonial_role", "Ruolo, Azienda")}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
