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
  title: "Termini di Servizio",
  description: "Termini e condizioni per l'utilizzo di Courssy",
};

export default function TermsPage() {
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
              Termini di Servizio
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
                  1. Accettazione
                </h2>
                <p>
                  Accedendo o utilizzando Courssy ("il servizio", "piattaforma"), accetti di essere vincolato da questi Termini di Servizio ("Termini"). Se non accetti questi Termini, non utilizzare il servizio.
                </p>
                <p>
                  Utilizzando il servizio dichiari di avere almeno 18 anni e la capacità legale di stipulare contratti.
                </p>
              </div>

              <div className="space-y-8">
                <h2
                  className="font-serif italic text-[28px] leading-none pt-4"
                  style={{ fontFamily: "var(--font-serif), 'Instrument Serif', serif" }}
                >
                  2. Descrizione del servizio
                </h2>
                <p>
                  Courssy è una piattaforma che permette di creare e gestire funnel di vendita per corsi digitali. I servizi includono:
                </p>
                <ul className="list-none space-y-3 border-t border-black pt-6">
                  <li className="pl-6 relative before:absolute before:left-0 before:top-2">—
                    Creazione di pagine di vendita e landing page
                  </li>
                  <li className="pl-6 relative before:absolute before:left-0 before:top-2">—
                    Gestione di checkout e pagamenti
                  </li>
                  <li className="pl-6 relative before:absolute before:left-0 before:top-2">—
                    Distribuzione di contenuti digitali
                  </li>
                  <li className="pl-6 relative before:absolute before:left-0 before:top-2">—
                    Strumenti di analisi e tracciamento
                  </li>
                </ul>
              </div>

              <div className="space-y-8">
                <h2
                  className="font-serif italic text-[28px] leading-none pt-4"
                  style={{ fontFamily: "var(--font-serif), 'Instrument Serif', serif" }}
                >
                  3. Account e accesso
                </h2>
                <ul className="list-none space-y-3 border-t border-black pt-6">
                  <li className="pl-6 relative before:absolute before:left-0 before:top-2">—
                    Sei responsabile della riservatezza delle tue credenziali
                  </li>
                  <li className="pl-6 relative before:absolute before:left-0 before:top-2">—
                    Devi notificare immediatamente qualsiasi uso non autorizzato
                  </li>
                  <li className="pl-6 relative before:absolute before:left-0 before:top-2">—
                    Non puoi condividere l&apos;account con terze parti
                  </li>
                  <li className="pl-6 relative before:absolute before:left-0 before:top-2">—
                    Possiamo sospendere o chiudere account che violano questi Termini
                  </li>
                </ul>
              </div>

              <div className="space-y-8">
                <h2
                  className="font-serif italic text-[28px] leading-none pt-4"
                  style={{ fontFamily: "var(--font-serif), 'Instrument Serif', serif" }}
                >
                  4. Piani e pagamento
                </h2>
                <p>
                  <strong>Piano Starter:</strong> gratuito, 1 funnel, 100 studenti, branding Courssy visibile.
                </p>
                <p>
                  <strong>Piano Pro:</strong> €29/mese, funnels illimitati, dominio personalizzato, zero commissioni su transazioni.
                </p>
                <p className="pt-4">
                  I pagamenti sono gestiti da Stripe. Non siamo responsabili per problemi di pagamento dovuti a Stripe. Le fatture vengono emesse automaticamente e sono accessibili dal tuo account.
                </p>
                <p className="pt-4">
                  Puoi cancellare l&apos;abbonamento in qualsiasi momento. Nessun rimborso per periodi già pagati.
                </p>
              </div>

              <div className="space-y-8">
                <h2
                  className="font-serif italic text-[28px] leading-none pt-4"
                  style={{ fontFamily: "var(--font-serif), 'Instrument Serif', serif" }}
                >
                  5. Contenuti del cliente
                </h2>
                <p>
                  I contenuti che carichi sulla piattaforma (corsi, testi, immagini) restano di tua proprietà. Ci concedi una licenza per utilizzarli per fornire il servizio.
                </p>
                <p className="pt-4">
                  Garantisci di avere tutti i diritti sui contenuti caricati e che non violano diritti di terzi.
                </p>
                <p className="pt-4">
                  Non siamo responsabili per contenuti che violano diritti di proprietà intellettuale di terzi.
                </p>
              </div>

              <div className="space-y-8">
                <h2
                  className="font-serif italic text-[28px] leading-none pt-4"
                  style={{ fontFamily: "var(--font-serif), 'Instrument Serif', serif" }}
                >
                  6. Uso accettabile
                </h2>
                <p>Non puoi utilizzare il servizio per:</p>
                <ul className="list-none space-y-3 border-t border-black pt-6">
                  <li className="pl-6 relative before:absolute before:left-0 before:top-2">—
                    Attività illegali o che violano diritti di terzi
                  </li>
                  <li className="pl-6 relative before:absolute before:left-0 before:top-2">—
                    Contenuti fraudolenti, ingannevoli o di spam
                  </li>
                  <li className="pl-6 relative before:absolute before:left-0 before:top-2">—
                    Violazione di leggi su copyright, marchi, privacy
                  </li>
                  <li className="pl-6 relative before:absolute before:left-0 before:top-2">—
                    Accesso non autorizzato a sistemi terzi
                  </li>
                  <li className="pl-6 relative before:absolute before:left-0 before:top-2">—
                    Interferenza con il funzionamento del servizio
                  </li>
                </ul>
              </div>

              <div className="space-y-8">
                <h2
                  className="font-serif italic text-[28px] leading-none pt-4"
                  style={{ fontFamily: "var(--font-serif), 'Instrument Serif', serif" }}
                >
                  7. Limitazione di responsabilità
                </h2>
                <p>
                  Il servizio è fornito "così com'è". Non garantiamo che il servizio sarà sempre disponibile, privo di errori o che funzionerà senza interruzioni.
                </p>
                <p className="pt-4">
                  Non saremo responsabili per danni indiretti, consequenziali, speciali o punitivi, inclusi ma non limitati a perdita di profitti, dati o opportunità di business.
                </p>
                <p className="pt-4">
                  La nostra responsabilità massima è limitata all&apos;importo che hai pagato negli ultimi 12 mesi.
                </p>
              </div>

              <div className="space-y-8">
                <h2
                  className="font-serif italic text-[28px] leading-none pt-4"
                  style={{ fontFamily: "var(--font-serif), 'Instrument Serif', serif" }}
                >
                  8. Proprietà intellettuale
                </h2>
                <p>
                  Courssy e il suo design, logo, interfaccia sono di nostra proprietà e protetti da copyright e altri diritti di proprietà intellettuale.
                </p>
                <p className="pt-4">
                  Non puoi copiare, replicare o creare opere derivate dal servizio senza il nostro consenso.
                </p>
              </div>

              <div className="space-y-8">
                <h2
                  className="font-serif italic text-[28px] leading-none pt-4"
                  style={{ fontFamily: "var(--font-serif), 'Instrument Serif', serif" }}
                >
                  9. Risoluzione
                </h2>
                <p>
                  Possiamo sospendere o terminare il servizio in qualsiasi momento, con o senza preavviso, per violazione di questi Termini o per motivi di sicurezza.
                </p>
                <p className="pt-4">
                  In caso di terminazione, il tuo account verrà disattivato e i contenuti eliminati entro 30 giorni.
                </p>
              </div>

              <div className="space-y-8">
                <h2
                  className="font-serif italic text-[28px] leading-none pt-4"
                  style={{ fontFamily: "var(--font-serif), 'Instrument Serif', serif" }}
                >
                  10. Modifiche ai Termini
                </h2>
                <p>
                  Possiamo modificare questi Termini periodicamente. Le modifiche significative ti verranno notificate via email o con un avviso sulla piattaforma.
                </p>
                <p className="pt-4">
                  L&apos;uso continuato del servizio dopo le modifiche costituisce accettazione dei nuovi Termini.
                </p>
              </div>

              <div className="space-y-8">
                <h2
                  className="font-serif italic text-[28px] leading-none pt-4"
                  style={{ fontFamily: "var(--font-serif), 'Instrument Serif', serif" }}
                >
                  11. Legge applicabile
                </h2>
                <p>
                  Questi Termini sono regolati dalla legge italiana. Per qualsiasi controversia, il foro competente è il Tribunale di Roma.
                </p>
              </div>

              <div className="pt-8 border-t border-black">
                <p className="text-[15px] text-gray-600">
                  Per domande su questi termini, contattaci a <a href="mailto:legal@courssy.com" className="underline underline-offset-2">legal@courssy.com</a>.
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