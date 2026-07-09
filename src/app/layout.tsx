import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Playfair_Display, Inter } from "next/font/google";
import { Footer } from "@/components/footer";
import "./globals.css";

// ═══ Environment variable validation ═════════════════════
// Il semplice import esegue la validazione all'avvio.
// I warning/error vengono stampati su console.
import "@/lib/env";

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Courssy",
    template: "%s | Courssy",
  },
  description: "Generatore automatico di Funnel e Aree Corsi multilingua",
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: "Courssy",
    description: "Generatore automatico di Funnel e Aree Corsi multilingua",
    type: "website",
    siteName: "Courssy",
    locale: "it_IT",
  },
  twitter: {
    card: "summary_large_image",
    title: "Courssy",
    description: "Generatore automatico di Funnel e Aree Corsi multilingua",
  },
  icons: {
    icon: "/icon.png",
    shortcut: "/icon.png",
  },
  manifest: "/manifest.json",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Legge la lingua dal cookie impostato dal middleware (fallback "it")
  let locale = "it";
  try {
    const cookieStore = await cookies();
    locale = cookieStore.get("locale")?.value ?? "it";
  } catch {
    // cookies() può fallire in build statica
  }

  return (
    <html lang={locale} className={`${playfair.variable} ${inter.variable}`}>
      <body className="bg-white text-gray-900 antialiased min-h-screen flex flex-col">
        <div className="flex-1 flex flex-col">{children}</div>
        <Footer />
        {/* PWA Service Worker registration */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js').catch(function(err) {
                    console.warn('[PWA] SW registration failed:', err);
                  });
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
