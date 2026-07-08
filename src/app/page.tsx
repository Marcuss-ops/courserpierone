import Link from "next/link";
import { cookies } from "next/headers";
import { Instrument_Serif, Inter } from "next/font/google";
import { getServerUser } from "@/lib/supabase/get-user";
import { prisma } from "@/lib/db/prisma";
import { UserNav } from "@/components/user-nav";
import { DiscoveryGrid } from "@/components/discovery-grid";

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

  // Read locale cookie to build correct product links
  let currentLocale = "it-it";
  try {
    const cookieStore = await cookies();
    currentLocale = cookieStore.get("locale")?.value ?? "it-it";
  } catch {}

  const navUser = dbUser
    ? {
        name: dbUser.name,
        email: dbUser.email,
        image: dbUser.image,
        role: dbUser.role,
      }
    : null;

  // Fetch published products with translations and order counts for Discovery section
  let discoveryCourses: Array<{
    id: string;
    slug: string;
    title: string;
    subtitle: string;
    coverUrl: string | null;
    price: string;
    lessonCount: number;
    studentCount: number;
    category: string;
  }> = [];

  try {
    const publishedProducts = await prisma.product.findMany({
      where: { status: "published" },
      include: {
        translations: true,
        _count: { select: { lessons: true, orders: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    // Derive a human-friendly category from templateId
    const categoryMap: Record<string, string> = {
      lumio: "course",
      h612: "ebook",
      horizon: "course",
      "book-claude": "ebook",
      amish: "course",
    };

    discoveryCourses = publishedProducts.map((product) => {
      const translationsByLocale: Record<string, Record<string, string>> = {};
      for (const t of product.translations) {
        if (!translationsByLocale[t.locale]) translationsByLocale[t.locale] = {};
        translationsByLocale[t.locale][t.section] = t.content;
      }
      const it = translationsByLocale["it"] || {};
      const en = translationsByLocale["en"] || {};
      const title = it.titolo || en.titolo || product.slug.replace(/-/g, " ");
      const subtitle = it.sottotitolo || en.sottotitolo || it.problema || en.problema || "";
      const studentCount = product._count.orders;
      const lessonCount = product._count.lessons;
      const priceDisplay = product.price > 0 ? `€${(product.price / 100).toFixed(0)}` : "Gratuito";
      const category = categoryMap[product.templateId] || product.templateId;

      return {
        id: product.id,
        slug: product.slug,
        title,
        subtitle,
        coverUrl: product.coverUrl,
        price: priceDisplay,
        lessonCount,
        studentCount,
        category,
      };
    });
  } catch {
    // Database unreachable — show empty discovery section
  }

  // Derive unique categories for filter pills
  const categories = Array.from(
    new Set(discoveryCourses.map((c) => c.category))
  ).sort();

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

      <div className="relative max-w-[1080px] mx-auto px-6">
        {/* Header */}
        <header className="flex justify-between items-center py-6">
          <Link
            href="/login"
            className="flex items-center gap-3 group"
          >
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xl text-white shadow-sm transition-all group-hover:shadow-md group-hover:scale-105"
              style={{ background: "linear-gradient(135deg, #1a1a1a 0%, #333 100%)" }}
            >
              C
            </div>
            <span
              className="font-serif italic text-[28px] leading-none tracking-[-0.2px] group-hover:opacity-70 transition-opacity"
              style={{ fontFamily: "var(--font-serif), 'Instrument Serif', serif" }}
            >
              courssy
            </span>
          </Link>
          <UserNav user={navUser} />
        </header>

        <main>
          {/* Hero section — value proposition */}
          <section className="pt-16 pb-16 md:pt-20 md:pb-20 sm:pt-12 sm:pb-12">
            <h1
              className="font-serif italic font-normal text-[clamp(40px,7vw,68px)] leading-[0.95] tracking-[-0.5px] mb-5"
              style={{ fontFamily: "var(--font-serif), 'Instrument Serif', serif" }}
            >
              Discover courses that change your life.
            </h1>
            <p className="text-[20px] font-light text-black/60 max-w-[580px]">
              Browse our curated collection of premium courses. Learn from experts, at your own pace, from anywhere in the world.
            </p>
          </section>

          {/* ── Discovery Section (Skool-style) ───────────────────── */}
          <DiscoveryGrid courses={discoveryCourses} categories={categories} locale={currentLocale} />

          {/* Features Section */}
          <section className="py-16 border-t border-black/[0.08]">
            <h2
              className="font-serif italic text-[32px] tracking-[-0.2px] mb-10"
              style={{ fontFamily: "var(--font-serif), 'Instrument Serif', serif" }}
            >
              Everything you need to teach and sell online.
            </h2>
            <div className="space-y-10">
              <div className="grid grid-cols-[auto_1fr] gap-6 items-start">
                <span className="font-serif italic text-[22px] text-black/30">— 01</span>
                <div>
                  <h3 className="text-[17px] font-medium mb-1.5">High-Converting Design</h3>
                  <p className="text-[15px] font-light text-black/55 leading-relaxed">
                    Ready-to-use templates optimized to maximize your course sales and digital product delivery.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-[auto_1fr] gap-6 items-start">
                <span className="font-serif italic text-[22px] text-black/30">— 02</span>
                <div>
                  <h3 className="text-[17px] font-medium mb-1.5">Private Student Portal</h3>
                  <p className="text-[15px] font-light text-black/55 leading-relaxed">
                    A secure, elegant, and minimal e-learning portal for your students to consume content professionally.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-[auto_1fr] gap-6 items-start">
                <span className="font-serif italic text-[22px] text-black/30">— 03</span>
                <div>
                  <h3 className="text-[17px] font-medium mb-1.5">Integrated Checkout & Payments</h3>
                  <p className="text-[15px] font-light text-black/55 leading-relaxed">
                    Native integration with Lemon Squeezy and Stripe to securely accept payments from all over the world.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Pricing Section */}
          <section className="py-16 border-t border-black/[0.08]">
            <h2
              className="font-serif italic text-[32px] tracking-[-0.2px] mb-3"
              style={{ fontFamily: "var(--font-serif), 'Instrument Serif', serif" }}
            >
              Simple, transparent pricing.
            </h2>
            <p className="text-[17px] font-light text-black/55 mb-10">
              No hidden fees. Choose the plan that fits your growth.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Starter Plan */}
              <div className="border border-black/10 p-8 rounded-xl bg-white/50 backdrop-blur-sm flex flex-col justify-between">
                <div>
                  <h3 className="text-[19px] font-medium mb-2">Starter Plan</h3>
                  <p className="text-[14px] font-light text-black/50 mb-5">Perfect for launching your first course.</p>
                  <div className="mb-5">
                    <span className="font-serif italic text-[34px] font-normal" style={{ fontFamily: "var(--font-serif), 'Instrument Serif', serif" }}>€0</span>
                    <span className="text-[13px] font-light text-black/50"> / forever</span>
                  </div>
                  <ul className="space-y-2.5 text-[14px] font-light text-black/65 mb-6 border-t border-black/5 pt-5">
                    <li className="flex items-center gap-2">✓ 1 Active funnel</li>
                    <li className="flex items-center gap-2">✓ Up to 100 students</li>
                    <li className="flex items-center gap-2">✓ Courssy branding</li>
                  </ul>
                </div>
                <Link href="/login" className="block text-center py-3 px-4 bg-black/5 hover:bg-black/10 text-black rounded-lg text-[14px] font-medium transition-colors">
                  Get Started Free
                </Link>
              </div>

              {/* Pro Plan */}
              <div className="border-2 border-black p-8 rounded-xl bg-white flex flex-col justify-between relative shadow-sm">
                <span className="absolute top-0 right-8 -translate-y-1/2 bg-black text-white text-[10px] font-medium px-3 py-1 rounded-full uppercase tracking-wider">
                  Recommended
                </span>
                <div>
                  <h3 className="text-[19px] font-medium mb-2">Pro Plan</h3>
                  <p className="text-[14px] font-light text-black/50 mb-5">For professional educators and creators.</p>
                  <div className="mb-5">
                    <span className="font-serif italic text-[34px] font-normal" style={{ fontFamily: "var(--font-serif), 'Instrument Serif', serif" }}>€29</span>
                    <span className="text-[13px] font-light text-black/50"> / month</span>
                  </div>
                  <ul className="space-y-2.5 text-[14px] font-light text-black/65 mb-6 border-t border-black/5 pt-5">
                    <li className="flex items-center gap-2">✓ Unlimited funnels</li>
                    <li className="flex items-center gap-2">✓ Unlimited students</li>
                    <li className="flex items-center gap-2">✓ Custom domain</li>
                    <li className="flex items-center gap-2">✓ 0% Courssy transaction fees</li>
                  </ul>
                </div>
                <Link href="/login" className="block text-center py-3 px-4 bg-black hover:bg-black/90 text-white rounded-lg text-[14px] font-medium transition-colors">
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