// ─── LumioFooter — Dark gradient footer ─────────────────────

import type { LumioLocaleContent, LumioT } from "./types";

interface LumioFooterProps {
  lc?: LumioLocaleContent;
  t: LumioT;
}

export function LumioFooter({ lc, t }: LumioFooterProps) {
  return (
    <footer
      style={{ background: "linear-gradient(180deg, #181818, #0a0a0a)" }}
      className="py-12"
    >
      <div className="mx-auto max-w-6xl px-6">
        <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
          <span className="text-lg font-bold text-white">
            {lc?.nav?.brand || "Brand"}
          </span>
          <div className="flex gap-6 text-sm text-gray-500">
            <a href="#" className="hover:text-white transition">
              {lc?.footer?.privacy || t("privacy", "Privacy")}
            </a>
            <a href="#" className="hover:text-white transition">
              {lc?.footer?.terms || t("terms", "Terms")}
            </a>
            <a href="#" className="hover:text-white transition">
              {lc?.footer?.contact || t("contact", "Contact")}
            </a>
          </div>
        </div>
        <div className="mt-8 text-center text-xs text-gray-600">
          © {new Date().getFullYear()} {lc?.nav?.brand || "Brand"}.{" "}
          {lc?.footer?.rights_reserved ||
            t("rights_reserved", "All rights reserved.")}
        </div>
      </div>
    </footer>
  );
}
