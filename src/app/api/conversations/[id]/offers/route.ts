// src/app/api/conversations/[id]/offers/route.ts
//
// Phase 4 — Send an Offer Card inside an existing DM conversation.
//
// Thin route per ADR-0016:
//   1. auth + load authorized conversation
//   2. validate body
//   3. build OfferCardDraft
//   4. call sendOfferCard use case
//   5. create a Message carrying the offerCardId
//   6. return 201 with the created offer card

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/supabase/get-user";
import { withRateLimit } from "@/lib/utils/rate-limit";
import { apiErrorResponse } from "@/lib/errors";
import { loadAuthorizedConversation } from "@/lib/messaging/load-authorized-conversation";
import { createMessageAndNotify } from "@/lib/messaging/create-message";
import { sendOfferCard } from "@/domains/messaging/offer-card/send-offer-card";
import { prismaOfferEligibilityAdapter } from "@/domains/messaging/offer-card/prisma-offer-eligibility-adapter";
import { prismaOfferCardRepository } from "@/domains/messaging/offer-card/prisma-offer-card-repository";
import { asCreatorId, asProductId, asRecipientId } from "@/domains/messaging/offer-card/offer-card-types";

const postBodySchema = z.object({
  productId: z.string().min(1),
  amountCents: z.number().int().nonnegative(),
  currency: z.string().min(3).max(3).toLowerCase(),
  reason: z.enum([
    "free_course_completion",
    "creator_recommendation",
    "watchlist_reminder",
    "topic_match",
    "cohort_pattern",
  ] as const),
  coupon: z
    .object({
      code: z.string().min(1),
      type: z.enum(["percent", "fixed"]),
      value: z.number().int().nonnegative(),
      expiresAt: z.string().datetime().optional(),
    })
    .optional(),
});

const PLACEHOLDER_MESSAGE = "Ti ho inviato un'offerta speciale.";

/**
 * POST /api/conversations/[id]/offers
 *
 * Body: { productId, amountCents, currency, reason, coupon? }
 *
 * Auth pipeline:
 *   1. getServerUser (401 anon)
 *   2. loadAuthorizedConversation (404/403)
 *   3. eligibility policy (7 rules)
 *   4. persist OfferCard + create Message with offerCardId
 *
 * Response: 201 with { offerCard }
 */
export const POST = withRateLimit(async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user, dbUser } = await getServerUser();
    if (!user?.email || !dbUser) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    const { id: conversationId } = await params;

    const { conversation, partnerId } = await loadAuthorizedConversation(
      dbUser.id,
      conversationId,
    );

    const body = await request.json().catch(() => ({}));
    const parsed = postBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Body non valido", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const { productId, amountCents, currency, reason, coupon } = parsed.data;

    const result = await sendOfferCard(
      {
        draft: {
          creatorId: asCreatorId(dbUser.id),
          recipientId: asRecipientId(partnerId),
          conversationProductId: asProductId(conversation.productId),
          productId: asProductId(productId),
          localizedPrice: { currency, amountCents },
          reason,
          coupon: coupon
            ? {
                code: coupon.code,
                type: coupon.type,
                value: coupon.value,
                expiresAt: coupon.expiresAt
                  ? new Date(coupon.expiresAt)
                  : undefined,
              }
            : undefined,
        },
        conversationId: conversation.id,
      },
      {
        eligibility: prismaOfferEligibilityAdapter,
        repo: prismaOfferCardRepository,
      },
    );

    if (!result.success) {
      return NextResponse.json(
        { error: "Offerta non autorizzata", reason: result.reason },
        { status: 403 },
      );
    }

    // Deliver the card as a DM message. The UI renders the attached
    // offerCardId as a card component, ignoring the text placeholder.
    await createMessageAndNotify({
      conversation,
      sender: {
        id: dbUser.id,
        name: dbUser.name,
        email: dbUser.email,
      },
      partnerId,
      content: PLACEHOLDER_MESSAGE,
      offerCardId: result.offerCard.id,
    });

    return NextResponse.json({ offerCard: result.offerCard }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, "Errore interno");
  }
}, "MESSAGES");
