// ─── BookClaudeWhoFor — "Who Is This For" two-column ───────

import { Check, ThumbsUp, X } from "lucide-react";
import type { LabelKey } from "./useBookClaudeI18n";

interface BookClaudeWhoForProps {
  t: (key: LabelKey) => string;
}

export function BookClaudeWhoFor({ t }: BookClaudeWhoForProps) {
  const perfectItems = [t("p_struggle"), t("p_cut_costs"), t("p_consumerism"), t("p_practical"), t("p_future")];
  const notItems = [t("n_quick"), t("n_habits"), t("n_quick_fix"), t("n_implement"), t("n_advice")];

  return (
    <section className="py-20 lg:py-24 px-6 bg-[#FAFAFA] border-y border-[#EAEAEA]">
      <div className="max-w-[1000px] mx-auto">
        <div className="text-center mb-12">
          <span className="font-mono text-xs text-[#6B7280] uppercase tracking-widest block mb-4">
            {t("section_who")}
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight">
            {t("is_this_for_you")}
          </h2>
        </div>
        <div className="grid md:grid-cols-2 gap-8">
          {/* Perfect For */}
          <div className="bg-white rounded-3xl p-8 lg:p-10 border border-[#EAEAEA] shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-[#059669]/10 flex items-center justify-center">
                <ThumbsUp className="w-5 h-5 text-[#059669]" />
              </div>
              <h3 className="text-lg font-black">{t("perfect_for")}</h3>
            </div>
            <ul className="space-y-4">
              {perfectItems.map((item, i) => (
                <li key={i} className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-[#059669] shrink-0 mt-0.5" strokeWidth={3} />
                  <span className="text-sm font-medium text-[#4A4A4A]">{item}</span>
                </li>
              ))}
            </ul>
          </div>
          {/* Not For */}
          <div className="bg-white rounded-3xl p-8 lg:p-10 border border-[#EAEAEA] shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-[#DC2626]/10 flex items-center justify-center">
                <X className="w-5 h-5 text-[#DC2626]" />
              </div>
              <h3 className="text-lg font-black">{t("not_for")}</h3>
            </div>
            <ul className="space-y-4">
              {notItems.map((item, i) => (
                <li key={i} className="flex items-start gap-3">
                  <X className="w-5 h-5 text-[#DC2626] shrink-0 mt-0.5" strokeWidth={3} />
                  <span className="text-sm font-medium text-[#6B7280]">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
