// ─── AmishTopBar — Promo banner at top ────────────────────

import type { AmishT } from "./types";

interface AmishTopBarProps {
  t: AmishT;
}

export function AmishTopBar({ t }: AmishTopBarProps) {
  const text = t("top_bar");
  if (!text) return null;

  return (
    <div
      className="relative z-10 text-center text-sm py-3 px-4"
      style={{
        background:
          "linear-gradient(90deg, var(--accent)E8 0%, var(--accent) 50%, var(--accent)E8 100%)",
        color: "#fff",
      }}
    >
      <p className="font-semibold tracking-wide">{text}</p>
    </div>
  );
}
