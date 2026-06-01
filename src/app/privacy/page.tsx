import Link from "next/link";
import { Instrument_Serif, Inter } from "next/font/google";
import { Metadata } from "next";

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: ["400"],
  style: ["italic", "normal"],
  variable: "--font-serif",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Informativa sulla privacy per Courssy",
};

export default function PrivacyPage() {
  return (
    <div
      className={`${instrumentSerif.variable} ${inter.variable} min-h-screen bg-white text-black font-sans`}
    >
      <div className="max-w-[720px] mx-auto px-6">
        {/* Header */}
        <header className="flex justify-between items-center py-8">
          <Link
            href="/"
            className="font-serif italic text-[28px] leading-none tracking-[-0.2px] text-black no-underline hover:opacity-60 transition-opacity"
            style={{ fontFamily: "var(--font-serif), 'Instrument Serif', serif" }}
          >
            courssy
          </Link>
          <Link
            href="/"
            className="text-[15px] font-normal underline underline-offset-4 hover:opacity-60 transition-opacity"
          >
            ← back
          </Link>
        </header>

        <main>
          <section className="pt-16 pb-24">
            <h1
              className="font-serif italic font-normal text-[clamp(40px,7vw,64px)] leading-[1] tracking-[-0.5px] mb-16"
              style={{ fontFamily: "var(--font-serif), 'Instrument Serif', serif" }}
            >
              Privacy Policy
            </h1>

            <div className="space-y-12 text-[17px] font-light leading-[1.75]">
              <p className="text-[22px]">
                Ultimo aggiornamento: 1 gennaio 2026
              </p>

              <div className="space-y-8">
                <h2
                  className="font-serif italic text-[28px] leading-none pt-4"
                  style={{ fontFamily: "var(--font-serif), 'Instrument Serif', serif" }}
                >
                  1. Titolare del trattamento
                </h2>
                <p>
                  Courssy ("noi", "nostro" o "titolare") è responsabile del trattamento dei tuoi dati personali in conformità con il Regolamento Generale sulla Protezione dei Dati (GDPR).
                </p>
                <p>
                  <strong>Titolare:</strong> Courssy S.r.l.<br />
                  <strong>Indirizzo:</strong> Via Roma 123, 00100 Roma, Italia<br />
                  <strong>Email:</strong> privacy@courssy.com
                </p>
              </div>

              <div className="space-y-8">
                <h2
                  className="font-serif italic text-[28px] leading-none pt-4"
                  style={{ fontFamily: "var(--font-serif), 'Instrument Serif', serif" }}
                >
                  2. Dati raccolti
                </h2>
                <p>Raccogliamo le seguenti categorie di dati:</p>
                <ul className="list-none space-y-3 border-t border-black pt-6">
                  <li className="pl-6 relative before:absolute before:left-0 before:top-2">—
                    <strong>Dati di account:</strong> nome, email, password crittografata
                  </li>
                  <li className="pl-6 relative before:absolute before:left-0 before:top-2">—
                    <strong>Dati di pagamento:</strong> elaborati da Stripe, non memorizzati da noi
                  </li>
                  <li className="pl-6 relative before:absolute before:left-0 before:top-2">—
                    <strong>Dati di utilizzo:</strong> pagine visitate, azioni, timestamp
                  </li>
                  <li className="pl-6 relative before:absolute before:left-0 before:top-2">—
                    <strong>Cookie:</strong> identificatori anonimi per funzionalità e analytics
                  </li>
                </ul>
              </div>

              <div className="space-y-8">
                <h2
                  className="font-serif italic text-[28px] leading-none pt-4"
                  style={{ fontFamily: "var(--font-serif), 'Instrument Serif', serif" }}
                >
                  3. Finalità del trattamento
                </h2>
                <p>Utilizziamo i tuoi dati per:</p>
                <ul className="list-none space-y-3 border-t border-black pt-6">
                  <li className="pl-6 relative before:absolute before:left-0 before:top-2">—
                    Fornirti l&apos;accesso alla piattaforma e ai tuoi corsi
                  </li>
                  <li className="pl-6 relative before:absolute before:left-0 before:top-2">—
                    Elaborare pagamenti e rilasciare ricevute
                  </li>
                  <li className="pl-6 relative before:absolute before:left-0 before:top-2">—
                    Inviarti email transazionali (conferme, recovery)
                  </li>
                  <li className="pl-6 relative before:absolute before:left-0 before:top-2">—
                    Migliorare la piattaforma e l&apos;esperienza utente
                  </li>
                  <li className="pl-6 relative before:absolute before:left-0 before:top-2">—
                    Adempiere obblighi legali e fiscali
                  </li>
                </ul>
              </div>

              <div className="space-y-8">
                <h2
                  className="font-serif italic text-[28px] leading-none pt-4"
                  style={{ fontFamily: "var(--font-serif), 'Instrument Serif', serif" }}
                >
                  4. Base giuridica
                </h2>
                <p>Il trattamento avviene sulla base di:</p>
                <ul className="list-none space-y-3 border-t border-black pt-6">
                  <li className="pl-6 relative before:absolute before:left-0 before:top-2">—
                    <strong>Esecuzione del contratto</strong> (art. 6.1.b GDPR) — per fornire i servizi richiesti
                  </li>
                  <li className="pl-6 relative before:absolute before:left-0 before:top-2">—
                    <strong>Consenso</strong> (art. 6.1.a GDPR) — per email marketing (sempre revocabile)
                  </li>
                  <li className="pl-6 relative before:absolute before:left-0 before:top-2">—
                    <strong>Legittimo interesse</strong> (art. 6.1.f GDPR) — per analytics e sicurezza
                  </li>
                  <li className="pl-6 relative before:absolute before:left-0 before:top-2">—
                    <strong>Obbligo legale</strong> (art. 6.1.c GDPR) — per conservazione contabile
                  </li>
                </ul>
              </div>

              <div className="space-y-8">
                <h2
                  className="font-serif italic text-[28px] leading-none pt-4"
                  style={{ fontFamily: "var(--font-serif), 'Instrument Serif', serif" }}
                >
                  5. Conservazione dei dati
                </h2>
                <p>
                  Conserviamo i tuoi dati per il tempo necessario alle finalità indicate. I dati di account vengono eliminati entro 30 giorni dalla richiesta di cancellazione. I dati di fatturazione vengono conservati per 10 anni per obblighi fiscali.
                </p>
              </div>

              <div className="space-y-8">
                <h2
                  className="font-serif italic text-[28px] leading-none pt-4"
                  style={{ fontFamily: "var(--font-serif), 'Instrument Serif', serif" }}
                >
                  6. I tuoi diritti
                </h2>
                <p>Hai il diritto di:</p>
                <ul className="list-none space-y-3 border-t border-black pt-6">
                  <li className="pl-6 relative before:absolute before:left-0 before:top-2">—
                    Accedere ai tuoi dati personali
                  </li>
                  <li className="pl-6 relative before:absolute before:left-0 before:top-2">—
                    Correggere dati inesatti
                  </li>
                  <li className="pl-6 relative before:absolute before:left-0 before:top-2">—
                    Richiedere la cancellazione ("diritto all'oblio")
                  </li>
                  <li className="pl-6 relative before:absolute before:left-0 before:top-2">—
                    Limitare o opporti al trattamento
                  </li>
                  <li className="pl-6 relative before:absolute before:left-0 before:top-2">—
                    Ricevere i tuoi dati in formato portabile
                  </li>
                  <li className="pl-6 relative before:absolute before:left-0 before:top-2">—
                    Revocare il consenso in qualsiasi momento
                  </li>
                </ul>
                <p className="pt-4">
                  Per esercitare i tuoi diritti, scrivi a <a href="mailto:privacy@courssy.com" className="underline underline-offset-2">privacy@courssy.com</a>.
                </p>
              </div>

              <div className="space-y-8">
                <h2
                  className="font-serif italic text-[28px] leading-none pt-4"
                  style={{ fontFamily: "var(--font-serif), 'Instrument Serif', serif" }}
                >
                  7. Cookie
                </h2>
                <p>
                  Utilizziamo cookie essenziali (necessari per il funzionamento) e cookie analitici (per capire come usi la piattaforma). Puoi gestire le preferenze cookie dalle impostazioni del tuo account.
                </p>
                <p>
                  Cookie di terze parti: <strong>Stripe</strong> (pagamenti), <strong>Vercel</strong> (hosting).
                </p>
              </div>

              <div className="space-y-8">
                <h2
                  className="font-serif italic text-[28px] leading-none pt-4"
                  style={{ fontFamily: "var(--font-serif), 'Instrument Serif', serif" }}
                >
                  8. Modifiche
                </h2>
                <p>
                  Questa informativa può essere aggiornata periodicamente. Le modifiche significative ti verranno notificate via email. Ti consigliamo di rivedere questa pagina regolarmente.
                </p>
              </div>

              <div className="pt-8 border-t border-black">
                <p className="text-[15px] text-gray-600">
                  Per domande su questa privacy policy, contattaci a <a href="mailto:privacy@courssy.com" className="underline underline-offset-2">privacy@courssy.com</a>.
                </p>
              </div>
            </div>
          </section>
        </main>

        {/* Footer */}
        <footer className="py-10 pb-20 flex sm:flex-col sm:items-start justify-between items-center text-[14px] font-light gap-3 sm:gap-3 flex-wrap border-t border-black">
          <div>© 2026 Courssy</div>
          <div className="flex gap-5">
            <Link href="/privacy" className="hover:underline underline-offset-3 no-underline hover:no-underline">
              privacy
            </Link>
            <Link href="/terms" className="hover:underline underline-offset-3 no-underline hover:no-underline">
              termini
            </Link>
          </div>
        </footer>
      </div>
    </div>
  );
}