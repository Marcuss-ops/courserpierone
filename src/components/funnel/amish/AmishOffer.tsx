// ─── AmishOffer — Dark pricing / offer section ─────────────

import { Lock } from "lucide-react";
import { SharedGuarantee } from "@/components/funnel/shared/SharedGuarantee";
import { SharedCTAButton } from "@/components/funnel/shared/SharedCTAButton";
import type { AmishProps, AmishT } from "./types";

interface AmishOfferProps {
  data: AmishProps["data"];
  t: AmishT;
  productTitle: string;
  accent: string;
  locale: string;
  productSlug?: string;
  productId?: string;
  checkoutUrl?: string;
}

export function AmishOffer({
  data,
  t,
  productTitle,
  accent,
  locale,
  productSlug,
  productId,
  checkoutUrl,
}: AmishOfferProps) {
  return (
    <section className="relative z-10 py-20 lg:py-28">
      {/* Dark gradient section background */}
      <div
        className="absolute inset-0 -z-10"
        style={{
          background:
            "linear-gradient(160deg, #1A1208 0%, #251A0C 50%, #1A1208 100%)",
        }}
      />
      {/* Accent glows */}
      <div
        className="absolute inset-0 -z-10 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 800px 400px at 20% 50%, ${accent}18 0%, transparent 70%), radial-gradient(ellipse 600px 400px at 80% 50%, ${accent}12 0%, transparent 70%)`,
        }}
      />

      <div className="max-w-2xl mx-auto px-6">
        <div
          className="rounded-[32px] p-8 md:p-14 text-center"
          style={{
            background: "rgba(255,250,240,0.06)",
            backdropFilter: "blur(12px)",
            border: `1px solid ${accent}30`,
            boxShadow:
              "0 24px 80px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)",
          }}
        >
          {t("offer_badge") && (
            <p
              className="inline-block px-3 py-1 rounded-full text-xs font-bold tracking-widest mb-5 uppercase"
              style={{ background: `${accent}22`, color: accent }}
            >
              {t("offer_badge")}
            </p>
          )}

          <h2
            className="text-4xl md:text-5xl text-white"
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
            }}
          >
            {productTitle}
            {t("offer_title") && <> &mdash; {t("offer_title")}</>}
          </h2>

          <div className="mt-8 flex items-center justify-center gap-5">
            {t("offer_original_price") && (
              <span className="text-2xl line-through text-white/30">
                {t("offer_original_price")}
              </span>
            )}
            <span
              className="text-6xl font-semibold"
              style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                color: accent,
              }}
            >
              {data.prezzo}
            </span>
          </div>

          {t("offer_one_time") && (
            <p className="mt-2 text-white/60">{t("offer_one_time")}</p>
          )}
          {t("offer_launch_note") && (
            <p className="mt-1 text-sm font-medium" style={{ color: accent }}>
              {t("offer_launch_note")}
            </p>
          )}

          <SharedCTAButton
            href={checkoutUrl}
            productSlug={productSlug ?? ""}
            productId={productId}
            locale={locale}
            accentColor={accent}
            fullWidth
            boxShadow={`0 8px 40px ${accent}50`}
            className="mt-10 px-8 py-5 text-lg"
          >
            {t("offer_cta")} {data.prezzo}
          </SharedCTAButton>

          <div className="mt-5 flex items-center justify-center gap-4 text-xs text-white/40">
            {t("offer_stripe_paypal") && (
              <span className="flex items-center gap-1">
                <Lock className="w-3.5 h-3.5" style={{ color: accent }} />
                {t("offer_stripe_paypal")}
              </span>
            )}
            {t("offer_invoice") && (
              <>
                <span>&bull;</span>
                <span>{t("offer_invoice")}</span>
              </>
            )}
          </div>

          {/* Guarantee */}
          <SharedGuarantee
            title={t("guarantee_title")}
            text={t("guarantee_text")}
            accentColor={accent}
            dark
          />
        </div>
      </div>
    </section>
  );
}
