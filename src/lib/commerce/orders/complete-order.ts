import { prisma } from "@/lib/db/prisma";
import { localeToLanguage } from "@/lib/i18n/locale-resolver";
import { NotFoundError } from "@/lib/errors";
import type { PaymentProviderSlug } from "@/lib/commerce/payments/types";

export interface ProcessOrderInput {
  email: string;
  customerName?: string;
  productId?: string;
  productSlug?: string;
  variantId?: string;
  providerOrderId?: string;
  paymentProvider: PaymentProviderSlug;
  amount: number;
  currency: string;
  locale: string;
  customerCountry?: string | null;
  channelId?: string | null;
}

/**
 * Process a completed payment.
 *
 * Order, AccessGrant and every post-purchase effect are committed together:
 * the outbox rows are durable even when SMTP, analytics or notification
 * providers are unavailable immediately after checkout.
 */
export async function processOrder(input: ProcessOrderInput): Promise<void> {
  const {
    email,
    customerName,
    productId: directProductId,
    productSlug,
    variantId,
    providerOrderId,
    paymentProvider,
    amount,
    currency,
    locale,
    channelId,
  } = input;

  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        name: customerName ?? email.split("@")[0],
        preferredLocale: localeToLanguage(locale),
      },
    });
  }

  let product = directProductId
    ? await prisma.product.findUnique({ where: { id: directProductId } })
    : null;
  if (!product && productSlug) {
    product = await prisma.product.findUnique({ where: { slug: productSlug } });
  }
  if (!product && variantId) {
    product = await prisma.product.findFirst({
      where: { lemonVariantId: variantId },
    });
  }
  if (!product) {
    console.error(
      `[OrderService] Product not found — directId: ${directProductId ?? "—"}, slug: ${productSlug ?? "—"}, variantId: ${variantId ?? "—"}`,
    );
    throw new NotFoundError("Product not resolvable from provided identifiers");
  }

  if (providerOrderId) {
    const existing = await prisma.order.findFirst({
      where: { paymentProvider, providerOrderId },
    });
    if (existing) {
      console.log(`[OrderService] Order ${providerOrderId} already exists, skipping`);
      return;
    }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const courseUrl = `${appUrl}/${locale}/${product.slug}/portal`;
  const ebookDownloadUrl = `${appUrl}/dashboard`;

  await prisma.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        userId: user.id,
        productId: product.id,
        paymentProvider,
        providerOrderId: providerOrderId ?? null,
        amount,
        currency,
        locale,
        status: "completed",
      },
    });

    await tx.accessGrant.upsert({
      where: {
        sourceType_sourceId_productId: {
          sourceType: "order",
          sourceId: order.id,
          productId: order.productId,
        },
      },
      create: {
        userId: order.userId,
        productId: order.productId,
        sourceType: "order",
        sourceId: order.id,
        status: "active",
      },
      update: {},
    });

    const eventKey = `${paymentProvider}:${providerOrderId ?? order.id}`;
    await tx.outboxEvent.createMany({
      data: [
        {
          eventKey: `${eventKey}:email`,
          type: "purchase_email",
          payload: {
            email,
            productSlug: product.slug,
            courseUrl,
            locale,
            ebookDownloadUrl,
          },
        },
        {
          eventKey: `${eventKey}:analytics`,
          type: "purchase_analytics",
          payload: {
            productSlug: product.slug,
            userId: user.id,
            channelId: channelId ?? null,
            provider: paymentProvider,
            amount,
            currency,
            ...(providerOrderId ? { providerOrderId } : {}),
          },
        },
        {
          eventKey: `${eventKey}:notification`,
          type: "purchase_notification",
          payload: {
            recipientId: user.id,
            entityId: order.id,
            type: "new_course",
            title: "Purchase confirmed",
            body: `Your access to ${product.slug} is ready.`,
            link: courseUrl,
          },
        },
        {
          eventKey: `${eventKey}:abandoned-recovery`,
          type: "purchase_abandoned_recovery",
          payload: {
            email,
            productId: product.id,
          },
        },
      ],
    });
  });

  console.log(
    `[OrderService] Order created: user=${user.id}, product=${product.slug}, provider=${paymentProvider}`,
  );
}
