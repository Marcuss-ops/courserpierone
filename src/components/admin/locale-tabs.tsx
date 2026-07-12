"use client";

import { Globe } from "lucide-react";

interface LocaleTabsProps {
  locales: string[];
  active: string;
  onChange: (locale: string) => void;
}

export function LocaleTabs({ locales, active, onChange }: LocaleTabsProps) {
  return (
    <div className="flex items-center gap-2">
      <Globe className="w-4 h-4 text-zinc-500" />
      <div className="flex items-center gap-1 bg-zinc-900/50 border border-zinc-800 rounded-xl p-1">
        {locales.map((locale) => (
          <button
            key={locale}
            onClick={() => onChange(locale)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
              active === locale
                ? "bg-accent-primary text-white shadow-lg"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {locale}
          </button>
        ))}
      </div>
    </div>
  );
}
