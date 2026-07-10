// ─── SharedCTAButton — Accent-themed CTA button ────────────
// Thin wrapper around TrackedCtaButton with accent gradient styling.
// Used by: amish, lumio templates. Eliminates duplicate gradient/boxShadow patterns.

import { ArrowRight } from "lucide-react";
import { TrackedCtaButton } from "@/components/course/tracked-cta-button";

interface SharedCTAButtonProps {
  href?: string;
  productSlug: string;
  productId?: string;
  locale: string;
  /** Accent hex color (e.g. "#C9840D"). */
  accentColor: string;
  /** Button label. */
  children: React.ReactNode;
  /** If true, renders full-width. */
  fullWidth?: boolean;
  /** Override the default boxShadow. */
  boxShadow?: string;
  /** Extra class names. */
  className?: string;
}

export function SharedCTAButton({
  href,
  productSlug,
  productId,
  locale,
  accentColor,
  children,
  fullWidth,
  boxShadow,
  className = "",
}: SharedCTAButtonProps) {
  return (
    <TrackedCtaButton
      href={href}
      productSlug={productSlug}
      productId={productId}
      locale={locale}
      style={{
        background: `linear-gradient(135deg, ${accentColor} 0%, ${accentColor}CC 100%)`,
        boxShadow: boxShadow ?? `0 6px 28px ${accentColor}38`,
      }}
      className={`inline-flex items-center gap-2 px-8 py-4 text-white font-semibold rounded-2xl transition-all hover:-translate-y-0.5 ${
        fullWidth ? "w-full justify-center" : ""
      } ${className}`}
    >
      {children}
      <ArrowRight className="w-5 h-5" />
    </TrackedCtaButton>
  );
}
