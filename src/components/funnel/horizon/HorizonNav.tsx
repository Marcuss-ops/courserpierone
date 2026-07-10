// ─── HorizonNav — Floating glassmorphism nav ───────────────

import type { HorizonLocaleContent } from "./types";

interface HorizonNavProps {
  lc?: HorizonLocaleContent;
}

export function HorizonNav({ lc }: HorizonNavProps) {
  return (
    <nav className="fixed left-1/2 top-4 z-50 -translate-x-1/2">
      <div
        className="flex items-center gap-8 rounded-2xl px-6 py-3"
        style={{
          background: "rgba(255,255,255,0.4)",
          backdropFilter: "blur(20px)",
          border: "1px solid rgba(255,255,255,0.6)",
          boxShadow: "0 4px 30px rgba(0,0,0,0.06)",
        }}
      >
        <span className="text-sm font-bold" style={{ color: "#1d1c15" }}>
          {lc?.nav?.brand || "Brand"}
        </span>
        <div
          className="hidden items-center gap-6 text-sm md:flex"
          style={{ color: "#555555" }}
        >
          <a href="#features" className="hover:text-black transition">
            {lc?.nav?.features || "Features"}
          </a>
          <a href="#pricing" className="hover:text-black transition">
            {lc?.nav?.pricing || "Pricing"}
          </a>
          <a href="#faq" className="hover:text-black transition">
            {lc?.nav?.faq || "FAQ"}
          </a>
        </div>
        <button
          className="rounded-xl px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90"
          style={{ background: "#FF5E3A" }}
        >
          {lc?.nav?.get_started || "Get Started"}
        </button>
      </div>
    </nav>
  );
}
