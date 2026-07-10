// ─── H612Footer — Dark minimal footer ──────────────────────

import type { H612LocaleContent, H612T } from "./types";

interface H612FooterProps {
  lc?: H612LocaleContent;
  t: H612T;
}

export function H612Footer({ lc, t }: H612FooterProps) {
  return (
    <footer
      className="border-t py-8"
      style={{ borderColor: "#353434" }}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6">
        <span className="font-semibold">
          {lc?.nav?.brand || "Brand"}
        </span>
        <div className="flex gap-6 text-sm" style={{ color: "#8e9192" }}>
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
      <div className="mt-4 text-center text-xs" style={{ color: "#444748" }}>
        © {new Date().getFullYear()} {lc?.nav?.brand || "Brand"}.{" "}
        {lc?.footer?.rights_reserved ||
          t("rights_reserved", "All rights reserved.")}
      </div>
    </footer>
  );
}
