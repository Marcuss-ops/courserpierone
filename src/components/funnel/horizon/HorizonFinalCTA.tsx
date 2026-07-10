"use client";

// ─── HorizonFinalCTA — Dark gradient CTA with cursor glow ──

import { useRef, useState } from "react";
import type { HorizonLocaleContent } from "./types";

interface HorizonFinalCTAProps {
  data: {
    cta?: string;
    prezzo?: string;
  };
  lc?: HorizonLocaleContent;
}

export function HorizonFinalCTA({ data, lc }: HorizonFinalCTAProps) {
  const ctaRef = useRef<HTMLDivElement>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const handleMouseMove = (e: React.MouseEvent) => {
    if (ctaRef.current) {
      const rect = ctaRef.current.getBoundingClientRect();
      setMousePos({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    }
  };

  return (
    <section
      ref={ctaRef}
      onMouseMove={handleMouseMove}
      className="relative overflow-hidden py-32"
      style={{
        background: "linear-gradient(135deg, #312e81, #581c87, #134e4a)",
      }}
    >
      {/* Cursor glow */}
      <div
        className="pointer-events-none absolute inset-0 transition-opacity duration-300"
        style={{
          background: `radial-gradient(400px circle at ${mousePos.x}px ${mousePos.y}px, rgba(255,255,255,0.08), transparent 60%)`,
        }}
      />
      <div className="relative z-10 mx-auto max-w-3xl px-6 text-center">
        <h2
          className="font-extrabold text-white"
          style={{
            fontSize: "clamp(28px, 4vw, 54px)",
            letterSpacing: "-0.03em",
          }}
        >
          {data.cta || lc?.hero?.cta || "Inizia Oggi"}
        </h2>
        <p className="mt-4 text-lg text-gray-300">
          {data.prezzo
            ? `Prezzo: ${data.prezzo}`
            : lc?.hero?.price_label || "Offerta speciale di lancio"}
        </p>
        <button
          className="mt-8 rounded-xl px-10 py-4 text-base font-semibold text-white transition hover:-translate-y-0.5"
          style={{
            background: "#FF5E3A",
            boxShadow: "0 4px 30px rgba(255,94,58,0.4)",
          }}
        >
          {data.cta || lc?.hero?.cta || "Acquista Ora"}
        </button>
      </div>
    </section>
  );
}
