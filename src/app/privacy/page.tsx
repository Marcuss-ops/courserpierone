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
  description: "Privacy Policy for Courssy",
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
                Last updated: January 1, 2026
              </p>

              <div className="space-y-8">
                <h2
                  className="font-serif italic text-[28px] leading-none pt-4"
                  style={{ fontFamily: "var(--font-serif), 'Instrument Serif', serif" }}
                >
                  1. Data Controller
                </h2>
                <p>
                  UploaderCourssy (developed by Courssy S.r.l., referred to as "we", "our", "controller", or "UploaderCourssy") is responsible for the processing of your personal data in accordance with the General Data Protection Regulation (GDPR).
                </p>
                <p>
                  <strong>Entity:</strong> Courssy S.r.l.<br />
                  <strong>Address:</strong> Via Roma 123, 00100 Rome, Italy<br />
                  <strong>Email:</strong> <a href="mailto:supporto@courssy.it" className="underline">supporto@courssy.it</a>
                </p>
              </div>

              <div className="space-y-8">
                <h2
                  className="font-serif italic text-[28px] leading-none pt-4"
                  style={{ fontFamily: "var(--font-serif), 'Instrument Serif', serif" }}
                >
                  2. Collected Data
                </h2>
                <p>We collect the following categories of data:</p>
                <ul className="list-none space-y-3 border-t border-black pt-6">
                  <li className="pl-6 relative before:absolute before:left-0 before:top-2">—
                    <strong>Account Information:</strong> name, email, encrypted password
                  </li>
                  <li className="pl-6 relative before:absolute before:left-0 before:top-2">—
                    <strong>Payment Information:</strong> processed securely by Lemon Squeezy, never stored on our servers
                  </li>
                  <li className="pl-6 relative before:absolute before:left-0 before:top-2">—
                    <strong>Usage Data:</strong> pages visited, actions performed, timestamps
                  </li>
                  <li className="pl-6 relative before:absolute before:left-0 before:top-2">—
                    <strong>Cookies:</strong> anonymous identifiers for functionality and analytics
                  </li>
                </ul>
              </div>

              <div className="space-y-8">
                <h2
                  className="font-serif italic text-[28px] leading-none pt-4"
                  style={{ fontFamily: "var(--font-serif), 'Instrument Serif', serif" }}
                >
                  3. Purposes of Processing
                </h2>
                <p>We process your data to:</p>
                <ul className="list-none space-y-3 border-t border-black pt-6">
                  <li className="pl-6 relative before:absolute before:left-0 before:top-2">—
                    Provide access to the platform and your courses
                  </li>
                  <li className="pl-6 relative before:absolute before:left-0 before:top-2">—
                    Process payments and issue invoices/receipts
                  </li>
                  <li className="pl-6 relative before:absolute before:left-0 before:top-2">—
                    Send transactional emails (e.g. order confirmations, recovery links)
                  </li>
                  <li className="pl-6 relative before:absolute before:left-0 before:top-2">—
                    Improve the platform performance and user experience
                  </li>
                  <li className="pl-6 relative before:absolute before:left-0 before:top-2">—
                    Comply with legal and tax obligations
                  </li>
                </ul>
              </div>

              <div className="space-y-8">
                <h2
                  className="font-serif italic text-[28px] leading-none pt-4"
                  style={{ fontFamily: "var(--font-serif), 'Instrument Serif', serif" }}
                >
                  4. Legal Basis
                </h2>
                <p>Data processing is based on:</p>
                <ul className="list-none space-y-3 border-t border-black pt-6">
                  <li className="pl-6 relative before:absolute before:left-0 before:top-2">—
                    <strong>Contract execution</strong> (GDPR Art. 6.1.b) — to deliver services you subscribed to
                  </li>
                  <li className="pl-6 relative before:absolute before:left-0 before:top-2">—
                    <strong>Consent</strong> (GDPR Art. 6.1.a) — for direct marketing (which you can revoke anytime)
                  </li>
                  <li className="pl-6 relative before:absolute before:left-0 before:top-2">—
                    <strong>Legitimate interest</strong> (GDPR Art. 6.1.f) — for platform security and basic analytics
                  </li>
                  <li className="pl-6 relative before:absolute before:left-0 before:top-2">—
                    <strong>Legal compliance</strong> (GDPR Art. 6.1.c) — for tax and accounting records
                  </li>
                </ul>
              </div>

              <div className="space-y-8">
                <h2
                  className="font-serif italic text-[28px] leading-none pt-4"
                  style={{ fontFamily: "var(--font-serif), 'Instrument Serif', serif" }}
                >
                  5. Data Retention
                </h2>
                <p>
                  We store your personal data for as long as necessary to fulfill the purposes outlined. Account data is deleted within 30 days of a cancellation request. Billing data is retained for 10 years to comply with statutory tax laws.
                </p>
              </div>

              <div className="space-y-8">
                <h2
                  className="font-serif italic text-[28px] leading-none pt-4"
                  style={{ fontFamily: "var(--font-serif), 'Instrument Serif', serif" }}
                >
                  6. Your Rights
                </h2>
                <p>You have the right to:</p>
                <ul className="list-none space-y-3 border-t border-black pt-6">
                  <li className="pl-6 relative before:absolute before:left-0 before:top-2">—
                    Access your personal data
                  </li>
                  <li className="pl-6 relative before:absolute before:left-0 before:top-2">—
                    Rectify inaccurate or incomplete data
                  </li>
                  <li className="pl-6 relative before:absolute before:left-0 before:top-2">—
                    Request erasure of your data ("right to be forgotten")
                  </li>
                  <li className="pl-6 relative before:absolute before:left-0 before:top-2">—
                    Object to or restrict the processing of your data
                  </li>
                  <li className="pl-6 relative before:absolute before:left-0 before:top-2">—
                    Data portability
                  </li>
                </ul>
                <p className="pt-4">
                  To exercise your rights, please contact us at <a href="mailto:supporto@courssy.it" className="underline underline-offset-2">supporto@courssy.it</a>.
                </p>
              </div>

              <div className="space-y-8" id="cookies">
                <h2
                  className="font-serif italic text-[28px] leading-none pt-4"
                  style={{ fontFamily: "var(--font-serif), 'Instrument Serif', serif" }}
                >
                  7. Cookie Policy
                </h2>
                <p>
                  We use essential cookies (required for platform operation) and analytical cookies (to understand how you interact with our service). You can manage cookie preferences directly from your browser settings.
                </p>
                <p>
                  Third-party services placing cookies: <strong>Lemon Squeezy</strong> (payment processing and merchant of record) and <strong>Vercel</strong> (hosting provider).
                </p>
              </div>

              <div className="space-y-8">
                <h2
                  className="font-serif italic text-[28px] leading-none pt-4"
                  style={{ fontFamily: "var(--font-serif), 'Instrument Serif', serif" }}
                >
                  8. Amendments
                </h2>
                <p>
                  This Privacy Policy may be updated periodically. Significant changes will be notified via email or displayed prominently on our platform.
                </p>
              </div>

              <div className="pt-8 border-t border-black">
                <p className="text-[15px] text-gray-600">
                  For any privacy inquiries, please contact us at <a href="mailto:supporto@courssy.it" className="underline underline-offset-2">supporto@courssy.it</a>.
                </p>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}