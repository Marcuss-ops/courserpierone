import Link from "next/link";
import { Instrument_Serif, Inter } from "next/font/google";
import { getServerUser } from "@/lib/supabase/get-user";
import { UserNav } from "@/components/user-nav";

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

export default async function HomePage() {
  // Get current user (null if not logged in)
  const { dbUser } = await getServerUser();
  const navUser = dbUser
    ? {
        name: dbUser.name,
        email: dbUser.email,
        image: dbUser.image,
        role: dbUser.role,
      }
    : null;

  // Ultra-minimal landing - hero + footer only
  return (
    <div
      className={`${instrumentSerif.variable} ${inter.variable} min-h-screen text-black font-sans relative overflow-hidden`}
      style={{ background: "#FAFAF8" }}
    >
      {/* Soft gradient orbs for modern premium feel */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{ background: `
          radial-gradient(ellipse 800px 600px at 20% 20%, rgba(255, 248, 240, 0.8) 0%, transparent 70%),
          radial-gradient(ellipse 600px 800px at 80% 80%, rgba(255, 245, 235, 0.6) 0%, transparent 70%),
          radial-gradient(ellipse 500px 500px at 50% 50%, rgba(255, 250, 245, 0.4) 0%, transparent 60%),
          linear-gradient(180deg, #FAFAF8 0%, #F5F0E8 100%)
        ` }}
      />

      {/* Glowing accent orb top-right */}
      <div
        className="fixed w-[400px] h-[400px] rounded-full pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(255, 230, 210, 0.5) 0%, transparent 70%)",
          top: "-100px",
          right: "-100px",
          filter: "blur(80px)",
        }}
      />

      {/* Glowing accent orb bottom-left */}
      <div
        className="fixed w-[500px] h-[500px] rounded-full pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(255, 240, 225, 0.4) 0%, transparent 70%)",
          bottom: "-150px",
          left: "-150px",
          filter: "blur(100px)",
        }}
      />

      {/* Subtle warm gradient top */}
      <div
        className="fixed inset-x-0 top-0 h-[300px] pointer-events-none"
        style={{
          background: "linear-gradient(180deg, rgba(255, 245, 235, 0.6) 0%, transparent 100%)",
        }}
      />

      <div className="relative max-w-[720px] mx-auto px-6">
        {/* Header */}
        <header className="flex justify-between items-center py-8">
          <div
            className="font-serif italic text-[28px] leading-none tracking-[-0.2px]"
            style={{ fontFamily: "var(--font-serif), 'Instrument Serif', serif" }}
          >
            courssy
          </div>
          <UserNav user={navUser} />
        </header>

        <main>
          {/* Minimal hero - just headline and tagline */}
          <section className="pt-24 pb-20 md:pt-24 md:pb-20 sm:pt-16 sm:pb-16 border-b border-black/10">
            <h1
              className="font-serif italic font-normal text-[clamp(48px,9vw,84px)] leading-[0.95] tracking-[-0.5px] mb-6"
              style={{ fontFamily: "var(--font-serif), 'Instrument Serif', serif" }}
            >
              Create beautiful e-learning funnels.
            </h1>
            <p className="text-[22px] font-light text-black/70">
              Launch your online courses in minutes, not weeks.
            </p>
          </section>

          {/* Features Section */}
          <section className="py-20 border-b border-black/10">
            <h2 
              className="font-serif italic text-[36px] tracking-[-0.2px] mb-12"
              style={{ fontFamily: "var(--font-serif), 'Instrument Serif', serif" }}
            >
              Everything you need to teach and sell online.
            </h2>
            <div className="space-y-12">
              <div className="grid grid-cols-[auto_1fr] gap-6 items-start">
                <span className="font-serif italic text-[24px] text-black/40">— 01</span>
                <div>
                  <h3 className="text-[18px] font-medium mb-2">High-Converting Design</h3>
                  <p className="text-[16px] font-light text-black/60 leading-relaxed">
                    Ready-to-use templates optimized to maximize your course sales and digital product delivery.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-[auto_1fr] gap-6 items-start">
                <span className="font-serif italic text-[24px] text-black/40">— 02</span>
                <div>
                  <h3 className="text-[18px] font-medium mb-2">Private Student Portal</h3>
                  <p className="text-[16px] font-light text-black/60 leading-relaxed">
                    A secure, elegant, and minimal e-learning portal for your students to consume content professionally.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-[auto_1fr] gap-6 items-start">
                <span className="font-serif italic text-[24px] text-black/40">— 03</span>
                <div>
                  <h3 className="text-[18px] font-medium mb-2">Integrated Checkout & Payments</h3>
                  <p className="text-[16px] font-light text-black/60 leading-relaxed">
                    Native integration with Lemon Squeezy and Stripe to securely accept payments from all over the world.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Pricing Section */}
          <section className="py-20">
            <h2 
              className="font-serif italic text-[36px] tracking-[-0.2px] mb-4"
              style={{ fontFamily: "var(--font-serif), 'Instrument Serif', serif" }}
            >
              Simple, transparent pricing.
            </h2>
            <p className="text-[18px] font-light text-black/60 mb-12">
              No hidden fees. Choose the plan that fits your growth.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Starter Plan */}
              <div className="border border-black/10 p-8 rounded-xl bg-white/50 backdrop-blur-sm flex flex-col justify-between">
                <div>
                  <h3 className="text-[20px] font-medium mb-2">Starter Plan</h3>
                  <p className="text-[15px] font-light text-black/50 mb-6">Perfect for launching your first course.</p>
                  <div className="mb-6">
                    <span className="font-serif italic text-[36px] font-normal" style={{ fontFamily: "var(--font-serif), 'Instrument Serif', serif" }}>€0</span>
                    <span className="text-[14px] font-light text-black/50"> / forever</span>
                  </div>
                  <ul className="space-y-3 text-[15px] font-light text-black/70 mb-8 border-t border-black/5 pt-6">
                    <li className="flex items-center gap-2">✓ 1 Active funnel</li>
                    <li className="flex items-center gap-2">✓ Up to 100 students</li>
                    <li className="flex items-center gap-2">✓ Courssy branding</li>
                  </ul>
                </div>
                <Link href="/login" className="block text-center py-3 px-4 bg-black/5 hover:bg-black/10 text-black rounded-lg text-[15px] font-medium transition-colors">
                  Get Started Free
                </Link>
              </div>

              {/* Pro Plan */}
              <div className="border-2 border-black p-8 rounded-xl bg-white flex flex-col justify-between relative shadow-sm">
                <span className="absolute top-0 right-8 -translate-y-1/2 bg-black text-white text-[11px] font-medium px-3 py-1 rounded-full uppercase tracking-wider">
                  Recommended
                </span>
                <div>
                  <h3 className="text-[20px] font-medium mb-2">Pro Plan</h3>
                  <p className="text-[15px] font-light text-black/50 mb-6">For professional educators and creators.</p>
                  <div className="mb-6">
                    <span className="font-serif italic text-[36px] font-normal" style={{ fontFamily: "var(--font-serif), 'Instrument Serif', serif" }}>€29</span>
                    <span className="text-[14px] font-light text-black/50"> / month</span>
                  </div>
                  <ul className="space-y-3 text-[15px] font-light text-black/70 mb-8 border-t border-black/5 pt-6">
                    <li className="flex items-center gap-2">✓ Unlimited funnels</li>
                    <li className="flex items-center gap-2">✓ Unlimited students</li>
                    <li className="flex items-center gap-2">✓ Custom domain</li>
                    <li className="flex items-center gap-2">✓ 0% Courssy transaction fees</li>
                  </ul>
                </div>
                <Link href="/login" className="block text-center py-3 px-4 bg-black hover:bg-black/90 text-white rounded-lg text-[15px] font-medium transition-colors">
                  Go Pro
                </Link>
              </div>
            </div>
          </section>
        </main>

        {/* Footer */}
        <footer className="py-10 pb-20 flex sm:flex-col sm:items-start justify-between items-center text-[14px] font-light gap-3 sm:gap-3 flex-wrap border-t border-black/10">
          <div>© 2026 Courssy</div>
          <div className="flex gap-5 flex-wrap">
            <Link href="/privacy" className="hover:underline underline-offset-3 no-underline hover:no-underline">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:underline underline-offset-3 no-underline hover:no-underline">
              Terms of Service
            </Link>
            <Link href="/refund" className="hover:underline underline-offset-3 no-underline hover:no-underline">
              Refund Policy
            </Link>
          </div>
        </footer>
      </div>
    </div>
  );
}