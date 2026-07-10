// ─── HorizonNav — Thin wrapper ──────────────────────────

import { SharedNav } from "@/components/funnel/shared/SharedNav";
import type { HorizonLocaleContent } from "./types";

interface HorizonNavProps {
  lc?: HorizonLocaleContent;
}

export function HorizonNav({ lc }: HorizonNavProps) {
  return (
    <SharedNav
      variant="pill-light"
      brand={lc?.nav?.brand || "Brand"}
      links={[
        { label: lc?.nav?.features || "Features", href: "#features" },
        { label: lc?.nav?.pricing || "Pricing", href: "#pricing" },
        { label: lc?.nav?.faq || "FAQ", href: "#faq" },
      ]}
      ctaLabel={lc?.nav?.get_started || "Get Started"}
    />
  );
}
