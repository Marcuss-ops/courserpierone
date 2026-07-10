// ─── LumioStory — Thin wrapper ──────────────────────────

import { SharedStory } from "@/components/funnel/shared/SharedStory";
import type { LumioLocaleContent, LumioT } from "./types";

interface LumioStoryProps {
  storia?: string;
  coverUrl?: string;
  lc?: LumioLocaleContent;
  t: LumioT;
}

export function LumioStory({ storia, coverUrl, lc, t }: LumioStoryProps) {
  return (
    <SharedStory
      storia={storia}
      coverUrl={coverUrl}
      variant="lumio"
      badgeText={lc?.story?.badge || t("our_story", "La Nostra Storia")}
      placeholderLabel={lc?.ui?.labels?.cover_placeholder || t("cover_placeholder", "Cover del Prodotto")}
    />
  );
}
