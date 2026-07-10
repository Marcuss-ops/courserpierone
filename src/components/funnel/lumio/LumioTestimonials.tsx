// ─── LumioTestimonials — Thin wrapper ──────────────────────

import { SharedTestimonials } from "@/components/funnel/shared/SharedTestimonials";
import type { LumioLocaleContent, LumioT } from "./types";

interface LumioTestimonialsProps {
  recensioni?: string;
  lc?: LumioLocaleContent;
  t: LumioT;
}

export function LumioTestimonials({ recensioni, lc, t }: LumioTestimonialsProps) {
  return (
    <SharedTestimonials
      text={recensioni}
      badge={lc?.testimonials?.badge || t("testimonials", "Testimonianze")}
      id="testimonials"
      name={lc?.testimonials?.items?.[0]?.name || t("testimonial_name", "Nome Cliente")}
      role={lc?.testimonials?.items?.[0]?.role || t("testimonial_role", "Ruolo, Azienda")}
      accentColor="#FF416C"
      badgeBg="#F0EFEB"
      badgeColor="#8C8880"
      textColor="#1B1B1B"
      nameColor="#1B1B1B"
      roleColor="#8C8880"
      avatarBg="linear-gradient(135deg, #FF416C, #FF4B2B)"
    />
  );
}
