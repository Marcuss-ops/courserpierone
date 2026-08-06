import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { localeToLanguage } from "@/lib/i18n/locale-resolver";
import { NotFoundError } from "@/lib/errors";
import {
  createCompletePaidOrderCommand,
  type CompletePaidOrderCommand,
} from "@/lib/commerce/payments/types";

/** Read Prisma's P2002 target across its array/name representations. */
function hasUniqueTarget(error: unknown, fields: readonly string[]): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return false;
  }

  const target = error.meta?.target;
  if (Array.isArray(target)) {
    return target.length === fields.length && fields.every((field) => target.includes(field));
  }

  if (typeof target !== "string") return false;
  const normalizedFields = fields.join("_");
  return target === normalizedFields ||
    target === `User_${normalizedFields}_key` ||
    target === `Order_${normalizedFields}_key`;
}

function isUserEmailConflict(error: unknown): boolean {
  return hasUniqueTarget(error, ["email"]);
}

/** Return true only for the Order provider identity unique constraint. */
function isOrderIdempotencyConflict(error: unknown): boolean {
  return hasUniqueTarget(error, ["paymentProvider", "providerOrderId"]);
}

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

  let user;
  try {
    user = await prisma.user.upsert({
      where: { email },
      create: {
        email,
        name: customerName ?? email.split("@")[0],
        preferredLocale: localeToLanguage(locale),
      },
      update: {},
    });
  } catch (error) {
    // A concurrent upsert can still lose a unique race on providers or
    // database versions with weaker native-upsert support. Re-read the
    // winner by the same unique key; unrelated P2002 errors must propagate.
    if (!isUserEmailConflict(error)) {
      throw error;
    }
    user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw error;
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

  // Fast path for ordinary webhook retries. The unique index below remains
  // the authoritative boundary for two requests that pass this read together.
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

  try {
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

      const eventKey = `${paymentProvider}:${providerOrderId}`;
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
  } catch (error) {
    // The unique provider-order constraint is the concurrency boundary. A
    // competing webhook committed the same order, so its grant and outbox
    // rows are the canonical effects; acknowledge this delivery safely.
    if (isOrderIdempotencyConflict(error)) {
      console.log(`[OrderService] Order ${providerOrderId} won by a concurrent webhook, skipping`);
      return;
    }
    throw error;
  }

  console.log(
    `[OrderService] Order created: user=${user.id}, product=${resolvedProduct.slug}, provider=${paymentProvider}`,
  );
}
