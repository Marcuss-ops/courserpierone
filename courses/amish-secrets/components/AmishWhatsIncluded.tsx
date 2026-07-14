// ─── AmishWhatsIncluded — Thin wrapper ────────────────────

import { SharedWhatsIncluded } from "@/components/funnel/shared/SharedWhatsIncluded";
import type { AmishProps, AmishT } from "./types";

interface AmishWhatsIncludedProps {
  data: AmishProps["data"];
  t: AmishT;
  accent: string;
}

export function AmishWhatsIncluded({ data, t, accent }: AmishWhatsIncludedProps) {
  return (
    <SharedWhatsIncluded
      title={t("whats_included_title")}
      items={[1, 2, 3, 4, 5, 6].map((n) => t(`whats_included_${n}`))}
      coverUrl={data.coverUrl}
      accentColor={accent}
    />
  );
}
