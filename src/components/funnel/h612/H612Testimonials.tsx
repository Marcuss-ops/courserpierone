// ─── H612Testimonials — Quote + avatar section ────────────

import type { H612LocaleContent, H612T } from "./types";

interface H612TestimonialsProps {
  recensioni?: string;
  lc?: H612LocaleContent;
  t: H612T;
}

export function H612Testimonials({
  recensioni,
  lc,
  t,
}: H612TestimonialsProps) {
  if (!recensioni) return null;

  return (
    <section className="py-24">
      <div className="mx-auto max-w-3xl px-6 text-center">
        <span
          className="mb-4 inline-block text-xs font-semibold uppercase tracking-widest"
          style={{ color: "#8e9192" }}
        >
          {lc?.testimonials?.badge || "Testimonianze"}
        </span>
        <p
          className="mt-6"
          style={{
            fontFamily: "'Noto Serif', serif",
            fontSize: "clamp(20px, 3vw, 32px)",
            lineHeight: 1.4,
            color: "#ffffff",
          }}
        >
          &ldquo;{recensioni}&rdquo;
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <div
            className="h-10 w-10 rounded-full"
            style={{
              background: "linear-gradient(135deg, #4facfe, #00f2fe)",
            }}
          />
          <div className="text-left">
            <p className="text-sm font-medium text-white">
              {lc?.testimonials?.items?.[0]?.name ||
                t("testimonial_name", "Nome Cliente")}
            </p>
            <p className="text-xs" style={{ color: "#8e9192" }}>
              {lc?.testimonials?.items?.[0]?.role ||
                t("testimonial_role", "Ruolo, Azienda")}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
