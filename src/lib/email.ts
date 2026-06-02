import nodemailer from "nodemailer";

let _transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (_transporter) return _transporter;

  const host = process.env.EMAIL_SERVER_HOST;
  const user = process.env.EMAIL_SERVER_USER;
  const pass = process.env.EMAIL_SERVER_PASSWORD;

  // Se SMTP non è configurato, non inviare email (utile in sviluppo)
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

export async function sendMagicLinkEmail(
  email: string,
  magicUrl: string,
  productName?: string
): Promise<boolean> {
  const transporter = getTransporter();

  if (!transporter) {
    // Email non configurata: stampa il link nel log (utile in sviluppo)
    console.log(`\n🔗 Magic link per ${email}: ${magicUrl}\n`);
    return false;
  }

  const from = process.env.EMAIL_FROM ?? "noreply@courser.app";

  try {
    await transporter.sendMail({
      from,
      to: email,
      subject: productName
        ? `🎯 Accesso a "${productName}" — Courser`
        : "🔗 Il tuo link di accesso — Courser",
      html: `
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
                      <div style="width:56px;height:56px;border-radius:16px;background:rgba(77,142,255,0.15);border:1px solid rgba(255,255,255,0.1);display:flex;align-items:center;justify-content:center;margin:0 auto;">
                        <span style="font-size:28px;font-weight:900;color:#4d8eff;">C</span>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td align="center" style="padding-bottom:8px;">
                      <h1 style="color:#ffffff;font-size:24px;font-weight:900;margin:0;letter-spacing:-0.5px;">Il tuo accesso è pronto</h1>
                    </td>
                  </tr>
                  <tr>
                    <td align="center" style="padding-bottom:32px;">
                      <p style="color:#a0a0a0;font-size:14px;line-height:1.6;margin:0;">
                        ${productName ? `Clicca il pulsante per accedere a <strong style="color:#e5e2e1;">"${productName}"</strong>` : "Clicca il pulsante qui sotto per accedere alla piattaforma."}
                        <br/>Il link è valido per <strong style="color:#e5e2e1;">24 ore</strong>.
                      </p>
                    </td>
                  </tr>
                  <tr>
                    <td align="center" style="padding-bottom:32px;">
                      <a href="${magicUrl}" style="display:inline-block;padding:16px 40px;border-radius:16px;background:linear-gradient(135deg,#4d8eff,#005ac2);color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;box-shadow:0 4px 24px rgba(77,142,255,0.3);">
                        Accedi Ora
                      </a>
                    </td>
                  </tr>
                  <tr>
                    <td align="center" style="padding-bottom:24px;">
                      <p style="color:#555;font-size:12px;line-height:1.5;margin:0;">
                        Se non hai richiesto questo accesso, ignora questa email.
                        <br/>© ${new Date().getFullYear()} Courser
                      </p>
                    </td>
                  </tr>
                  <tr>
                    <td align="center">
                      <div style="height:1px;width:100%;background:rgba(255,255,255,0.05);margin-bottom:16px;"></div>
                      <p style="color:#444;font-size:11px;margin:0;">
                        <span style="color:#4d8eff;">Courser</span> — Piattaforma di corsi digitali multilingua
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
      text: productName
        ? `Accedi a "${productName}" — Courser\n\nClicca il link qui sotto per accedere:\n${magicUrl}\n\nIl link è valido per 24 ore.\n\nSe non hai richiesto questo accesso, ignora questa email.`
        : `Il tuo link di accesso — Courser\n\nClicca il link qui sotto per accedere:\n${magicUrl}\n\nIl link è valido per 24 ore.\n\nSe non hai richiesto questo accesso, ignora questa email.`,
    });

    console.log(`✅ Email inviata a ${email}`);
    return true;
  } catch (error) {
    console.error(`❌ Errore invio email a ${email}:`, error);
    return false;
  }
}

export async function sendAbandonedCheckoutEmail(
  email: string,
  productName: string,
  checkoutUrl: string
): Promise<boolean> {
  const transporter = getTransporter();

  if (!transporter) {
    console.log(`\n🛒 Checkout abbandonato per ${email}: ${productName} — Recupera: ${checkoutUrl}\n`);
    return false;
  }

  const from = process.env.EMAIL_FROM ?? "noreply@courser.app";

  try {
    await transporter.sendMail({
      from,
      to: email,
      subject: `⏳ Hai lasciato "${productName}" nel carrello?`,
      html: `
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
                      <div style="width:64px;height:64px;border-radius:50%;background:rgba(255,193,7,0.15);border:1px solid rgba(255,193,7,0.3);display:flex;align-items:center;justify-content:center;margin:0 auto;">
                        <span style="font-size:32px;">⏳</span>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td align="center" style="padding-bottom:8px;">
                      <h1 style="color:#ffffff;font-size:24px;font-weight:900;margin:0;letter-spacing:-0.5px;">Non hai completato l&rsquo;acquisto</h1>
                    </td>
                  </tr>
                  <tr>
                    <td align="center" style="padding-bottom:32px;">
                      <p style="color:#a0a0a0;font-size:14px;line-height:1.6;margin:0;">
                        Hai lasciato <strong style="color:#e5e2e1;">"${productName}"</strong> nel carrello.
                        <br/>Il tuo accesso è ancora disponibile — completa l&rsquo;acquisto per sbloccarlo.
                      </p>
                    </td>
                  </tr>
                  <tr>
                    <td align="center" style="padding-bottom:24px;">
                      <a href="${checkoutUrl}" style="display:inline-block;padding:16px 40px;border-radius:16px;background:linear-gradient(135deg,#ffc107,#f59e0b);color:#000000;font-size:14px;font-weight:700;text-decoration:none;box-shadow:0 4px 24px rgba(255,193,7,0.3);">
                        Completa l&rsquo;Acquisto
                      </a>
                    </td>
                  </tr>
                  <tr>
                    <td align="center" style="padding-bottom:24px;">
                      <p style="color:#555;font-size:12px;line-height:1.5;margin:0;">
                        Se hai già completato l&rsquo;acquisto, ignora questa email.
                        <br/>© ${new Date().getFullYear()} Courser
                      </p>
                    </td>
                  </tr>
                  <tr>
                    <td align="center">
                      <div style="height:1px;width:100%;background:rgba(255,255,255,0.05);margin-bottom:16px;"></div>
                      <p style="color:#444;font-size:11px;margin:0;">
                        <span style="color:#f59e0b;">Courser</span> — Piattaforma di corsi digitali multilingua
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
      text: `Hai lasciato "${productName}" nel carrello?\n\nCompleta l'acquisto per sbloccare l'accesso:\n${checkoutUrl}\n\nSe hai già completato l'acquisto, ignora questa email.`,
    });

    console.log(`✅ Email recupero checkout inviata a ${email}`);
    return true;
  } catch (error) {
    console.error(`❌ Errore invio recupero a ${email}:`, error);
    return false;
  }
}

export async function sendPurchaseConfirmation(
  email: string,
  productName: string,
  courseUrl: string
): Promise<boolean> {
  const transporter = getTransporter();

  if (!transporter) {
    console.log(`\n📦 Acquisto confermato per ${email}: ${productName} — ${courseUrl}\n`);
    return false;
  }

  const from = process.env.EMAIL_FROM ?? "noreply@courser.app";

  try {
    await transporter.sendMail({
      from,
      to: email,
      subject: `✅ Acquisto completato — "${productName}"`,
      html: `
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
                      <div style="width:64px;height:64px;border-radius:50%;background:rgba(0,219,231,0.15);border:1px solid rgba(0,219,231,0.3);display:flex;align-items:center;justify-content:center;margin:0 auto;">
                        <span style="font-size:32px;">✅</span>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td align="center" style="padding-bottom:8px;">
                      <h1 style="color:#ffffff;font-size:24px;font-weight:900;margin:0;letter-spacing:-0.5px;">Acquisto Completato!</h1>
                    </td>
                  </tr>
                  <tr>
                    <td align="center" style="padding-bottom:32px;">
                      <p style="color:#a0a0a0;font-size:14px;line-height:1.6;margin:0;">
                        Hai acquistato <strong style="color:#e5e2e1;">"${productName}"</strong>.
                        <br/>Il tuo accesso è già attivo.
                      </p>
                    </td>
                  </tr>
                  <tr>
                    <td align="center" style="padding-bottom:24px;">
                      <a href="${courseUrl}" style="display:inline-block;padding:16px 40px;border-radius:16px;background:linear-gradient(135deg,#4d8eff,#005ac2);color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;box-shadow:0 4px 24px rgba(77,142,255,0.3);">
                        Inizia il Corso
                      </a>
                    </td>
                  </tr>
                  <tr>
                    <td align="center">
                      <p style="color:#555;font-size:12px;line-height:1.5;margin:0;">
                        © ${new Date().getFullYear()} Courser
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
      text: `Acquisto completato!\n\nHai acquistato "${productName}". Il tuo accesso è già attivo.\n\nInizia il corso: ${courseUrl}`,
    });

    console.log(`✅ Email di conferma inviata a ${email}`);
    return true;
  } catch (error) {
    console.error(`❌ Errore invio conferma a ${email}:`, error);
    return false;
  }
}
