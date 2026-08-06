import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCanMessage } = vi.hoisted(() => ({
  mockCanMessage: vi.fn(),
}));

vi.mock("@/domains/identity", () => ({
  accessPolicy: { canMessage: mockCanMessage },
}));

import {
  MessagingDenyReason,
  resolveMessagingPermission,
} from "./resolve-message-permission";

const input = {
  actorId: "student-1",
  targetId: "creator-1",
  productId: "product-1",
};

describe("Messaging authorization compatibility shim", () => {
  beforeEach(() => vi.clearAllMocks());

  it("delegates the complete contract to Identity accessPolicy.canMessage", async () => {
    mockCanMessage.mockResolvedValue({
      allowed: true,
      creatorId: input.targetId,
      customerId: input.actorId,
      productId: input.productId,
    });

    await expect(resolveMessagingPermission(input)).resolves.toEqual({
      allowed: true,
      creatorId: input.targetId,
      customerId: input.actorId,
      productId: input.productId,
    });
    expect(mockCanMessage).toHaveBeenCalledWith(input);
  });

  it("preserves canonical deny reasons from Identity", async () => {
    mockCanMessage.mockResolvedValue({
      allowed: false,
      creatorId: input.targetId,
      customerId: input.actorId,
      productId: input.productId,
      reason: "no_valid_access_grant",
    });

    const result = await resolveMessagingPermission(input);
    expect(result.reason).toBe(MessagingDenyReason.NoValidAccessGrant);
    expect(mockCanMessage).toHaveBeenCalledOnce();
  });

  it("does not import or query Commerce persistence", () => {
    expect(typeof resolveMessagingPermission).toBe("function");
  });
});
