import { beforeEach, describe, expect, it, vi } from "vitest";

import { canMessage } from "./can-message";
import type { AccessRepository } from "../ports/access-repository";

const PRODUCT_ID = "product-1";
const CREATOR_ID = "creator-1";
const STUDENT_ID = "student-1";

function createRepository(): AccessRepository {
  return {
    findProduct: vi.fn(),
    resolveProductId: vi.fn(),
    findProductCreator: vi.fn().mockResolvedValue(CREATOR_ID),
    isAdminUser: vi.fn().mockResolvedValue(false),
    findActiveGrant: vi.fn().mockResolvedValue({
      id: "grant-1",
      sourceType: "order",
      sourceId: "order-1",
    }),
    findLatestUserOrder: vi.fn(),
    resolvePostCheckoutSession: vi.fn(),
    findPostCheckoutOrder: vi.fn(),
  };
}

describe("Identity accessPolicy.canMessage", () => {
  let repository: AccessRepository;

  beforeEach(() => {
    repository = createRepository();
  });

  it("allows a student and creator pair with an active grant", async () => {
    await expect(
      canMessage({ actorId: STUDENT_ID, targetId: CREATOR_ID, productId: PRODUCT_ID }, { repository }),
    ).resolves.toMatchObject({
      allowed: true,
      creatorId: CREATOR_ID,
      customerId: STUDENT_ID,
      productId: PRODUCT_ID,
    });
    expect(repository.findActiveGrant).toHaveBeenCalledWith({
      userId: STUDENT_ID,
      productId: PRODUCT_ID,
    });
  });

  it("denies a student and creator pair without an active grant", async () => {
    vi.mocked(repository.findActiveGrant).mockResolvedValue(null);

    await expect(
      canMessage({ actorId: STUDENT_ID, targetId: CREATOR_ID, productId: PRODUCT_ID }, { repository }),
    ).resolves.toMatchObject({ allowed: false, reason: "no_valid_access_grant" });
  });

  it("does not query access for self-messages or non-pairs", async () => {
    await expect(
      canMessage({ actorId: STUDENT_ID, targetId: STUDENT_ID, productId: PRODUCT_ID }, { repository }),
    ).resolves.toMatchObject({ allowed: false, reason: "self_message_blocked" });

    await expect(
      canMessage({ actorId: "student-2", targetId: "student-3", productId: PRODUCT_ID }, { repository }),
    ).resolves.toMatchObject({ allowed: false, reason: "not_creator_student_pair" });

    expect(repository.findProductCreator).toHaveBeenCalledTimes(1);
    expect(repository.findActiveGrant).not.toHaveBeenCalled();
  });

  it("fails closed when the product has no creator", async () => {
    vi.mocked(repository.findProductCreator).mockResolvedValue(null);

    await expect(
      canMessage({ actorId: STUDENT_ID, targetId: CREATOR_ID, productId: PRODUCT_ID }, { repository }),
    ).resolves.toMatchObject({ allowed: false, reason: "product_not_found" });
  });
});
