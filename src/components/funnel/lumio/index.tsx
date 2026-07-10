// ─── TemplateLumio — Thin orchestrator ─────────────────────
// Composes section components from ./lumio/ subfolder.
// Minimal logic: just wire data + localeContent to sections.

import type { LumioProps } from "./types";
import { createLumioT } from "./useLumioI18n";
import { LumioNav } from "./LumioNav";
import { LumioHero } from "./LumioHero";
import { LumioTrustStrip } from "./LumioTrustStrip";
import { LumioProblem } from "./LumioProblem";
import { LumioStory } from "./LumioStory";
import { LumioLessons } from "./LumioLessons";
import { LumioTestimonials } from "./LumioTestimonials";
import { LumioCTA } from "./LumioCTA";
import { SharedFooter, type FooterLink } from "@/components/funnel/shared/SharedFooter";

export default function TemplateLumio({
  data,
  locale: _locale = "it",
}: LumioProps) {
  const lc = data.localeContent;
  const t = createLumioT(lc);

  return (
    <div className="min-h-screen" style={{ background: "#FAF9F5" }}>
      <LumioNav lc={lc} t={t} />
      <LumioHero data={data} lc={lc} t={t} />
      <LumioTrustStrip lc={lc} t={t} />
      <LumioProblem problema={data.problema} lc={lc} t={t} />
      <LumioStory
        storia={data.storia}
        coverUrl={data.coverUrl}
        lc={lc}
        t={t}
      />
      <LumioLessons lezioni={data.lezioni} lc={lc} t={t} />
      <LumioTestimonials recensioni={data.recensioni} lc={lc} t={t} />
      <LumioCTA data={data} lc={lc} t={t} />
      <SharedFooter
        brand={lc?.nav?.brand || "Brand"}
        links={[
          { label: lc?.footer?.privacy || t("privacy", "Privacy"), href: "#" },
          { label: lc?.footer?.terms || t("terms", "Terms"), href: "#" },
          { label: lc?.footer?.contact || t("contact", "Contact"), href: "#" },
        ]}
        rightsReserved={lc?.footer?.rights_reserved || t("rights_reserved", "All rights reserved.")}
        variant="dark"
      />
    </div>
  );
}
