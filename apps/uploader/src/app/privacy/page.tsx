import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — TikShare",
  description: "Informativa sulla privacy per TikShare, in conformità al GDPR.",
};

export default function PrivacyPage() {
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
          <h1 className="text-4xl font-extrabold text-white mb-2">Privacy Policy</h1>
          <p className="text-sm text-gray-500 mb-10">uploader.courssy.com · Last updated: {new Date().toLocaleDateString("it-IT", { year: "numeric", month: "long", day: "numeric" })}</p>

          <div className="space-y-8 text-gray-400 text-sm leading-relaxed">

            <section>
              <h2 className="text-lg font-bold text-white mb-3">1. Titolare del trattamento</h2>
              <p>Il titolare del trattamento dei dati personali è:</p>
              <div className="mt-3 rounded-xl border border-[#222] p-4" style={{ background: "#0a0a0a" }}>
                <p className="font-semibold text-white">Courssy</p>
                <p>Email: <span className="text-[#25F4EE]">info@courssy.com</span></p>
                <p>Sito: <span className="text-[#25F4EE]">uploader.courssy.com</span></p>
              </div>
              <p className="mt-3">Per ogni domanda sul trattamento dei tuoi dati personali, contattaci a info@courssy.com.</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-white mb-3">2. Dati raccolti da TikTok</h2>
              <p>Quando utilizzi TikShare con il tuo account TikTok, TikShare riceve da TikTok i seguenti dati, secondo i scope OAuth che hai autorizzato:</p>
              <table className="mt-3 w-full rounded-xl border border-[#222] overflow-hidden text-xs">
                <thead>
                  <tr style={{ background: "#111" }}>
                    <th className="px-4 py-3 text-left text-gray-400 font-medium">Dato</th>
                    <th className="px-4 py-3 text-left text-gray-400 font-medium">Scope TikTok</th>
                    <th className="px-4 py-3 text-left text-gray-400 font-medium">Finalità</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#222]">
                  {[
                    ["Open ID (identificativo)", "user.info.basic", "Identificazione univoca dell'account"],
                    ["Nome visualizzato / Username", "user.info.basic", "Mostrare il tuo nome nel profilo"],
                    ["URL avatar", "user.info.basic", "Mostrare la tua foto profilo"],
                    ["Bio / Descrizione profilo", "user.info.profile", "Mostrare info aggiuntive del profilo"],
                    ["Upload video (Bozza)", "video.upload", "Inizializzare e caricare video su TikTok"],
                  ].map(([dato, scope, fine]) => (
                    <tr key={dato}>
                      <td className="px-4 py-3 text-white">{dato}</td>
                      <td className="px-4 py-3 text-[#25F4EE] font-mono">{scope}</td>
                      <td className="px-4 py-3 text-gray-500">{fine}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3">Non raccogliamo, archiviamo o trattiamo dati TikTok al di fuori del token di sessione necessario per l&apos;upload video. I video caricati sono inviati direttamente alle API di TikTok Inc. — non vengono mai archiviati o trattenuti da TikShare. I dati del profilo non sono salvati su database — esistono solo durante la sessione attiva.</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-white mb-3">3. Base giuridica del trattamento (GDPR)</h2>
              <p>Il trattamento dei dati TikTok in TikShare si basa sul:</p>
              <div className="mt-3 rounded-xl border border-[#25F4EE]/30 bg-[#25F4EE]/5 p-4">
                <p className="font-semibold text-[#25F4EE]">Art. 6(1)(b) GDPR — Esecuzione di un contratto</p>
                <p className="mt-1 text-gray-400 text-xs">L&apos;utente richiede esplicitamente di caricare video sul proprio account TikTok. Il trattamento è necessario per adempiere a questa richiesta.</p>
              </div>
              <p className="mt-3">Per i dati del profilo (bio), il trattamento si basa sul consenso esplicito (Art. 6(1)(a) GDPR) fornito durante il flusso OAuth di TikTok.</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-white mb-3">4. Memorizzazione e sicurezza</h2>
              <ul className="mt-2 space-y-2 list-disc list-inside">
                <li><strong className="text-white">Token di accesso:</strong> Memorizzato in un cookie httpOnly con flag secure e sameSite=lax. Il cookie è limitato al dominio uploader.courssy.com e ha una scadenza pari al token TikTok (max 24h).</li>
                <li><strong className="text-white">Nessun database:</strong> TikShare non utilizza database per memorizzare dati TikTok. I dati del profilo non sono salvati in modo persistente.</li>
                <li><strong className="text-white">Infrastruttura:</strong> L&apos;app è ospitata su Vercel (infrastruttura EU/US) con connessioni HTTPS obbligatorie.</li>
                <li><strong className="text-white">Crittografia:</strong> Tutte le comunicazioni tra il browser e i server sono crittografate con TLS 1.2+.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-bold text-white mb-3">5. Condivisione con terze parti</h2>
              <p>TikShare non condivide, vende, noleggia o trasferisce in altro modo i dati TikTok degli utenti a terze parti.</p>
              <p className="mt-2">I dati sono condivisi con TikTok Inc. esclusivamente per i seguenti scopi:</p>
              <ul className="mt-2 space-y-1 list-disc list-inside">
                <li>Autenticazione OAuth (TikTok Login Kit)</li>
                <li>Caricamento video (TikTok Content Posting API)</li>
              </ul>
              <p className="mt-2">Per il trattamento dei dati da parte di TikTok Inc., consulta la <a href="https://www.tiktok.com/legal/privacy-policy" target="_blank" rel="noopener" className="text-[#25F4EE] hover:underline">Privacy Policy di TikTok</a>.</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-white mb-3">6. Diritti dell&apos;interessato (GDPR)</h2>
              <p>L&apos;utente ha i seguenti diritti sui propri dati personali:</p>
              <ul className="mt-2 space-y-1 list-disc list-inside">
                <li><strong>Diritto di accesso (Art. 15):</strong> Richiedere una copia dei dati che TikShare ha ricevuto da TikTok per il tuo account</li>
                <li><strong>Diritto alla cancellazione (Art. 17):</strong> Revocare il consenso e richiedere la rimozione dei dati — revoke l&apos;accesso TikTok dalle impostazioni del tuo account TikTok</li>
                <li><strong>Diritto di revoca del consenso:</strong> Revocare l&apos;accesso a TikShare in qualsiasi momento dalle impostazioni del proprio account TikTok su tiktok.com</li>
                <li><strong>Diritto alla portabilità (Art. 20):</strong> Ricevere i tuoi dati in formato strutturato e leggibile</li>
              </ul>
              <p className="mt-3">Per esercitare i tuoi diritti, contattaci a <span className="text-[#25F4EE]">info@courssy.com</span>.</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-white mb-3">7. Upload video e dati del contenuto</h2>
              <p>I video caricati tramite TikShare sono inviati direttamente alle API di TikTok Inc. TikShare non archivia, copia o trattiene i video caricati. I video sono trattati da TikTok Inc. secondo la loro <a href="https://www.tiktok.com/legal/privacy-policy" target="_blank" rel="noopener" className="text-[#25F4EE] hover:underline">Privacy Policy</a>.</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-white mb-3">8. Cookie policy</h2>
              <p>TikShare utilizza i seguenti cookie:</p>
              <table className="mt-3 w-full rounded-xl border border-[#222] overflow-hidden text-xs">
                <thead>
                  <tr style={{ background: "#111" }}>
                    <th className="px-4 py-3 text-left text-gray-400 font-medium">Nome</th>
                    <th className="px-4 py-3 text-left text-gray-400 font-medium">Tipo</th>
                    <th className="px-4 py-3 text-left text-gray-400 font-medium">Durata</th>
                    <th className="px-4 py-3 text-left text-gray-400 font-medium">Scopo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#222]">
                  {[
                    ["tiktok_access_token", "httpOnly, secure", "Sessione (max 24h)", "Autenticazione OAuth TikTok"],
                    ["tiktok_open_id", "httpOnly, secure", "Sessione (max 24h)", "Identificativo univoco TikTok"],
                  ].map(([name, type, duration, purpose]) => (
                    <tr key={name}>
                      <td className="px-4 py-3 text-white font-mono">{name}</td>
                      <td className="px-4 py-3 text-gray-500">{type}</td>
                      <td className="px-4 py-3 text-gray-500">{duration}</td>
                      <td className="px-4 py-3 text-gray-500">{purpose}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3">Non utilizziamo cookie di profilazione, marketing o analisi di terze parti.</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-white mb-3">9. Conservazione dei dati</h2>
              <ul className="mt-2 space-y-1 list-disc list-inside">
                <li><strong className="text-white">Token di accesso:</strong> Eliminato automaticamente alla scadenza (max 24h) o alla disconnessione</li>
                <li><strong className="text-white">Dati del profilo:</strong> Non memorizzati in modo persistente — esistono solo durante la sessione attiva</li>
                <li><strong className="text-white">Log di sistema:</strong> I log del server sono conservati per max 30 giorni per motivi di sicurezza</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-bold text-white mb-3">10. Modifiche alla Privacy Policy</h2>
              <p>Ci riserviamo il diritto di modificare questa Privacy Policy in qualsiasi momento. Le modifiche saranno pubblicate su questa pagina. Ti informeremo di modifiche significative tramite un avviso visibile al primo accesso successivo alla modifica.</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-white mb-3">11. Reclami</h2>
              <p>Hai il diritto di presentare un reclamo al Garante per la Protezione dei Dati Personali (www.garanteprivacy.it) se ritieni che il trattamento dei tuoi dati violi il GDPR.</p>
            </section>

          </div>
        </div>
      </div>
    </div>
  );
}