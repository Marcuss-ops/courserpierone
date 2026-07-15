import { describe, it, expect, vi } from "vitest";
import { readWebhookRequest, newRequestId } from "../adapter";

// Minimal NextRequest-shaped double that exposes the .text() + .headers API
// the adapter uses. Plain object: we don't import next/server in unit tests.
function mockRequest(body: string, signature: string | null) {
  return {
    text: vi.fn().mockResolvedValue(body),
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "x-signature" ? signature : null,
    },
  };
}

describe("readWebhookRequest", () => {
  it("returns rawBody and signature when header is present", async () => {
    const req = mockRequest('{"a":1}', "abc123");
    const out = await readWebhookRequest(req as never, {
      signatureHeader: "x-signature",
      providerSlug: "lemonsqueezy",
    });
    expect(out.rawBody).toBe('{"a":1}');
    expect(out.signature).toBe("abc123");
    expect(req.text).toHaveBeenCalledTimes(1);
  });

  it("returns signature: null when header is absent", async () => {
    const req = mockRequest('{"a":1}', null);
    const out = await readWebhookRequest(req as never, {
      signatureHeader: "x-signature",
      providerSlug: "lemonsqueezy",
    });
    expect(out.signature).toBeNull();
  });

  it("returns empty body when request is empty", async () => {
    const req = mockRequest("", null);
    const out = await readWebhookRequest(req as never, {
      signatureHeader: "x-signature",
      providerSlug: "lemonsqueezy",
    });
    expect(out.rawBody).toBe("");
  });

  it("calls text() exactly once (no re-read downstream)", async () => {
    const req = mockRequest('{"x":1}', "sig");
    await readWebhookRequest(req as never, {
      signatureHeader: "x-signature",
      providerSlug: "lemonsqueezy",
    });
    expect(req.text).toHaveBeenCalledTimes(1);
  });
});

describe("newRequestId", () => {
  it("returns unique ids each call", () => {
    const a = newRequestId();
    const b = newRequestId();
    expect(a).not.toEqual(b);
    expect(a).toMatch(/^[0-9a-f-]{36}$/);
  });
});
