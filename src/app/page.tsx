// ─── HomePage — Thin composition ──────────────────────────
// Data fetching → lib/data/homepage-data.ts
// Data transform → lib/data/homepage-transform.ts

import Link from "next/link";
import { cookies } from "next/headers";
import { Instrument_Serif, Inter } from "next/font/google";
import { getServerUser } from "@/lib/supabase/get-user";
import { UserNav } from "@/components/user-nav";
import { DiscoveryGrid } from "@/components/discovery-grid";
import { fetchPublishedProducts } from "@/lib/data/homepage-data";
import { prisma } from "@/lib/db/prisma";
import {
  transformToDiscoveryCourses,
  extractCategories,
} from "@/lib/data/homepage-transform";

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
  // ── Auth + locale ──
  const { dbUser } = await getServerUser();
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

  // ── Data ──
  let discoveryCourses: ReturnType<typeof transformToDiscoveryCourses> = [];
  let categories: string[] = [];

  try {
    const { products } = await fetchPublishedProducts();

    // Determine which products the user already owns
    let ownedProductIds = new Set<string>();
    if (dbUser) {
      try {
        const orders = await prisma.order.findMany({
          where: { userId: dbUser.id, status: "completed" },
          select: { productId: true },
        });
        ownedProductIds = new Set(orders.map((o) => o.productId));
      } catch {
        // Order lookup failed — treat all as unowned
      }
    }

    discoveryCourses = transformToDiscoveryCourses(products, ownedProductIds, currentLocale);
    categories = extractCategories(discoveryCourses);
  } catch {
    // Database unreachable — show empty discovery section
  }

  // ── Render ──
  return (
    <div
      className={`${instrumentSerif.variable} ${inter.variable} min-h-screen text-black font-sans relative overflow-hidden`}
      style={{ background: "#FAFAF8" }}
    >
      {/* Soft gradient orbs for modern premium feel */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background: `
          radial-gradient(ellipse 800px 600px at 20% 20%, rgba(255, 248, 240, 0.8) 0%, transparent 70%),
          radial-gradient(ellipse 600px 800px at 80% 80%, rgba(255, 245, 235, 0.6) 0%, transparent 70%),
          radial-gradient(ellipse 500px 500px at 50% 50%, rgba(255, 250, 245, 0.4) 0%, transparent 60%),
          linear-gradient(180deg, #FAFAF8 0%, #F5F0E8 100%)
        `,
        }}
      />

      {/* Glowing accent orb top-right */}
      <div
        className="fixed w-[400px] h-[400px] rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, rgba(255, 230, 210, 0.5) 0%, transparent 70%)",
          top: "-100px",
          right: "-100px",
          filter: "blur(80px)",
        }}
      />

      {/* Glowing accent orb bottom-left */}
      <div
        className="fixed w-[500px] h-[500px] rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, rgba(255, 240, 225, 0.4) 0%, transparent 70%)",
          bottom: "-150px",
          left: "-150px",
          filter: "blur(100px)",
        }}
      />

      {/* Subtle warm gradient top */}
      <div
        className="fixed inset-x-0 top-0 h-[300px] pointer-events-none"
        style={{
          background:
            "linear-gradient(180deg, rgba(255, 245, 235, 0.6) 0%, transparent 100%)",
        }}
      />

      <div className="relative max-w-[1080px] mx-auto px-6">
        {/* Header */}
        <header className="flex justify-between items-center py-6">
          <Link href="/" className="group">
            <span
              className="font-serif italic text-[32px] leading-none tracking-[-0.3px] group-hover:opacity-60 transition-opacity"
              style={{
                fontFamily: "var(--font-serif), 'Instrument Serif', serif",
              }}
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
              style={{
                fontFamily: "var(--font-serif), 'Instrument Serif', serif",
              }}
            >
              Discover courses that change your life.
            </h1>
            <p className="text-[20px] font-light text-black/60 max-w-[580px]">
              Browse our curated collection of premium courses. Learn from
              experts, at your own pace, from anywhere in the world.
            </p>
          </section>

          {/* ── Discovery Section (Skool-style) ───────────────────── */}
          <DiscoveryGrid
            courses={discoveryCourses}
            categories={categories}
            locale={currentLocale}
          />
        </main>
      </div>
    </div>
  );
}
