/**
 * Email System — Localizzato per tutte le lingue
 *
 * Ogni email ha template definiti per locale con fallback:
 *   locale specifico → "en" → "it"
 *
 * Uso: sendPurchaseConfirmation(email, productName, courseUrl, "pt-br")
 */

import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";

// ─── Mail Transport ─────────────────────────────────────────
let _transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (_transporter) return _transporter;

  const host = process.env.EMAIL_SERVER_HOST;
  const user = process.env.EMAIL_SERVER_USER;
  const pass = process.env.EMAIL_SERVER_PASSWORD;

  if (!host || !user || !pass) {
    return null;
  }

  _transporter = nodemailer.createTransport({
    host,
    port: parseInt(process.env.EMAIL_SERVER_PORT || "587"),
    secure: process.env.EMAIL_SERVER_PORT === "465",
    auth: { user, pass },
  });

  return _transporter;
}

// ─── Locale helpers ─────────────────────────────────────────
function extractLang(locale: string): string {
  return locale.split("-")[0]?.toLowerCase() ?? "en";
}

// ════════════════════════════════════════════════════════════
// EMAIL TEMPLATES — Localizzati
// ════════════════════════════════════════════════════════════

interface EmailContent {
  subject: string;
  heading: string;
  body: string[];
  buttonText: string;
  footer: string;
}

// ─── Purchase Confirmation ──────────────────────────────────
const PURCHASE_TEMPLATES: Record<string, EmailContent> = {
  it: {
    subject: `✅ Acquisto completato — {product}`,
    heading: "Acquisto Completato!",
    body: [
      'Hai acquistato <strong style="color:#e5e2e1;">"{product}"</strong>.',
      "Il tuo accesso è già attivo. Puoi iniziare subito il corso.",
    ],
    buttonText: "Inizia il Corso",
    footer: "Se hai domande, rispondi a questa email. Siamo qui per aiutarti.",
  },
  en: {
    subject: `✅ Purchase confirmed — {product}`,
    heading: "Purchase Complete!",
    body: [
      'You purchased <strong style="color:#e5e2e1;">"{product}"</strong>.',
      "Your access is already active. You can start right away.",
    ],
    buttonText: "Start the Course",
    footer: "If you have any questions, reply to this email. We're here to help.",
  },
  fr: {
    subject: `✅ Achat confirmé — {product}`,
    heading: "Achat Réussi !",
    body: [
      'Vous avez acheté <strong style="color:#e5e2e1;">"{product}"</strong>.',
      "Votre accès est déjà actif. Vous pouvez commencer immédiatement.",
    ],
    buttonText: "Commencer le Cours",
    footer: "Si vous avez des questions, répondez à cet email. Nous sommes là pour vous aider.",
  },
  de: {
    subject: `✅ Kauf bestätigt — {product}`,
    heading: "Kauf Abgeschlossen!",
    body: [
      'Sie haben <strong style="color:#e5e2e1;">"{product}"</strong> erworben.',
      "Ihr Zugriff ist bereits aktiv. Sie können sofort starten.",
    ],
    buttonText: "Kurs Starten",
    footer: "Bei Fragen antworten Sie einfach auf diese E-Mail. Wir sind für Sie da.",
  },
  es: {
    subject: `✅ Compra confirmada — {product}`,
    heading: "¡Compra Completada!",
    body: [
      'Has adquirido <strong style="color:#e5e2e1;">"{product}"</strong>.',
      "Tu acceso ya está activo. Puedes empezar de inmediato.",
    ],
    buttonText: "Empezar el Curso",
    footer: "Si tienes preguntas, responde a este correo. Estamos aquí para ayudarte.",
  },
  pt: {
    subject: `✅ Compra confirmada — {product}`,
    heading: "Compra Concluída!",
    body: [
      'Você adquiriu <strong style="color:#e5e2e1;">"{product}"</strong>.',
      "Seu acesso já está ativo. Você pode começar agora mesmo.",
    ],
    buttonText: "Iniciar o Curso",
    footer: "Se tiver dúvidas, responda a este e-mail. Estamos aqui para ajudar.",
  },
  ja: {
    subject: `✅ 購入完了 — {product}`,
    heading: "購入完了しました！",
    body: [
      '<strong style="color:#e5e2e1;">"{product}"</strong> をご購入いただきありがとうございます。',
      "アクセスはすでに有効です。今すぐ開始できます。",
    ],
    buttonText: "コースを始める",
    footer: "ご質問があれば、このメールに返信してください。サポートいたします。",
  },
  nl: {
    subject: `✅ Aankoop bevestigd — {product}`,
    heading: "Aankoop Voltooid!",
    body: [
      'Je hebt <strong style="color:#e5e2e1;">"{product}"</strong> gekocht.',
      "Je toegang is al actief. Je kunt meteen beginnen.",
    ],
    buttonText: "Start de Cursus",
    footer: "Als je vragen hebt, reageer dan op deze e-mail. We helpen je graag.",
  },
  pl: {
    subject: `✅ Zakup potwierdzony — {product}`,
    heading: "Zakup Zakończony!",
    body: [
      'Zakupiłeś <strong style="color:#e5e2e1;">"{product}"</strong>.',
      "Twój dostęp jest już aktywny. Możesz rozpocząć od razu.",
    ],
    buttonText: "Rozpocznij Kurs",
    footer: "Jeśli masz pytania, odpowiedz na tego e-maila. Jesteśmy tutaj, aby pomóc.",
  },
  sv: {
    subject: `✅ Köp bekräftat — {product}`,
    heading: "Köpet Slutfört!",
    body: [
      'Du har köpt <strong style="color:#e5e2e1;">"{product}"</strong>.',
      "Din åtkomst är redan aktiv. Du kan börja direkt.",
    ],
    buttonText: "Starta Kursen",
    footer: "Om du har frågor, svara på detta mejl. Vi finns här för att hjälpa dig.",
  },
  no: {
    subject: `✅ Kjøp bekreftet — {product}`,
    heading: "Kjøpet Fullført!",
    body: [
      'Du har kjøpt <strong style="color:#e5e2e1;">"{product}"</strong>.',
      "Tilgangen din er allerede aktiv. Du kan starte med en gang.",
    ],
    buttonText: "Start Kurset",
    footer: "Hvis du har spørsmål, svar på denne e-posten. Vi er her for å hjelpe.",
  },
  da: {
    subject: `✅ Køb bekræftet — {product}`,
    heading: "Købet Gennemført!",
    body: [
      'Du har købt <strong style="color:#e5e2e1;">"{product}"</strong>.',
      "Din adgang er allerede aktiv. Du kan starte med det samme.",
    ],
    buttonText: "Start Kurset",
    footer: "Hvis du har spørgsmål, svar på denne e-mail. Vi er her for at hjælpe.",
  },
  ru: {
    subject: `✅ Покупка подтверждена — {product}`,
    heading: "Покупка Завершена!",
    body: [
      'Вы приобрели <strong style="color:#e5e2e1;">"{product}"</strong>.',
      "Ваш доступ уже активен. Вы можете начать прямо сейчас.",
    ],
    buttonText: "Начать Курс",
    footer: "Если у вас есть вопросы, ответьте на это письмо. Мы здесь, чтобы помочь.",
  },
  zh: {
    subject: `✅ 购买已确认 — {product}`,
    heading: "购买完成！",
    body: [
      '您已购买 <strong style="color:#e5e2e1;">"{product}"</strong>。',
      "您的访问权限已经激活。您可以立即开始学习。",
    ],
    buttonText: "开始课程",
    footer: "如有任何问题，请回复此邮件。我们随时为您提供帮助。",
  },
  ko: {
    subject: `✅ 구매 확인 — {product}`,
    heading: "구매 완료!",
    body: [
      '<strong style="color:#e5e2e1;">"{product}"</strong>을(를) 구매하셨습니다.',
      "액세스가 이미 활성화되었습니다. 지금 바로 시작할 수 있습니다.",
    ],
    buttonText: "강의 시작하기",
    footer: "질문이 있으시면 이 이메일에 답장해 주세요. 도와드리겠습니다.",
  },
  ar: {
    subject: `✅ تم تأكيد الشراء — {product}`,
    heading: "تم إتمام الشراء!",
    body: [
      'لقد اشتريت <strong style="color:#e5e2e1;">"{product}"</strong>.',
      "وصولك نشط بالفعل. يمكنك البدء فوراً.",
    ],
    buttonText: "ابدأ الدورة",
    footer: "إذا كان لديك أي أسئلة، رد على هذا البريد الإلكتروني. نحن هنا للمساعدة.",
  },
};

// ─── Abandoned Checkout ─────────────────────────────────────
const ABANDONED_TEMPLATES: Record<string, EmailContent> = {
  it: {
    subject: `⏳ Hai lasciato "{product}" nel carrello?`,
    heading: "Non hai completato l'acquisto",
    body: [
      'Hai lasciato <strong style="color:#e5e2e1;">"{product}"</strong> nel carrello.',
      "Il tuo accesso è ancora disponibile — completa l'acquisto per sbloccarlo.",
    ],
    buttonText: "Completa l'Acquisto",
    footer: "Se hai già completato l'acquisto, ignora questa email.",
  },
  en: {
    subject: `⏳ Did you leave "{product}" in your cart?`,
    heading: "You didn't complete your purchase",
    body: [
      'You left <strong style="color:#e5e2e1;">"{product}"</strong> in your cart.',
      "Your access is still available — complete your purchase to unlock it.",
    ],
    buttonText: "Complete Purchase",
    footer: "If you've already completed your purchase, ignore this email.",
  },
  fr: {
    subject: `⏳ Avez-vous laissé "{product}" dans votre panier ?`,
    heading: "Vous n'avez pas finalisé votre achat",
    body: [
      'Vous avez laissé <strong style="color:#e5e2e1;">"{product}"</strong> dans votre panier.',
      "Votre accès est toujours disponible — finalisez votre achat pour le débloquer.",
    ],
    buttonText: "Finaliser l'Achat",
    footer: "Si vous avez déjà finalisé votre achat, ignorez cet email.",
  },
  de: {
    subject: `⏳ Haben Sie "{product}" im Warenkorb gelassen?`,
    heading: "Sie haben den Kauf nicht abgeschlossen",
    body: [
      'Sie haben <strong style="color:#e5e2e1;">"{product}"</strong> im Warenkorb gelassen.',
      "Ihr Zugriff ist noch verfügbar — schließen Sie den Kauf ab, um ihn freizuschalten.",
    ],
    buttonText: "Kauf Abschließen",
    footer: "Wenn Sie den Kauf bereits abgeschlossen haben, ignorieren Sie diese E-Mail.",
  },
  es: {
    subject: `⏳ ¿Dejaste "{product}" en tu carrito?`,
    heading: "No completaste tu compra",
    body: [
      'Dejaste <strong style="color:#e5e2e1;">"{product}"</strong> en tu carrito.',
      "Tu acceso sigue disponible — completa tu compra para desbloquearlo.",
    ],
    buttonText: "Completar Compra",
    footer: "Si ya completaste tu compra, ignora este correo.",
  },
  pt: {
    subject: `⏳ Você deixou "{product}" no carrinho?`,
    heading: "Você não completou a compra",
    body: [
      'Você deixou <strong style="color:#e5e2e1;">"{product}"</strong> no seu carrinho.',
      "Seu acesso ainda está disponível — complete a compra para desbloqueá-lo.",
    ],
    buttonText: "Completar Compra",
    footer: "Se já completou a compra, ignore este e-mail.",
  },
  nl: {
    subject: `⏳ Heb je "{product}" in je winkelwagen achtergelaten?`,
    heading: "Je hebt de aankoop niet voltooid",
    body: [
      'Je hebt <strong style="color:#e5e2e1;">"{product}"</strong> in je winkelwagen achtergelaten.',
      "Je toegang is nog steeds beschikbaar — voltooi je aankoop om het te ontgrendelen.",
    ],
    buttonText: "Aankoop Voltooien",
    footer: "Als je de aankoop al hebt voltooid, negeer dan deze e-mail.",
  },
  pl: {
    subject: `⏳ Czy zostawiłeś "{product}" w koszyku?`,
    heading: "Nie dokończyłeś zakupu",
    body: [
      'Zostawiłeś <strong style="color:#e5e2e1;">"{product}"</strong> w koszyku.',
      "Twój dostęp jest nadal dostępny — dokończ zakup, aby go odblokować.",
    ],
    buttonText: "Dokończ Zakup",
    footer: "Jeśli już dokonałeś zakupu, zignoruj tę wiadomość.",
  },
  sv: {
    subject: `⏳ Lämnade du "{product}" i din varukorg?`,
    heading: "Du slutförde inte ditt köp",
    body: [
      'Du lämnade <strong style="color:#e5e2e1;">"{product}"</strong> i din varukorg.',
      "Din åtkomst är fortfarande tillgänglig — slutför ditt köp för att låsa upp den.",
    ],
    buttonText: "Slutför Köp",
    footer: "Om du redan har slutfört ditt köp, ignorera detta mejl.",
  },
};

// ════════════════════════════════════════════════════════════
// EMAIL HTML BUILDER
// ════════════════════════════════════════════════════════════

function buildHtmlEmail(
  product: string | undefined,
  heading: string,
  bodyLines: string[],
  buttonText: string,
  buttonUrl: string,
  footer: string,
  icon: string,
  iconBg: string,
  iconBorder: string,
  buttonGradient: string,
  buttonShadow: string,
  accentColor: string,
): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    </head>
    <body style="margin:0;padding:0;background:#0a0a0c;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0c;padding:40px 20px;">
        <tr>
          <td align="center">
            <table width="480" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,rgba(23,23,26,0.95),rgba(10,10,12,0.98));border-radius:24px;padding:48px 40px;border:1px solid rgba(255,255,255,0.08);">
              <tr>
                <td align="center" style="padding-bottom:24px;">
                  <div style="width:64px;height:64px;border-radius:50%;background:${iconBg};border:1px solid ${iconBorder};display:flex;align-items:center;justify-content:center;margin:0 auto;">
                    <span style="font-size:32px;">${icon}</span>
                  </div>
                </td>
              </tr>
              <tr>
                <td align="center" style="padding-bottom:8px;">
                  <h1 style="color:#ffffff;font-size:24px;font-weight:900;margin:0;letter-spacing:-0.5px;">${heading}</h1>
                </td>
              </tr>
              <tr>
                <td align="center" style="padding-bottom:32px;">
                  <p style="color:#a0a0a0;font-size:14px;line-height:1.6;margin:0;">
                    ${bodyLines.join("<br/>")}
                  </p>
                </td>
              </tr>
              <tr>
                <td align="center" style="padding-bottom:24px;">
                  <a href="${buttonUrl}" style="display:inline-block;padding:16px 40px;border-radius:16px;background:${buttonGradient};color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;box-shadow:0 4px 24px ${buttonShadow};">
                    ${buttonText}
                  </a>
                </td>
              </tr>
              <tr>
                <td align="center" style="padding-bottom:24px;">
                  <p style="color:#555;font-size:12px;line-height:1.5;margin:0;">
                    ${footer}
                    <br/>© ${new Date().getFullYear()} Courser
                  </p>
                </td>
              </tr>
              <tr>
                <td align="center">
                  <div style="height:1px;width:100%;background:rgba(255,255,255,0.05);margin-bottom:16px;"></div>
                  <p style="color:#444;font-size:11px;margin:0;">
                    <span style="color:${accentColor};">Courser</span> — Piattaforma di corsi digitali multilingua
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}

function buildTextEmail(bodyLines: string[], buttonText: string, buttonUrl: string, footer: string): string {
  return `${bodyLines.join("\n")}\n\n${buttonText}: ${buttonUrl}\n\n${footer}`;
}

function resolveTemplate<T extends EmailContent>(locale: string, templates: Record<string, T>): T {
  const lang = extractLang(locale);
  return templates[locale] ?? templates[lang] ?? templates["en"] ?? templates["it"] ?? templates[Object.keys(templates)[0]];
}

function fillTemplate(tpl: EmailContent, product: string): EmailContent {
  return {
    subject: tpl.subject.replace(/{product}/g, product),
    heading: tpl.heading,
    body: tpl.body.map((l) => l.replace(/{product}/g, product)),
    buttonText: tpl.buttonText,
    footer: tpl.footer.replace(/{product}/g, product),
  };
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

  const from = process.env.EMAIL_FROM ?? "noreply@courser.app";
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
    return false;
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

  const from = process.env.EMAIL_FROM ?? "noreply@courser.app";
  const tpl = resolveTemplate(locale, PURCHASE_TEMPLATES);
  const filled = fillTemplate(tpl, productName);

  // Localized ebook download lines
  const EBOOK_LINES: Record<string, { html: string; text: string }> = {
    it: { html: `Il tuo ebook è pronto per il download — è disponibile nella tua lingua preferita.<br/><a href="${ebookDownloadUrl}" style="color:#ddb7ff;text-decoration:underline;">📖 Scarica il tuo eBook (PDF)</a>`, text: `📖 Scarica il tuo eBook (PDF): ${ebookDownloadUrl}` },
    en: { html: `Your ebook is ready to download — available in your preferred language.<br/><a href="${ebookDownloadUrl}" style="color:#ddb7ff;text-decoration:underline;">📖 Download your eBook (PDF)</a>`, text: `📖 Download your eBook (PDF): ${ebookDownloadUrl}` },
    fr: { html: `Votre ebook est prêt à être téléchargé — disponible dans votre langue préférée.<br/><a href="${ebookDownloadUrl}" style="color:#ddb7ff;text-decoration:underline;">📖 Télécharger votre eBook (PDF)</a>`, text: `📖 Télécharger votre eBook (PDF): ${ebookDownloadUrl}` },
    de: { html: `Ihr Ebook ist zum Download bereit — verfügbar in Ihrer bevorzugten Sprache.<br/><a href="${ebookDownloadUrl}" style="color:#ddb7ff;text-decoration:underline;">📖 Ihr eBook herunterladen (PDF)</a>`, text: `📖 Ihr eBook herunterladen (PDF): ${ebookDownloadUrl}` },
    es: { html: `Tu ebook está listo para descargar — disponible en tu idioma preferido.<br/><a href="${ebookDownloadUrl}" style="color:#ddb7ff;text-decoration:underline;">📖 Descarga tu eBook (PDF)</a>`, text: `📖 Descarga tu eBook (PDF): ${ebookDownloadUrl}` },
    pt: { html: `Seu ebook está pronto para download — disponível no seu idioma preferido.<br/><a href="${ebookDownloadUrl}" style="color:#ddb7ff;text-decoration:underline;">📖 Baixe seu eBook (PDF)</a>`, text: `📖 Baixe seu eBook (PDF): ${ebookDownloadUrl}` },
    ja: { html: `eBookのダウンロード准备が整いました — お好みの言語でご利用いただけます。<br/><a href="${ebookDownloadUrl}" style="color:#ddb7ff;text-decoration:underline;">📖 eBookをダウンロード (PDF)</a>`, text: `📖 eBookをダウンロード (PDF): ${ebookDownloadUrl}` },
    nl: { html: `Uw ebook is klaar om te downloaden — beschikbaar in uw voorkeurstaal.<br/><a href="${ebookDownloadUrl}" style="color:#ddb7ff;text-decoration:underline;">📖 Download uw eBook (PDF)</a>`, text: `📖 Download uw eBook (PDF): ${ebookDownloadUrl}` },
    pl: { html: `Twoja ebook jest gotowy do pobrania — dostępny w Twoim preferowanym języku.<br/><a href="${ebookDownloadUrl}" style="color:#ddb7ff;text-decoration:underline;">📖 Pobierz swój eBook (PDF)</a>`, text: `📖 Pobierz swój eBook (PDF): ${ebookDownloadUrl}` },
  };

  const ebookLang = extractLang(locale);
  const ebookLines = EBOOK_LINES[ebookLang] ?? EBOOK_LINES["en"];

  // Add ebook download link to body if available
  const bodyWithEbook = ebookDownloadUrl
    ? [...filled.body, `<br/><br/>` + ebookLines.html]
    : filled.body;

  // Build localized ebook text
  const bodyTextWithEbook = ebookDownloadUrl
    ? [...filled.body, ebookLines.text]
    : filled.body;

  // Resolve static PDF attachment if exists
  const attachments: any[] = [];
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
    return false;
  }
}
