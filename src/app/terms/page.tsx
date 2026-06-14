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
  title: "Terms & Conditions",
  description: "Terms and conditions for using Courssy",
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
              Terms & Conditions
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
                  1. Acceptance
                </h2>
                <p>
                  By accessing or using Courssy ("the service", "platform"), you agree to be bound by these Terms & Conditions ("Terms"). If you do not agree to these Terms, do not use the service.
                </p>
                <p>
                  By using the service, you represent that you are at least 18 years old and have the legal capacity to enter into contracts.
                </p>
              </div>

              <div className="space-y-8">
                <h2
                  className="font-serif italic text-[28px] leading-none pt-4"
                  style={{ fontFamily: "var(--font-serif), 'Instrument Serif', serif" }}
                >
                  2. Description of Service
                </h2>
                <p>
                  Courssy is a SaaS platform that allows users to create and manage sales funnels for digital courses. The services include:
                </p>
                <ul className="list-none space-y-3 border-t border-black pt-6">
                  <li className="pl-6 relative before:absolute before:left-0 before:top-2">—
                    Creation of sales pages and landing pages
                  </li>
                  <li className="pl-6 relative before:absolute before:left-0 before:top-2">—
                    Checkout and payment management
                  </li>
                  <li className="pl-6 relative before:absolute before:left-0 before:top-2">—
                    Distribution of digital content
                  </li>
                  <li className="pl-6 relative before:absolute before:left-0 before:top-2">—
                    Analytics and tracking tools
                  </li>
                </ul>
              </div>

              <div className="space-y-8">
                <h2
                  className="font-serif italic text-[28px] leading-none pt-4"
                  style={{ fontFamily: "var(--font-serif), 'Instrument Serif', serif" }}
                >
                  3. Account and Access
                </h2>
                <ul className="list-none space-y-3 border-t border-black pt-6">
                  <li className="pl-6 relative before:absolute before:left-0 before:top-2">—
                    You are responsible for maintaining the confidentiality of your credentials
                  </li>
                  <li className="pl-6 relative before:absolute before:left-0 before:top-2">—
                    You must immediately notify us of any unauthorized use
                  </li>
                  <li className="pl-6 relative before:absolute before:left-0 before:top-2">—
                    You cannot share your account with third parties
                  </li>
                  <li className="pl-6 relative before:absolute before:left-0 before:top-2">—
                    We may suspend or terminate accounts that violate these Terms
                  </li>
                </ul>
              </div>

              <div className="space-y-8">
                <h2
                  className="font-serif italic text-[28px] leading-none pt-4"
                  style={{ fontFamily: "var(--font-serif), 'Instrument Serif', serif" }}
                >
                  4. Plans, Billing, and Refund Policy
                </h2>
                <p>
                  <strong>Starter Plan:</strong> free, 1 funnel, 100 students, visible Courssy branding.
                </p>
                <p>
                  <strong>Pro Plan:</strong> €29/month, unlimited funnels, custom domain, zero transaction fees.
                </p>
                <p className="pt-4">
                  Payments are managed by Stripe and Lemon Squeezy. Invoices are generated automatically and are accessible from your account.
                </p>
                <p className="pt-4">
                  <strong>Refund Policy:</strong> We offer a 30-day money-back guarantee for your first billing cycle. If you are not satisfied with the platform within 30 days of subscribing, you may contact us at <a href="mailto:supporto@courssy.it" className="underline underline-offset-2">supporto@courssy.it</a> to request a full refund.
                </p>
              </div>

              <div className="space-y-8">
                <h2
                  className="font-serif italic text-[28px] leading-none pt-4"
                  style={{ fontFamily: "var(--font-serif), 'Instrument Serif', serif" }}
                >
                  5. Customer Content
                </h2>
                <p>
                  The content you upload to the platform (courses, text, images) remains your property. You grant us a license to use it to provide the service.
                </p>
                <p className="pt-4">
                  You warrant that you own all rights to the uploaded content and that it does not infringe on third-party rights.
                </p>
              </div>

              <div className="space-y-8">
                <h2
                  className="font-serif italic text-[28px] leading-none pt-4"
                  style={{ fontFamily: "var(--font-serif), 'Instrument Serif', serif" }}
                >
                  6. Acceptable Use
                </h2>
                <p>You may not use the service for:</p>
                <ul className="list-none space-y-3 border-t border-black pt-6">
                  <li className="pl-6 relative before:absolute before:left-0 before:top-2">—
                    Illegal activities or violating third-party rights
                  </li>
                  <li className="pl-6 relative before:absolute before:left-0 before:top-2">—
                    Fraudulent, deceptive, or spam content
                  </li>
                  <li className="pl-6 relative before:absolute before:left-0 before:top-2">—
                    Infringing on copyrights, trademarks, or privacy laws
                  </li>
                  <li className="pl-6 relative before:absolute before:left-0 before:top-2">—
                    Interfering with the operation of the service
                  </li>
                </ul>
              </div>

              <div className="space-y-8">
                <h2
                  className="font-serif italic text-[28px] leading-none pt-4"
                  style={{ fontFamily: "var(--font-serif), 'Instrument Serif', serif" }}
                >
                  7. Limitation of Liability
                </h2>
                <p>
                  The service is provided "as is". We do not guarantee that the service will always be available, error-free, or run without interruptions.
                </p>
                <p className="pt-4">
                  We will not be liable for any indirect, consequential, special, or punitive damages, including loss of profits, data, or business opportunities.
                </p>
              </div>

              <div className="space-y-8">
                <h2
                  className="font-serif italic text-[28px] leading-none pt-4"
                  style={{ fontFamily: "var(--font-serif), 'Instrument Serif', serif" }}
                >
                  8. Intellectual Property
                </h2>
                <p>
                  Courssy and its design, logo, and interface are our property and are protected by copyright and other intellectual property rights.
                </p>
              </div>

              <div className="space-y-8">
                <h2
                  className="font-serif italic text-[28px] leading-none pt-4"
                  style={{ fontFamily: "var(--font-serif), 'Instrument Serif', serif" }}
                >
                  9. Termination
                </h2>
                <p>
                  We may suspend or terminate your service at any time, with or without notice, for violation of these Terms or for security reasons.
                </p>
              </div>

              <div className="space-y-8">
                <h2
                  className="font-serif italic text-[28px] leading-none pt-4"
                  style={{ fontFamily: "var(--font-serif), 'Instrument Serif', serif" }}
                >
                  10. Governing Law
                </h2>
                <p>
                  These Terms are governed by Italian law. Any dispute will be resolved exclusively in the Court of Rome.
                </p>
              </div>

              <div className="pt-8 border-t border-black">
                <p className="text-[15px] text-gray-600">
                  For questions about these Terms, contact us at <a href="mailto:supporto@courssy.it" className="underline underline-offset-2">supporto@courssy.it</a>.
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
              terms
            </Link>
          </div>
        </footer>
      </div>
    </div>
  );
}