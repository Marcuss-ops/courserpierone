import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Playfair_Display, Inter } from "next/font/google";
import { Footer } from "@/components/footer";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { getSeoMetadata, SEO_LOCALES } from "@/lib/i18n/seo-metadata";
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

/**
 * Dynamic metadata generation — localized per visitor language.
 *
 * Reads the `locale` cookie set by middleware.ts (IT/EN/FR/ES/DE/PT...)
 * and returns the corresponding title, description, and Open Graph tags.
 */
export async function generateMetadata(): Promise<Metadata> {
  let langCode = "en";
  try {
    const cookieStore = await cookies();
    langCode = cookieStore.get("locale")?.value ?? "en";
  } catch {
    // cookies() può fallire in build statica
  }

  const seo = getSeoMetadata(langCode);

  return {
    title: {
      default: seo.title,
      template: "%s | Courssy",
    },
    description: seo.description,
    robots: { index: true, follow: true },
    openGraph: {
      title: seo.ogTitle,
      description: seo.ogDescription,
      type: "website",
      siteName: "Courssy",
      locale: langCode.replace("-", "_"),
    },
    twitter: {
      card: "summary_large_image",
      title: seo.ogTitle,
      description: seo.ogDescription,
    },
    alternates: {
      languages: Object.fromEntries(
        SEO_LOCALES.map((code) => [
          `${code}-${code.toUpperCase()}`,
          `/${code}`,
        ])
      ),
    },
    manifest: "/manifest.json",
  };
}

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
    // `suppressHydrationWarning` allows next-themes to inject `class="dark"`
    // BEFORE React hydrates (localStorage → <html> class swap) without React
    // throwing a hydration mismatch warning in dev.
    <html
      lang={locale}
      className={`${playfair.variable} ${inter.variable}`}
      suppressHydrationWarning
    >
      <body className="bg-white dark:bg-cream-dark-bg text-gray-900 dark:text-cream-dark-text antialiased min-h-screen flex flex-col transition-colors duration-300">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem storageKey="courser-theme">
          <div className="flex-1 flex flex-col">{children}</div>
          <Footer currentLocale={locale} />
        </ThemeProvider>
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
