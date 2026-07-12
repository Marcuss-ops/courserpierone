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

  const existing = await prisma.product.findUnique({
    where: { slug: "test-course-e2e" },
  });

  if (existing) {
    if (
      existing.stripePriceId !== stripePriceId ||
      existing.lemonVariantId !== lemonVariantId
    ) {
      return prisma.product.update({
        where: { slug: "test-course-e2e" },
        data: { stripePriceId, lemonVariantId },
      });
    }
    return existing;
  }

  return prisma.product.create({
    data: {
      slug: "test-course-e2e",
      status: "published",
      price: 4900,
      currency: "eur",
      defaultLanguage: "en",
      stripePriceId,
      lemonVariantId,
    },
  });
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
