"use client";

// ─── TemplateH612 — Thin orchestrator ────────────────────
// Composes section components from ./h612/ subfolder.

import type { H612Props } from "./types";
import { createH612T } from "./useH612I18n";
import { H612Nav } from "./H612Nav";
import { H612Hero } from "./H612Hero";
import { H612LogoRoll } from "./H612LogoRoll";
import { H612Problem } from "./H612Problem";
import { H612Story } from "./H612Story";
import { H612Lessons } from "./H612Lessons";
import { H612Testimonials } from "./H612Testimonials";
import { H612CTA } from "./H612CTA";
import { SharedFooter } from "@/components/funnel/shared/SharedFooter";

export default function TemplateH612({
  data,
  locale: _locale = "it",
}: H612Props) {
  const lc = data.localeContent;
  const t = createH612T(lc);

  return (
    <div
      className="min-h-screen"
      style={{ background: "#141313", color: "#ffffff" }}
    >
      <H612Nav lc={lc} t={t} />
      <H612Hero data={data} lc={lc} t={t} />
      <H612LogoRoll lc={lc} />
      <H612Problem problema={data.problema} lc={lc} t={t} />
      <H612Story
        storia={data.storia}
        coverUrl={data.coverUrl}
        lc={lc}
        t={t}
      />
      <H612Lessons lezioni={data.lezioni} lc={lc} t={t} />
      <H612Testimonials recensioni={data.recensioni} lc={lc} t={t} />
      <H612CTA data={data} lc={lc} t={t} />
      <SharedFooter
        brand={lc?.nav?.brand || "Brand"}
        links={[
          { label: lc?.footer?.privacy || t("privacy", "Privacy"), href: "#" },
          { label: lc?.footer?.terms || t("terms", "Terms"), href: "#" },
          { label: lc?.footer?.contact || t("contact", "Contact"), href: "#" },
        ]}
        rightsReserved={lc?.footer?.rights_reserved || t("rights_reserved", "All rights reserved.")}
        variant="bordered"
      />

      {/* Keyframe animations (ported from original) */}
      <style jsx>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes liquidFlow {
          0%, 100% { transform: scale(1) rotate(0deg); }
          50% { transform: scale(1.2) rotate(180deg); }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-30px); }
        }
      `}</style>
    </div>
  );
}
