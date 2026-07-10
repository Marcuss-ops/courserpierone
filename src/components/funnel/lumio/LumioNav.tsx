// ─── LumioNav — Floating pill navigation ───────────────────

import type { LumioLocaleContent, LumioT } from "./types";

interface LumioNavProps {
  lc?: LumioLocaleContent;
  t: LumioT;
}

export function LumioNav({ lc, t }: LumioNavProps) {
  return (
    <nav className="fixed left-1/2 top-4 z-50 -translate-x-1/2">
      <div
        className="flex items-center gap-8 rounded-full px-6 py-3"
        style={{
          background: "#1B1B1B",
          backdropFilter: "blur(20px)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
        }}
      >
        <span className="text-sm font-semibold text-white">
          {lc?.nav?.brand || "Brand"}
        </span>
        <div className="hidden items-center gap-6 text-sm text-gray-400 md:flex">
          <a href="#features" className="hover:text-white transition">
            {lc?.nav?.features || "Features"}
          </a>
          <a href="#pricing" className="hover:text-white transition">
            {lc?.nav?.pricing || "Pricing"}
          </a>
          <a href="#testimonials" className="hover:text-white transition">
            {lc?.nav?.testimonials || "Testimonials"}
          </a>
        </div>
        <button
          className="rounded-full px-4 py-1.5 text-sm font-medium text-white"
          style={{
            background: "linear-gradient(135deg, #FF416C, #FF4B2B)",
          }}
        >
          {lc?.nav?.get_started || "Get Started"}
        </button>
      </div>
    </nav>
  );
}
