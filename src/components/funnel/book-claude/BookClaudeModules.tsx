// ─── BookClaudeModules — Benefits grid section ──────────────

import { PiggyBank, TrendingUp, Home, Heart, Leaf, DollarSign, Users, Wrench } from "lucide-react";
import type { LabelKey } from "./useBookClaudeI18n";

const ICONS = [PiggyBank, TrendingUp, Home, Heart, Leaf, DollarSign, Users, Wrench];
const COLORS = ["#FF6B00", "#2563EB", "#059669", "#DC2626", "#65A30D", "#D97706", "#7C3AED", "#0891B2"];

interface BookClaudeModulesProps {
  benefits: { title: string; desc: string }[];
  t: (key: LabelKey) => string;
}

export function BookClaudeModules({ benefits, t }: BookClaudeModulesProps) {
  if (benefits.length === 0) return null;

  return (
    <section id="benefits" className="py-20 lg:py-24 px-6">
      <div className="max-w-[1120px] mx-auto">
        <div className="text-center mb-14">
          <span className="font-mono text-xs text-[#6B7280] uppercase tracking-widest block mb-4">
            {t("section_learn")}
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight">
            {t("masters_secrets")}
          </h2>
          <p className="mt-4 text-lg text-[#6B7280] max-w-2xl mx-auto">
            {t("modules_desc")}
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {benefits.map((b, i) => {
            const Icon = ICONS[i % ICONS.length];
            const color = COLORS[i % COLORS.length];
            return (
              <div
                key={i}
                className="group bg-white rounded-2xl p-6 border border-[#EAEAEA] shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 flex flex-col"
              >
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center mb-4"
                  style={{ background: `${color}12` }}
                >
                  <Icon className="w-5 h-5" style={{ color }} />
                </div>
                <h3 className="text-base font-bold mb-2">{b.title}</h3>
                <p className="text-sm text-[#6B7280] leading-relaxed flex-1">{b.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
