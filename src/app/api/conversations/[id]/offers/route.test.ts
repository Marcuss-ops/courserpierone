/**
 * Tests for POST /api/conversations/[id]/offers (Phase 4 — Offer Card in DMs).
 *
 * The route is a thin orchestrator over the `sendOfferCard` use case and the
 * `createMessageAndNotify` helper. We mock both to verify the route contract
 * without touching Prisma.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

// ─── Mocks ────────────────────────────────────────────────────
const mockGetServerUser = vi.fn();
vi.mock("@/lib/supabase/get-user", () => ({ getServerUser: mockGetServerUser }));

vi.mock("@/lib/utils/rate-limit", () => ({
  withRateLimit: (fn: (...args: unknown[]) => unknown) => fn,
}));

const mockLoadAuthorizedConversation = vi.fn();
vi.mock("@/lib/messaging/load-authorized-conversation", () => ({
  loadAuthorizedConversation: mockLoadAuthorizedConversation,
}));

const mockCreateMessageAndNotify = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/messaging/create-message", () => ({
  createMessageAndNotify: mockCreateMessageAndNotify,
}));

const mockSendOfferCard = vi.fn();
vi.mock("@/domains/messaging/offer-card/send-offer-card", () => ({
  sendOfferCard: mockSendOfferCard,
}));

// ─── Helpers ──────────────────────────────────────────────────
const mockAuth = (dbUser: { id: string; email: string; name?: string | null }) => {
  mockGetServerUser.mockResolvedValue({ user: { email: dbUser.email }, dbUser });
};

// Valid CUIDs required by the branded ID constructors used by the route.
const CONV_ID = "cjqfi0000000000000000001";
const PARTNER_ID = "cjqfi0000000000000000002";
const PRODUCT_ID = "cjqfi0000000000000000003";
const ME = { id: "cjqfi0000000000000000004", email: "a@test.com", name: "Mario Rossi" };

function setAuthorized({
  conversationId = CONV_ID,
  partnerId = PARTNER_ID,
  productId = PRODUCT_ID,
}: { conversationId?: string; partnerId?: string; productId?: string } = {}) {
  mockLoadAuthorizedConversation.mockReset();
  mockLoadAuthorizedConversation.mockResolvedValue({
    conversation: {
      id: conversationId,
      userOneId: ME.id,
      userTwoId: partnerId,
      productId,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    partnerId,
    productId,
  });
}

const createRequest = (url: string, init?: RequestInit): NextRequest =>
  new Request(`http://localhost${url}`, init) as unknown as NextRequest;

const validBody = {
  productId: PRODUCT_ID,
  amountCents: 4900,
  currency: "EUR",
  reason: "creator_recommendation",
};

// ─── Tests ────────────────────────────────────────────────────
describe("POST /api/conversations/[id]/offers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setAuthorized();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetServerUser.mockResolvedValue({ user: null, dbUser: null });
    const { POST } = await import("./route");
    const res = await POST(
      createRequest(`/api/conversations/${CONV_ID}/offers`, {
        method: "POST",
        body: JSON.stringify(validBody),
      }),
      { params: Promise.resolve({ id: CONV_ID }) },
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when body is invalid", async () => {
    mockAuth(ME);
    const { POST } = await import("./route");
    const res = await POST(
      createRequest(`/api/conversations/${CONV_ID}/offers`, {
        method: "POST",
        body: JSON.stringify({ productId: PRODUCT_ID }), // missing amountCents, currency, reason
      }),
      { params: Promise.resolve({ id: CONV_ID }) },
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when conversation does not exist", async () => {
    mockAuth(ME);
    const { NotFoundError } = await import("@/lib/errors");
    mockLoadAuthorizedConversation.mockReset();
    mockLoadAuthorizedConversation.mockRejectedValue(new NotFoundError("Conversazione non trovata"));
    const { POST } = await import("./route");
    const res = await POST(
      createRequest(`/api/conversations/cjqfi0000000000000000000/offers`, {
        method: "POST",
        body: JSON.stringify(validBody),
      }),
      { params: Promise.resolve({ id: "ghost" }) },
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 when user is not a participant", async () => {
    mockAuth(ME);
    const { AppError } = await import("@/lib/errors");
    mockLoadAuthorizedConversation.mockReset();
    mockLoadAuthorizedConversation.mockRejectedValue(
      new AppError("Accesso negato — non sei partecipante di questa conversazione", {
        statusCode: 403,
        code: "NOT_CONVERSATION_MEMBER",
      }),
    );
    const { POST } = await import("./route");
    const res = await POST(
      createRequest(`/api/conversations/${CONV_ID}/offers`, {
        method: "POST",
        body: JSON.stringify(validBody),
      }),
      { params: Promise.resolve({ id: CONV_ID }) },
    );
    expect(res.status).toBe(403);
  });

  it("returns 403 when eligibility denies the offer", async () => {
    mockAuth(ME);
    mockSendOfferCard.mockResolvedValue({
      success: false,
      reason: "ELIGIBILITY_USER_ALREADY_OWNS",
    });

    const { POST } = await import("./route");
    const res = await POST(
      createRequest(`/api/conversations/${CONV_ID}/offers`, {
        method: "POST",
        body: JSON.stringify(validBody),
      }),
      { params: Promise.resolve({ id: CONV_ID }) },
    );
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.reason).toBe("ELIGIBILITY_USER_ALREADY_OWNS");
    expect(mockCreateMessageAndNotify).not.toHaveBeenCalled();
  });

  it("creates message and returns 201 with the offer card", async () => {
    mockAuth(ME);
    const offerCard = {
      id: "oc_1",
      creatorId: ME.id,
      recipientId: PARTNER_ID,
      conversationProductId: PRODUCT_ID,
      productId: PRODUCT_ID,
      localizedPrice: { currency: "eur", amountCents: 4900 },
      reason: "creator_recommendation",
      status: "sent",
      linkToken: "token_123",
      sentAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      convertedAt: null,
      convertedOrderId: null,
    };
    mockSendOfferCard.mockResolvedValue({ success: true, offerCard });

    const { POST } = await import("./route");
    const res = await POST(
      createRequest(`/api/conversations/${CONV_ID}/offers`, {
        method: "POST",
        body: JSON.stringify(validBody),
      }),
      { params: Promise.resolve({ id: CONV_ID }) },
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.offerCard.id).toBe("oc_1");
    expect(mockCreateMessageAndNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        conversation: expect.objectContaining({ id: CONV_ID }),
        sender: expect.objectContaining({ id: ME.id, name: ME.name }),
        partnerId: PARTNER_ID,
        content: "Ti ho inviato un'offerta speciale.",
        offerCardId: "oc_1",
      }),
    );
    expect(mockLoadAuthorizedConversation).toHaveBeenCalledWith(ME.id, CONV_ID);
    expect(mockSendOfferCard).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: CONV_ID,
        draft: expect.objectContaining({
          creatorId: ME.id,
          recipientId: PARTNER_ID,
          conversationProductId: PRODUCT_ID,
          productId: PRODUCT_ID,
          localizedPrice: { currency: "eur", amountCents: 4900 },
          reason: "creator_recommendation",
          coupon: undefined,
        }),
      }),
      expect.anything(),
    );
  });

  it("accepts an optional coupon and forwards it to the use case", async () => {
    mockAuth(ME);
    mockSendOfferCard.mockResolvedValue({
      success: true,
      offerCard: {
        id: "oc_2",
        creatorId: ME.id,
        recipientId: PARTNER_ID,
        conversationProductId: PRODUCT_ID,
        productId: PRODUCT_ID,
        localizedPrice: { currency: "eur", amountCents: 4900 },
        reason: "creator_recommendation",
        status: "sent",
        linkToken: "token_456",
        sentAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        convertedAt: null,
        convertedOrderId: null,
      },
    });

    const { POST } = await import("./route");
    const res = await POST(
      createRequest(`/api/conversations/${CONV_ID}/offers`, {
        method: "POST",
        body: JSON.stringify({
          ...validBody,
          coupon: {
            code: "SUMMER20",
            type: "percent",
            value: 20,
            expiresAt: "2026-12-31T23:59:59.000Z",
          },
        }),
      }),
      { params: Promise.resolve({ id: CONV_ID }) },
    );

    expect(res.status).toBe(201);
    expect(mockSendOfferCard).toHaveBeenCalledWith(
      expect.objectContaining({
        draft: expect.objectContaining({
          coupon: {
            code: "SUMMER20",
            type: "percent",
            value: 20,
            expiresAt: new Date("2026-12-31T23:59:59.000Z"),
          },
        }),
      }),
      expect.anything(),
    );
  });

  it("returns 422 when productId is not a valid CUID", async () => {
    mockAuth(ME);
    const { POST } = await import("./route");
    const res = await POST(
      createRequest(`/api/conversations/${CONV_ID}/offers`, {
        method: "POST",
        body: JSON.stringify({
          ...validBody,
          productId: "not-a-cuid",
        }),
      }),
      { params: Promise.resolve({ id: CONV_ID }) },
    );
    expect(res.status).toBe(422);
  });

  it("returns 500 when sendOfferCard throws unexpectedly", async () => {
    mockAuth(ME);
    mockSendOfferCard.mockRejectedValue(new Error("DB connection lost"));

    const { POST } = await import("./route");
    const res = await POST(
      createRequest(`/api/conversations/${CONV_ID}/offers`, {
        method: "POST",
        body: JSON.stringify(validBody),
      }),
      { params: Promise.resolve({ id: CONV_ID }) },
    );

    expect(res.status).toBe(500);
  });
});
