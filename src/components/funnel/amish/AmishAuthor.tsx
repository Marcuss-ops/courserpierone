// ─── AmishAuthor — Thin wrapper ────────────────────────────

import { SharedAuthor } from "@/components/funnel/shared/SharedAuthor";
import type { AmishProps, AmishT } from "./types";

interface AmishAuthorProps {
  data: AmishProps["data"];
  t: AmishT;
  accent: string;
}

export function AmishAuthor({ data, t, accent }: AmishAuthorProps) {
  return (
    <SharedAuthor
      name={data.author}
      role={t("author_role")}
      title={t("author_title")}
      bioParagraphs={[t("author_bio_1"), t("author_bio_2"), t("author_bio_3")]}
      avatarUrl={data.authorImageUrl}
      coverUrl={data.coverUrl}
      storyImages={data.storyImages}
      galleryTitle={t("story_gallery_title") || "I Momenti della Storia"}
      captionForIndex={(idx) => t(`caption_${idx}`)}
      accentColor={accent}
    />
  );
}
