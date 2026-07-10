// ─── H612Testimonials — Thin wrapper ───────────────────────

import { SharedTestimonials } from "@/components/funnel/shared/SharedTestimonials";
import type { H612LocaleContent, H612T } from "./types";

interface H612TestimonialsProps {
  recensioni?: string;
  lc?: H612LocaleContent;
  t: H612T;
}

export function H612Testimonials({ recensioni, lc, t }: H612TestimonialsProps) {
  return (
    <SharedTestimonials
      text={recensioni}
      badge={lc?.testimonials?.badge || "Testimonianze"}
      name={lc?.testimonials?.items?.[0]?.name || t("testimonial_name", "Nome Cliente")}
      role={lc?.testimonials?.items?.[0]?.role || t("testimonial_role", "Ruolo, Azienda")}
      accentColor="#4facfe"
      badgeBg="transparent"
      badgeColor="#8e9192"
      textColor="#ffffff"
      nameColor="#ffffff"
      roleColor="#8e9192"
      avatarBg="linear-gradient(135deg, #4facfe, #00f2fe)"
      className="py-24"
    />
  );
}
