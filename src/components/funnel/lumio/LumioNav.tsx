// ─── LumioNav — Thin wrapper ────────────────────────────

import { SharedNav } from "@/components/funnel/shared/SharedNav";
import type { LumioLocaleContent, LumioT } from "./types";

interface LumioNavProps {
  lc?: LumioLocaleContent;
  t: LumioT;
}

export function LumioNav({ lc, t }: LumioNavProps) {
  return (
    <SharedNav
      variant="pill-dark"
      brand={lc?.nav?.brand || "Brand"}
      links={[
        { label: lc?.nav?.features || "Features", href: "#features" },
        { label: lc?.nav?.pricing || "Pricing", href: "#pricing" },
        { label: lc?.nav?.testimonials || "Testimonials", href: "#testimonials" },
      ]}
      ctaLabel={lc?.nav?.get_started || "Get Started"}
    />
  );
}
