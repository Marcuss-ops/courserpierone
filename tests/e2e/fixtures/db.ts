import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL,
    },
  },
});

export async function cleanupTestData() {
  await prisma.$transaction([
    prisma.analyticEvent.deleteMany(),
    prisma.processedWebhook.deleteMany(),
    prisma.abandonedCheckout.deleteMany(),
    prisma.order.deleteMany(),
    prisma.user.deleteMany(),
    prisma.product.deleteMany(),
  ]);
}

export async function cleanupTestUser(email: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    include: { orders: true },
  });

  if (!user) return;

  const orderIds = user.orders.map((o) => o.id);

  await prisma.$transaction([
    prisma.analyticEvent.deleteMany({ where: { userId: user.id } }),
    // LessonProgress may be present from journey E2E tests
    prisma.lessonProgress.deleteMany({ where: { userId: user.id } }),
    prisma.lessonNote.deleteMany({ where: { userId: user.id } }),
    // I deliveryId dei webhook non sono direttamente collegati agli ordini;
    // in un DB di test serializzato possiamo rimuovere tutti i record.
    prisma.processedWebhook.deleteMany(),
    prisma.abandonedCheckout.deleteMany({ where: { email } }),
    prisma.order.deleteMany({ where: { userId: user.id } }),
    prisma.user.delete({ where: { email } }),
  ]);
}

export async function seedTestProduct() {
  const stripePriceId = process.env.TEST_STRIPE_PRICE_ID ?? null;
  const lemonVariantId = process.env.TEST_LEMON_VARIANT_ID ?? null;

  // Phase 4 hardening: Product.creatorId è REQUIRED + FK Restrict. Il
  // creator canonico del prodotto di test è il primo admin/creator per
  // createdAt ascendente (criterio storico del removed
  // backfill-primary-creator.ts). Se nessun admin/creator esiste nel
  // DB di test, l'operazione fallisce loudmente — il test setup deve
  // includere un admin seeded prima dell'esecuzione della suite.
  const canonicalCreator = await prisma.user.findFirst({
    where: { role: { in: ["admin", "creator"] } },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!canonicalCreator) {
    throw new Error(
      "seedTestProduct: nessun admin/creator trovato nel DB di test. " +
        "L'invariant Phase 4 richiede Product.creatorId NOT NULL — " +
        "seedare un account admin prima di eseguire i test E2E.",
    );
  }

  const existing = await prisma.product.findUnique({
    where: { slug: "test-course-e2e" },
  });

  let product = existing;

  if (existing) {
    if (
      existing.stripePriceId !== stripePriceId ||
      existing.lemonVariantId !== lemonVariantId
    ) {
      product = await prisma.product.update({
        where: { slug: "test-course-e2e" },
        data: { stripePriceId, lemonVariantId },
      });
    }
  } else {
    product = await prisma.product.create({
      data: {
        slug: "test-course-e2e",
        status: "published",
        price: 4900,
        currency: "eur",
        defaultLanguage: "en",
        stripePriceId,
        lemonVariantId,
        creatorId: canonicalCreator.id,
      },
    });
  }

  if (!product) {
    throw new Error("seedTestProduct: failed to resolve product");
  }

  // Ensure the test product has at least one Lesson + LessonTranslation per locale.
  // Without this, the journey E2E test cannot find a `a[href*="/curso/"]` link
  // on the portal page. We use a known public YouTube video (Rick Astley) that
  // exists in test mode without authentication.
  const existingLessons = await prisma.lesson.count({
    where: { productId: product.id },
  });

  if (existingLessons === 0) {
    await prisma.lesson.create({
      data: {
        productId: product.id,
        position: 1,
        translations: {
          create: [
            {
              locale: "en-us",
              title: "Lesson 1 — Welcome",
              videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
              description: "E2E test lesson (English).",
            },
            {
              locale: "it-it",
              title: "Lezione 1 — Benvenuto",
              videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
              description: "Lezione di test E2E (italiano).",
            },
            {
              locale: "es-es",
              title: "Lecci\u00f3n 1 — Bienvenida",
              videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
              description: "Lecci\u00f3n de prueba E2E (espa\u00f1ol).",
            },
          ],
        },
      },
    });
  }

  return product;
}

export async function getTestUser(email: string) {
  return prisma.user.findUnique({ where: { email } });
}

export async function getTestOrder(email: string) {
  const user = await getTestUser(email);
  if (!user) return null;
  return prisma.order.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });
}
