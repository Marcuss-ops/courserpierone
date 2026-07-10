// ─── BookClaudeTestimonial — Single quote + stars ───────────

import { Quote, Star } from "lucide-react";
import type { LabelKey } from "./useBookClaudeI18n";

interface BookClaudeTestimonialProps {
  t: (key: LabelKey) => string;
}

export function BookClaudeTestimonial({ t }: BookClaudeTestimonialProps) {
  return (
    <section className="py-20 lg:py-24 px-6 bg-[#FAFAFA] border-y border-[#EAEAEA]">
      <div className="max-w-[800px] mx-auto text-center">
        <span className="font-mono text-xs text-[#6B7280] uppercase tracking-widest block mb-4">
          {t("section_testimonials")}
        </span>
        <div className="relative">
          <Quote className="w-12 h-12 text-[#FF6B00]/15 mx-auto mb-4" />
          <blockquote className="text-xl sm:text-2xl font-bold leading-relaxed tracking-tight text-[#1A1A1A]">
            &ldquo;{t("testimonial_text")}&rdquo;
          </blockquote>
        </div>
        <div className="mt-6 flex items-center justify-center gap-1">
          {[...Array(5)].map((_, i) => (
            <Star key={i} className="w-5 h-5 fill-[#FF6B00] text-[#FF6B00]" />
          ))}
        </div>
        <div className="mt-4 flex items-center justify-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#FF6B00] to-[#E05E00] flex items-center justify-center">
            <span className="text-white font-bold text-sm">M</span>
          </div>
          <div className="text-left">
            <p className="text-sm font-bold text-[#1A1A1A]">{t("testimonial_name")}</p>
            <p className="text-xs text-[#6B7280]">{t("testimonial_role")}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
