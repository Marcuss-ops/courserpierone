// ─── H612Nav — Thin wrapper ────────────────────────────

import { SharedNav } from "@/components/funnel/shared/SharedNav";
import type { H612LocaleContent, H612T } from "./types";

interface H612NavProps {
  lc?: H612LocaleContent;
  t: H612T;
}

export function H612Nav({ lc, t }: H612NavProps) {
  return (
    <SharedNav
      variant="bar-dark"
      brand={lc?.nav?.brand || "Brand"}
      links={[
        { label: lc?.nav?.features || "Features", href: "#features" },
        { label: lc?.nav?.pricing || "Pricing", href: "#pricing" },
      ]}
      ctaLabel={lc?.nav?.get_started || "Get Started"}
    />
  );
}
