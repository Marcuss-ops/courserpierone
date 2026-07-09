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
            <div className="w-10 h-10 rounded-xl overflow-hidden shadow-sm transition-all group-hover:shadow-md group-hover:scale-105">
              <img src="/icon.png" alt="UploaderCourssy Logo" className="w-full h-full object-cover" />
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
        </main>
      </div>
    </div>
  );
}