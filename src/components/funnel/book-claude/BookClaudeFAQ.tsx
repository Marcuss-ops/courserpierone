"use client";

// ─── BookClaudeFAQ — FAQ accordion section ──────────────────

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { LabelKey } from "./useBookClaudeI18n";

interface BookClaudeFAQProps {
  items: { q: string; a: string }[];
  t: (key: LabelKey) => string;
}

export function BookClaudeFAQ({ items, t }: BookClaudeFAQProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  if (items.length === 0) return null;

  return (
    <section className="py-20 lg:py-24 px-6 bg-[#FAFAFA] border-y border-[#EAEAEA]">
      <div className="max-w-[700px] mx-auto">
        <div className="text-center mb-12">
          <span className="font-mono text-xs text-[#6B7280] uppercase tracking-widest block mb-4">{t("section_faq")}</span>
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight">{t("faq_title")}</h2>
        </div>
        <div className="space-y-2">
          {items.map((faq, i) => (
            <div key={i} className="bg-white rounded-2xl border border-[#EAEAEA] overflow-hidden transition-shadow hover:shadow-sm">
              <button onClick={() => setOpenIndex(openIndex === i ? null : i)} className="w-full flex items-center justify-between gap-4 px-6 py-4 text-left">
                <span className="font-bold text-sm pr-4">{faq.q}</span>
                <div className={`w-6 h-6 rounded-full bg-[#FFF3EB] flex items-center justify-center shrink-0 transition-transform ${openIndex === i ? "rotate-180" : ""}`}>
                  <ChevronRight className="w-3.5 h-3.5 text-[#FF6B00]" />
                </div>
              </button>
              <div className={`grid transition-all duration-300 ${openIndex === i ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                <div className="overflow-hidden"><div className="px-6 pb-4 text-sm text-[#6B7280] leading-relaxed">{faq.a}</div></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
