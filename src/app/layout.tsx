import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Courser — Cervellone",
    template: "%s | Courser",
  },
  description: "Generatore automatico di Funnel e Aree Corsi multilingua",
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: "Courser — Cervellone",
    description: "Generatore automatico di Funnel e Aree Corsi multilingua",
    type: "website",
    siteName: "Courser",
  },
  twitter: {
    card: "summary_large_image",
    title: "Courser — Cervellone",
    description: "Generatore automatico di Funnel e Aree Corsi multilingua",
  },
  icons: {
    icon: "/favicon.ico",
  },
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
    <html lang={locale}>
      <body className="bg-white text-gray-900 antialiased">
        {children}
      </body>
    </html>
  );
}
