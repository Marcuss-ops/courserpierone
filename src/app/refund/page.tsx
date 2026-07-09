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
  title: "Refund Policy",
  description: "Refund Policy for Courssy",
};

export default function RefundPage() {
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
              Refund Policy
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
                  30-Day Money-Back Guarantee
                </h2>
                <p>
                  At Courssy, we want to ensure you are 100% satisfied with our platform. We offer a <strong>30-day money-back guarantee</strong> for all initial subscription plans (Starter, Pro, etc.) and digital course purchases.
                </p>
                <p>
                  If you feel the platform does not meet your needs, or if you are unsatisfied with your purchase for any reason, you can request a full refund within 30 days from your original purchase date.
                </p>
              </div>

              <div className="space-y-8">
                <h2
                  className="font-serif italic text-[28px] leading-none pt-4"
                  style={{ fontFamily: "var(--font-serif), 'Instrument Serif', serif" }}
                >
                  How to Request a Refund
                </h2>
                <p>
                  To request a refund, please send an email to <a href="mailto:supporto@courssy.it" className="underline">supporto@courssy.it</a> with the following details:
                </p>
                <ul className="list-none space-y-3 border-t border-black pt-6">
                  <li className="pl-6 relative before:absolute before:left-0 before:top-2">—
                    Your registered account email
                  </li>
                  <li className="pl-6 relative before:absolute before:left-0 before:top-2">—
                    The order ID or transaction ID
                  </li>
                  <li className="pl-6 relative before:absolute before:left-0 before:top-2">—
                    A brief explanation of why you are requesting a refund (optional, but helps us improve)
                  </li>
                </ul>
              </div>

              <div className="space-y-8">
                <h2
                  className="font-serif italic text-[28px] leading-none pt-4"
                  style={{ fontFamily: "var(--font-serif), 'Instrument Serif', serif" }}
                >
                  Processing of Refunds
                </h2>
                <p>
                  Once your refund request is received, it will be inspected and processed within 3 to 5 business days. The refund will be credited back to your original payment method (managed via our Merchant of Record, Lemon Squeezy, or Stripe).
                </p>
                <p>
                  Please note that once a refund is processed, access to the paid subscription features or the digital course contents will be immediately terminated.
                </p>
              </div>

              <div className="pt-8 border-t border-black">
                <p className="text-[15px] text-gray-600">
                  For questions about our Refund Policy, contact us at <a href="mailto:supporto@courssy.it" className="underline underline-offset-2">supporto@courssy.it</a>.
                </p>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
