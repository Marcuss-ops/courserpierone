import Link from "next/link";
import { Instrument_Serif, Inter } from "next/font/google";

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

export default function HomePage() {
  return (
    <div
      className={`${instrumentSerif.variable} ${inter.variable} min-h-screen bg-white text-black font-sans`}
    >
      <div className="max-w-[720px] mx-auto px-6">
        {/* Header */}
        <header className="flex justify-between items-center py-8">
          <div
            className="font-serif italic text-[28px] leading-none tracking-[-0.2px]"
            style={{ fontFamily: "var(--font-serif), 'Instrument Serif', serif" }}
          >
            courssy
          </div>
          <Link
            href="/login"
            className="text-[15px] font-normal underline underline-offset-4 hover:opacity-60 transition-opacity"
          >
            accedi
          </Link>
        </header>

        <main>
          {/* Hero */}
          <section className="pt-24 pb-30 md:pt-24 md:pb-30 sm:pt-16 sm:pb-20">
            <h1
              className="font-serif italic font-normal text-[clamp(48px,9vw,84px)] leading-[0.95] tracking-[-0.5px] mb-6"
              style={{ fontFamily: "var(--font-serif), 'Instrument Serif', serif" }}
            >
              Crea funnel per corsi online.
            </h1>
            <p className="text-[22px] mb-12 font-light">
              In minuti, non in settimane.
            </p>
            <div className="flex gap-3 flex-wrap sm:flex-col sm:items-stretch">
              <Link
                href="/admin"
                className="inline-block px-7 py-3.5 border border-black text-[16px] font-normal no-underline bg-black text-white hover:bg-white hover:text-black transition-all duration-150"
              >
                Inizia gratis
              </Link>
              <Link
                href="#demo"
                className="inline-block px-7 py-3.5 border border-black text-[16px] font-normal no-underline bg-white text-black hover:bg-black hover:text-white transition-all duration-150"
              >
                Vedi demo
              </Link>
            </div>
          </section>

          {/* Come funziona */}
          <section id="demo" className="my-[140px]">
            <h2
              className="font-serif italic font-normal text-[42px] leading-[1.1] mb-10"
              style={{ fontFamily: "var(--font-serif), 'Instrument Serif', serif" }}
            >
              Come funziona
            </h2>
            <div className="border-t border-black">
              <div className="flex gap-4 sm:gap-4 py-5 sm:py-6 border-b border-black text-[18px] sm:text-[20px] font-light">
                <span className="min-w-[48px] font-normal tabular-nums sm:min-w-[40px]">01 —</span>
                <span>Carica il corso</span>
              </div>
              <div className="flex gap-4 sm:gap-4 py-5 sm:py-6 border-b border-black text-[18px] sm:text-[20px] font-light">
                <span className="min-w-[48px] font-normal tabular-nums sm:min-w-[40px]">02 —</span>
                <span>Costruisci il funnel (pagina, checkout, email)</span>
              </div>
              <div className="flex gap-4 sm:gap-4 py-5 sm:py-6 border-b border-black text-[18px] sm:text-[20px] font-light">
                <span className="min-w-[48px] font-normal tabular-nums sm:min-w-[40px]">03 —</span>
                <span>Vendi. Automaticamente.</span>
              </div>
            </div>
          </section>

          {/* Perché */}
          <section className="my-[140px]">
            <h2
              className="font-serif italic font-normal text-[42px] leading-[1.1] mb-10"
              style={{ fontFamily: "var(--font-serif), 'Instrument Serif', serif" }}
            >
              Perché Courssy
            </h2>
            <ul className="list-none border-t border-black">
              {[
                "Nessun builder complicato",
                "Pagine velocissime",
                "Checkout integrato",
                "Email e automazioni incluse",
                "Analytics essenziali",
              ].map((item) => (
                <li
                  key={item}
                  className="py-[22px] pl-7 border-b border-black text-[19px] relative font-light"
                >
                  <span className="absolute left-0">—</span>
                  {item}
                </li>
              ))}
            </ul>
          </section>

          {/* Pricing */}
          <section className="my-[140px]">
            <h2
              className="font-serif italic font-normal text-[42px] leading-[1.1] mb-10"
              style={{ fontFamily: "var(--font-serif), 'Instrument Serif', serif" }}
            >
              Pricing
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 border border-black border-b-none">
              <div className="p-9 border-b border-r sm:border-r-0 border-black">
                <div
                  className="font-serif italic text-[34px] mb-1 leading-none"
                  style={{ fontFamily: "var(--font-serif), 'Instrument Serif', serif" }}
                >
                  Starter
                </div>
                <div className="text-[17px] mb-7 font-normal">€0 /mese</div>
                <ul className="list-none space-y-1.5 text-[15px] leading-[1.7]">
                  {["1 funnel", "100 studenti", "branding Courssy"].map((f) => (
                    <li key={f}>
                      <span className="mr-1">— </span>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="p-9 border-b border-black sm:border-l border-black">
                <div
                  className="font-serif italic text-[34px] mb-1 leading-none"
                  style={{ fontFamily: "var(--font-serif), 'Instrument Serif', serif" }}
                >
                  Pro
                </div>
                <div className="text-[17px] mb-7 font-normal">€29 /mese</div>
                <ul className="list-none space-y-1.5 text-[15px] leading-[1.7]">
                  {["funnel illimitati", "dominio personalizzato", "zero commissioni"].map((f) => (
                    <li key={f}>
                      <span className="mr-1">— </span>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          {/* CTA */}
          <section className="py-[100px] text-center border-t border-b border-black mb-0">
            <h2
              className="font-serif italic font-normal text-[clamp(44px,8vw,64px)] leading-[1] mb-9"
              style={{ fontFamily: "var(--font-serif), 'Instrument Serif', serif" }}
            >
              Pronto?
            </h2>
            <Link
              href="/admin"
              className="inline-block px-7 py-3.5 border border-black text-[16px] font-normal no-underline bg-black text-white hover:bg-white hover:text-black transition-all duration-150"
            >
              Crea il tuo primo funnel
            </Link>
          </section>
        </main>

        {/* Footer */}
        <footer className="py-10 pb-20 flex sm:flex-col sm:items-start justify-between items-center text-[14px] font-light gap-3 sm:gap-3 flex-wrap">
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