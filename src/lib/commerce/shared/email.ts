/**
 * Email System — Localizzato per tutte le lingue
 *
 * Ogni email ha template definiti per locale con fallback:
 *   locale specifico → "en" → "it"
 *
 * Template data + HTML/text builders: estratti in `./email-templates.ts`
 * (commit `refactor(email): extract templates to email-templates.ts`).
 * Questo file mantiene solo `getTransporter()` + le 3 send functions.
 *
 * Uso: sendPurchaseConfirmation(email, productName, courseUrl, "pt-br")
 */

import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";
import { AppError } from "@/lib/errors";
import { localeToLanguage } from "@/lib/i18n/locale-resolver";
import {
  PURCHASE_TEMPLATES,
  ABANDONED_TEMPLATES,
  DM_NOTIFICATION_TEMPLATES,
  EBOOK_LINES,
  buildHtmlEmail,
  buildTextEmail,
  resolveTemplate,
  fillTemplate,
  type EmailContent,
} from "./email-templates";

// ─── Mail Transport ─────────────────────────────────────────
let _transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (_transporter) return _transporter;

  const host = process.env.EMAIL_SERVER_HOST;
  const port = process.env.EMAIL_SERVER_PORT;
  const user = process.env.EMAIL_SERVER_USER;
  const pass = process.env.EMAIL_SERVER_PASSWORD;
  const from = process.env.EMAIL_FROM;

  // C1e/C2b cleanup: defaults removed from env.ts (smtp.gmail.com / 587 /
  // noreply@courser.app) — every required email env must be set explicitly.
  // If any is missing, return null so callers can short-circuit (they log
  // a dev-friendly summary instead of sending).
  if (!host || !port || !user || !pass || !from) {
    return null;
  }

  _transporter = nodemailer.createTransport({
    host,
    port: parseInt(port, 10),
    secure: port === "465",
    auth: { user, pass },
  });

  return _transporter;
}

// ─── DM Notification ────────────────────────────────────────

/** Invia notifica email per un nuovo DM (se il destinatario è offline). */
export async function sendDmNotificationEmail(
  email: string,
  senderName: string,
  locale = "en",
): Promise<boolean> {
  const transporter = getTransporter();

  if (!transporter) {
    console.log(`\n💬 DM notification per ${email}: nuovo messaggio da ${senderName} (locale: ${locale})\n`);
    return false;
  }

  // EMAIL_FROM is validated upstream by getTransporter(); an explicit
  // guard adds type honesty in case that contract is loosened in future.
  const from = process.env.EMAIL_FROM;
  if (!from) return false;
  const tpl = resolveTemplate(locale, DM_NOTIFICATION_TEMPLATES);
  const inboxUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://courser.app"}/dashboard/messages`;

  const filled: EmailContent = {
    subject: tpl.subject.replace(/{sender}/g, senderName),
    heading: tpl.heading,
    body: tpl.body.map((l) => l.replace(/{sender}/g, senderName)),
    buttonText: tpl.buttonText,
    footer: tpl.footer.replace(/{sender}/g, senderName),
  };

  try {
    await transporter.sendMail({
      from,
      to: email,
      subject: filled.subject,
      html: buildHtmlEmail(
        undefined,
        filled.heading,
        filled.body,
        filled.buttonText,
        inboxUrl,
        filled.footer,
        "💬",
        "rgba(255,140,66,0.15)",
        "rgba(255,140,66,0.3)",
        "linear-gradient(135deg,#FF8C42,#e07730)",
        "rgba(255,140,66,0.3)",
        "#FF8C42",
      ),
      text: buildTextEmail(
        filled.body,
        filled.buttonText,
        inboxUrl,
        filled.footer,
      ),
    });

    console.log(`✅ Email notifica DM inviata a ${email} (locale: ${locale})`);
    return true;
  } catch (error) {
    console.error(`❌ Errore invio notifica DM a ${email}:`, error);
    return false;
  }
}

// ════════════════════════════════════════════════════════════
// PUBLIC API
// ════════════════════════════════════════════════════════════

/** Invia email di recupero checkout abbandonato */
export async function sendAbandonedCheckoutEmail(
  email: string,
  productName: string,
  checkoutUrl: string,
  locale = "en",
): Promise<boolean> {
  const transporter = getTransporter();

  if (!transporter) {
    console.log(`\n🛒 Checkout abbandonato per ${email}: ${productName} — Recupera: ${checkoutUrl} (locale: ${locale})\n`);
    return false;
  }

  const from = process.env.EMAIL_FROM;
  if (!from) return false;
  const tpl = resolveTemplate(locale, ABANDONED_TEMPLATES);
  const filled = fillTemplate(tpl, productName);

  try {
    await transporter.sendMail({
      from,
      to: email,
      subject: filled.subject,
      html: buildHtmlEmail(
        productName,
        filled.heading,
        filled.body,
        filled.buttonText,
        checkoutUrl,
        filled.footer,
        "⏳",
        "rgba(255,193,7,0.15)",
        "rgba(255,193,7,0.3)",
        "linear-gradient(135deg,#ffc107,#f59e0b)",
        "rgba(255,193,7,0.3)",
        "#f59e0b",
      ),
      text: buildTextEmail(
        filled.body,
        filled.buttonText,
        checkoutUrl,
        filled.footer,
      ),
    });

    console.log(`✅ Email recupero checkout inviata a ${email} (locale: ${locale})`);
    return true;
  } catch (error) {
    console.error(`❌ Errore invio recupero a ${email}:`, error);
    throw new AppError(`Failed to send abandoned checkout email`, {
      statusCode: 502,
      code: "EMAIL_SEND_FAILED",
    });
  }
}

/** Invia email di conferma acquisto (con link download ebook opzionale) */
export async function sendPurchaseConfirmation(
  email: string,
  productName: string,
  courseUrl: string,
  locale = "en",
  ebookDownloadUrl?: string,
): Promise<boolean> {
  const transporter = getTransporter();

  if (!transporter) {
    console.log(`\n📦 Acquisto confermato per ${email}: ${productName} — ${courseUrl} (locale: ${locale})\n`);
    return false;
  }

  const from = process.env.EMAIL_FROM;
  if (!from) return false;
  const tpl = resolveTemplate(locale, PURCHASE_TEMPLATES);
  const filled = fillTemplate(tpl, productName);

  const ebookLang = localeToLanguage(locale) || "en";
  const ebookTemplate = EBOOK_LINES[ebookLang] ?? EBOOK_LINES.en;
  // Substitute {url} placeholder at runtime (kept as template placeholder
  // to keep EBOOK_LINES immutable + locale-agnostic of URL).
  const ebookLines = {
    html: ebookTemplate.html.replace(/{url}/g, ebookDownloadUrl ?? ""),
    text: ebookTemplate.text.replace(/{url}/g, ebookDownloadUrl ?? ""),
  };

  // Add ebook download link to body if available
  const bodyWithEbook = ebookDownloadUrl
    ? [...filled.body, `<br/><br/>` + ebookLines.html]
    : filled.body;

  // Build localized ebook text
  const bodyTextWithEbook = ebookDownloadUrl
    ? [...filled.body, ebookLines.text]
    : filled.body;

  // Resolve static PDF attachment if exists
  const attachments: { filename: string; path: string }[] = [];
  if (productName) {
    const staticPdfPath = path.join(process.cwd(), "public", "courses", productName, `${ebookLang}.pdf`);
    if (fs.existsSync(staticPdfPath)) {
      attachments.push({
        filename: `${productName}-${ebookLang}.pdf`,
        path: staticPdfPath,
      });
      console.log(`[EmailService] Attached static PDF: ${staticPdfPath}`);
    }
  }

  try {
    await transporter.sendMail({
      from,
      to: email,
      subject: filled.subject,
      html: buildHtmlEmail(
        productName,
        filled.heading,
        bodyWithEbook,
        filled.buttonText,
        courseUrl,
        filled.footer,
        "✅",
        "rgba(0,219,231,0.15)",
        "rgba(0,219,231,0.3)",
        "linear-gradient(135deg,#4d8eff,#005ac2)",
        "rgba(77,142,255,0.3)",
        "#4d8eff",
      ),
      text: buildTextEmail(
        bodyTextWithEbook,
        filled.buttonText,
        courseUrl,
        filled.footer,
      ),
      attachments,
    });

    console.log(`✅ Email di conferma inviata a ${email} (locale: ${locale})` + (ebookDownloadUrl ? ` con ebook download link` : ""));
    return true;
  } catch (error) {
    console.error(`❌ Errore invio conferma a ${email}:`, error);
    throw new AppError(`Failed to send purchase confirmation email`, {
      statusCode: 502,
      code: "EMAIL_SEND_FAILED",
    });
  }
}
