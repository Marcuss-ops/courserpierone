import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service — TikShare",
  description: "Termini di servizio per TikShare, l'app di upload video per TikTok.",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen" style={{ background: "#080808", fontFamily: "'Manrope', sans-serif" }}>
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-[#1a1a1a] bg-black/80 backdrop-blur-xl">
        <div className="mx-auto max-w-3xl flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#25F4EE] via-[#FE2C55] to-black flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-white">
                <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15.2a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.77a8.19 8.19 0 0 0 4.77 1.52V6.79a4.85 4.85 0 0 1-1-.1z"/>
              </svg>
            </div>
            <span className="font-bold text-white">TikShare</span>
          </div>
          <Link href="/" className="text-sm text-gray-400 hover:text-white transition">← Back</Link>
        </div>
      </nav>

      <div className="pt-28 px-6 pb-20">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-4xl font-extrabold text-white mb-2">Terms of Service</h1>
          <p className="text-sm text-gray-500 mb-10">uploader.courssy.com · Last updated: {new Date().toLocaleDateString("it-IT", { year: "numeric", month: "long", day: "numeric" })}</p>

          <div className="space-y-8 text-gray-400 text-sm leading-relaxed">

            <section>
              <h2 className="text-lg font-bold text-white mb-3">1. Premessa</h2>
              <p>Benvenuto in TikShare ("il Servizio"), un&apos;applicazione web che permette agli utenti di caricare video sul proprio account TikTok tramite le API ufficiali di TikTok (TikTok Login Kit e Content Posting API).</p>
              <p className="mt-2">Utilizzando il Servizio, accetti di essere vincolato dai presenti Termini di Servizio ("Termini"). Se non accetti questi Termini, non utilizzare il Servizio.</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-white mb-3">2. Descrizione del Servizio</h2>
              <p>TikShare agisce come interfaccia tra te e le API di TikTok. Il Servizio ti permette di:</p>
              <ul className="mt-2 space-y-1 list-disc list-inside">
                <li>Autenticarti con il tuo account TikTok tramite OAuth 2.0 (TikTok Login Kit)</li>
                <li>Caricare video sul tuo account TikTok come bozza (TikTok Content Posting API)</li>
                <li>Gestire le impostazioni di privacy, commenti, Duet e condivisione per ogni video</li>
              </ul>
              <p className="mt-2">TikShare non è affiliato, sponsorizzato o endorsed da TikTok, Inc.</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-white mb-3">3. Account e Autenticazione</h2>
              <p>L&apos;autenticazione avviene esclusivamente tramite TikTok Login Kit. TikShare non archivia password TikTok. Il token di accesso viene memorizzato in un cookie httpOnly sul dispositivo dell&apos;utente e può essere revocato in qualsiasi momento.</p>
              <p className="mt-2">L&apos;utente è responsabile di mantenere la sicurezza del proprio account TikTok e di tutte le attività che avvengono tramite il proprio account.</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-white mb-3">4. Contenuti caricati</h2>
              <p>L&apos;utente è l&apos;unico responsabile dei contenuti caricati tramite TikShare. Caricando contenuti su TikTok, l&apos;utente conferma di:</p>
              <ul className="mt-2 space-y-1 list-disc list-inside">
                <li>Essere il proprietario o avere i diritti necessari per caricare detto contenuto</li>
                <li>Rispettare le <a href="https://www.tiktok.com/community-guidelines" target="_blank" rel="noopener" className="text-[#25F4EE] hover:underline">Community Guidelines di TikTok</a></li>
                <li>Rispettare la <a href="https://www.tiktok.com/music-usage-confirmation" target="_blank" rel="noopener" className="text-[#25F4EE] hover:underline">Music Usage Confirmation</a> di TikTok per contenuti con musica</li>
                <li>Non violare diritti di terze parti, incluse copyright, marchi e privacy</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-bold text-white mb-3">5. Limitazioni d&apos;uso</h2>
              <p>È vietato utilizzare TikShare per:</p>
              <ul className="mt-2 space-y-1 list-disc list-inside">
                <li>Caricare contenuti che violano le Community Guidelines di TikTok</li>
                <li>Caricare contenuti protetti da copyright senza diritti validi</li>
                <li>Spam, engagement fraudolento o manipolazione di metriche TikTok</li>
                <li>Attività illegali o che violano diritti di terze parti</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-bold text-white mb-3">6. Limitazione di Responsabilità</h2>
              <p>TikShare è fornito "così com&apos;è". Non garantiamo che il Servizio sarà sempre disponibile, privo di errori o che soddisferà le tue esigenze specifiche.</p>
              <p className="mt-2">TikShare non è responsabile per azioni intraprese da TikTok Inc. relative al tuo account, incluse sospensioni, rimozioni di contenuti o modifiche alle API.</p>
              <p className="mt-2">In nessun caso TikShare sarà responsabile per danni diretti, indiretti, incidentali, speciali o consequenziali derivanti dall&apos;uso del Servizio.</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-white mb-3">7. Modifiche ai Termini</h2>
              <p>Ci riserviamo il diritto di modificare questi Termini in qualsiasi momento. Le modifiche saranno pubblicate su questa pagina con un aggiornamento della data "Last updated". L&apos;uso continuato del Servizio dopo le modifiche costituisce accettazione dei nuovi Termini.</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-white mb-3">8. Legge applicabile</h2>
              <p>Questi Termini sono regolati dalla legge italiana. Per qualsiasi controversia, il foro competente è quello di Milano, Italia.</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-white mb-3">9. Contatti</h2>
              <p>Per domande su questi Termini, contattaci a:</p>
              <p className="mt-2 text-[#25F4EE]">info@courssy.com</p>
            </section>

          </div>
        </div>
      </div>
    </div>
  );
}