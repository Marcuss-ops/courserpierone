// ─── SharedGuarantee — Shield badge guarantee block ────────
// Extracted from AmishOffer. Reusable in any pricing section.

import { Shield } from "lucide-react";

interface SharedGuaranteeProps {
  title: string;
  text: string;
  /** Accent color for the shield background and border. Default: #C9840D. */
  accentColor?: string;
  /** If true, renders light-on-dark variant. */
  dark?: boolean;
}

export function SharedGuarantee({
  title,
  text,
  accentColor = "#C9840D",
  dark = true,
}: SharedGuaranteeProps) {
  if (!title) return null;

  return (
    <div
      className="mt-10 text-left rounded-2xl p-6"
      style={{
        background: dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)",
        border: `1px solid ${accentColor}20`,
      }}
    >
      <div className="flex gap-4">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: `${accentColor}20`, color: accentColor }}
        >
          <Shield className="w-5 h-5" />
        </div>
        <div>
          <p
            className="font-semibold"
            style={{ color: dark ? "#ffffff" : "inherit" }}
          >
            {title}
          </p>
          <p
            className="text-sm mt-1 leading-relaxed"
            style={{
              color: dark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.55)",
            }}
          >
            {text}
          </p>
        </div>
      </div>
    </div>
  );
}
