#!/usr/bin/env tsx
/**
 * scripts/test-course-setup.ts
 *
 * One-off setup: seed `test-course-e2e` as a FREE accessible test course.
 *
 * What it does:
 * 1. Updates the `test-course-e2e` Product in the DB:
 *    - price = 0 (free)
 *    - status = "published" (visible on marketing pages)
 *    - defaultLanguage = "en"
 *    - templateId = "default" (uses the inline generic template)
 * 2. Ensures the product has at least 1 Lesson with translations in en/it
 * 3. Ensures the product has ProductTranslation rows (title, problem, story, cta, description)
 * 4. Creates a CourseConfigCache entry so the funnel page can render
 *
 * Idempotent — safe to run multiple times.
 *
 * Usage:
 *   npx tsx scripts/test-course-setup.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SLUG = "test-course-e2e";

async function main() {
  console.log(`\n🔧 Setting up "${SLUG}" as a FREE test course...\n`);

  // 1. Find or create the admin user (we need a creatorId)
  let admin = await prisma.user.findFirst({ where: { role: "admin" } });
  if (!admin) {
    console.log("⚠️  No admin user found. Creating one...");
    admin = await prisma.user.create({
      data: {
        email: "admin@courssy.test",
        name: "Test Admin",
        role: "admin",
        preferredLocale: "en",
      },
    });
    console.log(`✅ Created admin user: ${admin.id}`);
  }
  console.log(`👤 Admin user: ${admin.email} (${admin.id})`);

  // 2. Upsert the Product
  const product = await prisma.product.upsert({
    where: { slug: SLUG },
    update: {
      price: 0,
      status: "published",
      defaultLanguage: "en",
      templateId: "default",
    },
    create: {
      slug: SLUG,
      price: 0,
      status: "published",
      defaultLanguage: "en",
      templateId: "default",
      currency: "eur",
      creatorId: admin.id,
    },
  });
  console.log(`✅ Product upserted: ${product.id}`);
  console.log(`   price=${product.price} status=${product.status} template=${product.templateId}`);

  // 3. Upsert ProductTranslation rows
  const translations = [
    { locale: "en", section: "title", content: "Test Course E2E" },
    { locale: "en", section: "description", content: "A free test course to explore the Courssy platform internals." },
    { locale: "en", section: "problem", content: "Want to see how a Courssy course works end-to-end?" },
    { locale: "en", section: "story", content: "This is a free test course. No login, no payment — just explore the portal, lessons, and ebook to see how everything fits together." },
    { locale: "en", section: "cta", content: "Enter the Course" },
    { locale: "it", section: "title", content: "Corso Test E2E" },
    { locale: "it", section: "description", content: "Un corso gratuito per esplorare gli interni della piattaforma Courssy." },
    { locale: "it", section: "problem", content: "Vuoi vedere come funziona un corso Courssy end-to-end?" },
    { locale: "it", section: "story", content: "Questo è un corso test gratuito. Nessun login, nessun pagamento — esplora il portale, le lezioni e l'ebook per vedere come tutto si incastra." },
    { locale: "it", section: "cta", content: "Entra nel Corso" },
  ];

  for (const t of translations) {
    await prisma.productTranslation.upsert({
      where: {
        productId_locale_section: {
          productId: product.id,
          locale: t.locale,
          section: t.section,
        },
      },
      update: { content: t.content },
      create: {
        productId: product.id,
        locale: t.locale,
        section: t.section,
        content: t.content,
      },
    });
  }
  console.log(`✅ ProductTranslation: ${translations.length} rows upserted`);

  // 4. Upsert at least 1 Lesson with translations
  const lesson = await prisma.lesson.upsert({
    where: { id: `${SLUG}-lesson-1` },
    update: { productId: product.id, position: 1 },
    create: {
      id: `${SLUG}-lesson-1`,
      productId: product.id,
      position: 1,
    },
  });

  const lessonTranslations = [
    {
      lessonId: lesson.id,
      locale: "en",
      title: "Welcome to the Test Course",
      description: "This is the first lesson. Explore the platform here.",
      videoUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ", // Safe test video
    },
    {
      lessonId: lesson.id,
      locale: "it",
      title: "Benvenuto nel Corso Test",
      description: "Questa è la prima lezione. Esplora la piattaforma qui.",
      videoUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ",
    },
  ];

  for (const lt of lessonTranslations) {
    await prisma.lessonTranslation.upsert({
      where: { lessonId_locale: { lessonId: lt.lessonId, locale: lt.locale } },
      update: { title: lt.title, description: lt.description, videoUrl: lt.videoUrl },
      create: lt,
    });
  }
  console.log(`✅ Lesson: ${lesson.id} (${lessonTranslations.length} translations)`);

  // 5. Create CourseConfigCache entry
  const courseConfig = {
    slug: SLUG,
    productId: product.id,
    template: "default",
    defaultLanguage: "en",
    cover: "/test-course-cover.png",
    author: "Courssy Test",
    checkoutUrl: "#free", // Sentinel for free courses (no checkout)
    accentColor: "#C9840D",
    authorImageUrl: undefined,
    storyImages: [],
    languages: {
      en: {
        title: "Test Course E2E",
        problem: "Want to see how a Courssy course works end-to-end?",
        story: "This is a free test course. Explore the platform here.",
        cta: "Enter the Course",
        description: "A free test course to explore the Courssy platform internals.",
        ebookTitle: "Test eBook",
        ebookContent: "Free test eBook content.",
        seo: { title: "Test Course E2E", description: "Free test course" },
      },
      it: {
        title: "Corso Test E2E",
        problem: "Vuoi vedere come funziona un corso Courssy?",
        story: "Questo è un corso test gratuito. Esplora la piattaforma qui.",
        cta: "Entra nel Corso",
        description: "Un corso gratuito per esplorare gli interni di Courssy.",
        ebookTitle: "eBook Test",
        ebookContent: "Contenuto eBook test gratuito.",
        seo: { title: "Corso Test E2E", description: "Corso test gratuito" },
      },
    },
    lessons: [
      {
        number: 1,
        id: lesson.id,
        titles: { en: "Welcome to the Test Course", it: "Benvenuto nel Corso Test" },
        descriptions: {
          en: "This is the first lesson. Explore the platform here.",
          it: "Questa è la prima lezione. Esplora la piattaforma qui.",
        },
        videos: {
          en: "https://www.youtube.com/embed/dQw4w9WgXcQ",
          it: "https://www.youtube.com/embed/dQw4w9WgXcQ",
        },
        duration: "5:00",
      },
    ],
    ebookChapters: [],
  };

  await prisma.courseConfigCache.upsert({
    where: { slug: SLUG },
    update: { config: JSON.stringify(courseConfig), version: { increment: 1 } },
    create: {
      slug: SLUG,
      config: JSON.stringify(courseConfig),
      version: 1,
    },
  });
  console.log(`✅ CourseConfigCache: upserted for "${SLUG}"`);

  console.log(`\n🎉 "${SLUG}" is now a FREE test course!`);
  console.log(`   → Visit http://localhost:3000/en/test-course-e2e (or /it/)`);
  console.log(`   → No login required, no payment required`);
  console.log(`   → Explore: /portal, /curso/${lesson.id}, /ebook, /about\n`);
}

main()
  .catch((e) => {
    console.error("❌ Error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
