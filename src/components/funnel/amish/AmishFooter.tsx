// ─── AmishFooter — Footer section ──────────────────────────

import type { AmishT } from "./types";

interface AmishFooterProps {
  t: AmishT;
  productTitle: string;
  accent: string;
}

export function AmishFooter({ t, productTitle, accent }: AmishFooterProps) {
  return (
    <footer
      className="relative z-10 py-12 text-sm text-gray-400"
      style={{ borderTop: `1px solid ${accent}12` }}
    >
      <div className="max-w-6xl mx-auto px-6">
        <div className="flex flex-col md:flex-row justify-between gap-6">
          <div>
            <p className="font-semibold text-gray-700">{productTitle}</p>
            <p className="mt-1">{t("footer_rights")}</p>
          </div>
          <div className="text-xs leading-relaxed space-y-1">
            <p>
              Email:{" "}
              <a
                href={`mailto:${t("footer_email")}`}
                style={{ color: accent }}
                className="underline"
              >
                {t("footer_email")}
              </a>
            </p>
            <p className="flex flex-wrap gap-3">
              {t("footer_privacy") && (
                <a
                  href="/privacy"
                  className="hover:text-gray-700 transition-colors"
                >
                  {t("footer_privacy")}
                </a>
              )}
              {t("footer_terms") && (
                <a
                  href="/terms"
                  className="hover:text-gray-700 transition-colors"
                >
                  {t("footer_terms")}
                </a>
              )}
              {t("footer_refund") && (
                <a
                  href="/refund"
                  className="hover:text-gray-700 transition-colors"
                >
                  {t("footer_refund")}
                </a>
              )}
              {t("footer_cookies") && (
                <a
                  href="/privacy#cookies"
                  className="hover:text-gray-700 transition-colors"
                >
                  {t("footer_cookies")}
                </a>
              )}
              {t("footer_withdrawal") && (
                <a
                  href="#"
                  className="hover:text-gray-700 transition-colors"
                >
                  {t("footer_withdrawal")}
                </a>
              )}
            </p>
          </div>
        </div>
        {t("footer_legal_note") && (
          <p className="mt-8 text-[11px] text-gray-300 max-w-3xl">
            {t("footer_legal_note")}
          </p>
        )}
      </div>
    </footer>
  );
}
