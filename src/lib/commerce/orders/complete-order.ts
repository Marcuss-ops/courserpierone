import { prisma } from "@/lib/db/prisma";
import { localeToLanguage } from "@/lib/i18n/locale-resolver";
import { NotFoundError } from "@/lib/errors";
import {
  createCompletePaidOrderCommand,
  type CompletePaidOrderCommand,
} from "@/lib/commerce/payments/types";

/**
 * Process a completed payment.
 *
 * Order, AccessGrant and every post-purchase effect are committed together:
 * the outbox rows are durable even when SMTP, analytics or notification
 * providers are unavailable immediately after checkout.
 */
export async function processOrder(
  input: CompletePaidOrderCommand,
): Promise<void> {
  // Keep a runtime guard here because replay workers and JavaScript callers
  // can bypass TypeScript. The provider adapter performs the same validation
  // before dispatch, while this protects the order/grant write boundary.
  const command = createCompletePaidOrderCommand(input);
  const {
    customer: { email, name: customerName },
    product,
    providerOrderId,
    paymentProvider,
    amount,
    currency,
    locale,
    channelId,
  } = command;

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

  const resolvedProduct =
    product.kind === "product_id"
      ? await prisma.product.findUnique({ where: { id: product.value } })
      : product.kind === "product_slug"
        ? await prisma.product.findUnique({ where: { slug: product.value } })
        : await prisma.product.findFirst({
            where: { lemonVariantId: product.value },
          });

  if (!resolvedProduct) {
    console.error(
      `[OrderService] Product not found — locator: ${product.kind}:${product.value}`,
    );
    throw new NotFoundError("Product not resolvable from provided product locator");
  }

  const existing = await prisma.order.findFirst({
    where: { paymentProvider, providerOrderId },
  });
  if (existing) {
    console.log(`[OrderService] Order ${providerOrderId} already exists, skipping`);
    return;
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const courseUrl = `${appUrl}/${locale}/${resolvedProduct.slug}/portal`;
  const ebookDownloadUrl = `${appUrl}/dashboard`;

  await prisma.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        userId: user.id,
        productId: resolvedProduct.id,
        paymentProvider,
        providerOrderId,
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
            productSlug: resolvedProduct.slug,
            courseUrl,
            locale,
            ebookDownloadUrl,
          },
        },
        {
          eventKey: `${eventKey}:analytics`,
          type: "purchase_analytics",
          payload: {
            productId: resolvedProduct.id,
            productSlug: resolvedProduct.slug,
            providerProductId: resolvedProduct.lemonVariantId ?? null,
            userId: user.id,
            channelId: channelId ?? null,
            provider: paymentProvider,
            amount,
            currency,
            providerOrderId,
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
            body: `Your access to ${resolvedProduct.slug} is ready.`,
            link: courseUrl,
          },
        },
        {
          eventKey: `${eventKey}:abandoned-recovery`,
          type: "purchase_abandoned_recovery",
          payload: {
            email,
            productId: resolvedProduct.id,
          },
        },
      ],
    });
  });

  console.log(
    `[OrderService] Order created: user=${user.id}, product=${resolvedProduct.slug}, provider=${paymentProvider}`,
  );
}
