// ─── HorizonTestimonials — Thin wrapper ────────────────────

import { SharedTestimonials } from "@/components/funnel/shared/SharedTestimonials";
import type { HorizonLocaleContent } from "./types";

interface HorizonTestimonialsProps {
  recensioni?: string;
  lc?: HorizonLocaleContent;
}

export function HorizonTestimonials({ recensioni, lc }: HorizonTestimonialsProps) {
  return (
    <SharedTestimonials
      text={recensioni}
      badge={lc?.testimonials?.badge || "Testimonianze"}
      name={lc?.testimonials?.items?.[0]?.name || "Nome Cliente"}
      role={lc?.testimonials?.items?.[0]?.role || "Ruolo, Azienda"}
      accentColor="#FF5E3A"
      badgeBg="#f3ede2"
      badgeColor="#89726b"
      textColor="#1d1c15"
      nameColor="#1d1c15"
      roleColor="#89726b"
      avatarBg="linear-gradient(135deg, #FF9A9E, #FECFEF)"
    />
  );
}
