// ─── BookClaudeAuthor — Author bio section ──────────────────

import type { LabelKey } from "./useBookClaudeI18n";

interface BookClaudeAuthorProps {
  t: (key: LabelKey) => string;
}

export function BookClaudeAuthor({ t }: BookClaudeAuthorProps) {
  return (
    <section className="py-20 lg:py-24 px-6 bg-[#FAFAFA] border-y border-[#EAEAEA]">
      <div className="max-w-[900px] mx-auto">
        <div className="text-center mb-12">
          <span className="font-mono text-xs text-[#6B7280] uppercase tracking-widest block mb-4">
            {t("section_author")}
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight">
            {t("behind_course")}
          </h2>
        </div>
        <div className="bg-white rounded-3xl p-8 lg:p-12 border border-[#EAEAEA] shadow-sm">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-8 text-center sm:text-left">
            <div className="w-28 h-28 rounded-2xl overflow-hidden shrink-0 border-2 border-[#FF6B00]/20 shadow-lg">
              <img
                src="/images/author-alessandro.png"
                alt={t("your_name")}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex-1">
              <h3 className="text-2xl font-black mb-1">{t("your_name")}</h3>
              <p className="text-sm text-[#FF6B00] font-bold uppercase tracking-wider mb-4">
                {t("researcher_author")}
              </p>
              <p className="text-sm text-[#6B7280] leading-relaxed">{t("author_bio")}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
