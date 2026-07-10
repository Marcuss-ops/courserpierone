// ─── HorizonStory — Thin wrapper ────────────────────────

import { SharedStory } from "@/components/funnel/shared/SharedStory";
import type { HorizonLocaleContent } from "./types";

interface HorizonStoryProps {
  storia?: string;
  coverUrl?: string;
  lc?: HorizonLocaleContent;
}

export function HorizonStory({ storia, coverUrl, lc }: HorizonStoryProps) {
  return (
    <SharedStory
      storia={storia}
      coverUrl={coverUrl}
      variant="horizon"
      badgeText={lc?.story?.badge || "La Nostra Storia"}
      placeholderLabel={lc?.ui?.labels?.cover_placeholder || "Cover del Prodotto"}
    />
  );
}
