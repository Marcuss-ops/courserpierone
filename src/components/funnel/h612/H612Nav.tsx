// ─── H612Nav — Fixed top nav bar ──────────────────────────

import type { H612LocaleContent, H612T } from "./types";

interface H612NavProps {
  lc?: H612LocaleContent;
  t: H612T;
}

export function H612Nav({ lc, t }: H612NavProps) {
  return (
    <nav
      className="fixed left-0 right-0 top-0 z-50 border-b"
      style={{
        background: "rgba(20,19,19,0.8)",
        backdropFilter: "blur(20px)",
        borderColor: "#353434",
      }}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <span className="text-lg font-semibold text-white">
          {lc?.nav?.brand || "Brand"}
        </span>
        <div className="flex items-center gap-6">
          <a
            href="#features"
            className="text-sm text-gray-400 hover:text-white transition"
          >
            {lc?.nav?.features || "Features"}
          </a>
          <a
            href="#pricing"
            className="text-sm text-gray-400 hover:text-white transition"
          >
            {lc?.nav?.pricing || "Pricing"}
          </a>
          <button
            className="rounded-full border px-5 py-2 text-sm font-medium text-white transition hover:bg-white/10"
            style={{ borderColor: "#444748" }}
          >
            {lc?.nav?.get_started || "Get Started"}
          </button>
        </div>
      </div>
    </nav>
  );
}
