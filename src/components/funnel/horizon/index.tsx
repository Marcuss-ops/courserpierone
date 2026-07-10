// ─── TemplateHorizon — Thin orchestrator ────────────────────
// Composes section components from ./horizon/ subfolder.

import type { HorizonProps } from "./types";
import { HorizonNav } from "./HorizonNav";
import { HorizonHero } from "./HorizonHero";
import { HorizonProblem } from "./HorizonProblem";
import { HorizonStory } from "./HorizonStory";
import { HorizonLessons } from "./HorizonLessons";
import { HorizonTestimonials } from "./HorizonTestimonials";
import { HorizonPricing } from "./HorizonPricing";
import { HorizonFAQ } from "./HorizonFAQ";
import { HorizonFinalCTA } from "./HorizonFinalCTA";
import { SharedFooter } from "@/components/funnel/shared/SharedFooter";

export default function TemplateHorizon({
  data,
  locale: _locale = "it",
}: HorizonProps) {
  const lc = data.localeContent;

  return (
    <div className="min-h-screen" style={{ background: "#ffffff" }}>
      <HorizonNav lc={lc} />
      <HorizonHero data={data} lc={lc} />
      <HorizonProblem problema={data.problema} lc={lc} />
      <HorizonStory storia={data.storia} coverUrl={data.coverUrl} lc={lc} />
      <HorizonLessons lezioni={data.lezioni} lc={lc} />
      <HorizonTestimonials recensioni={data.recensioni} lc={lc} />
      <HorizonPricing data={data} lc={lc} />
      <HorizonFAQ lc={lc} />
      <HorizonFinalCTA data={data} lc={lc} />
      <SharedFooter
        brand={lc?.nav?.brand || "Brand"}
        links={[
          {
            label: lc?.footer?.privacy || lc?.ui?.labels?.privacy || "Privacy",
            href: "#",
          },
          {
            label: lc?.footer?.terms || lc?.ui?.labels?.terms || "Terms",
            href: "#",
          },
          {
            label: lc?.footer?.contact || lc?.ui?.labels?.contact || "Contact",
            href: "#",
          },
        ]}
        rightsReserved={
          lc?.footer?.rights_reserved ||
          lc?.ui?.labels?.rights_reserved ||
          "All rights reserved."
        }
        variant="light"
      />
    </div>
  );
}
