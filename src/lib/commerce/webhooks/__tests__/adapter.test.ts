import { describe, it, expect, vi } from "vitest";
import type { NextRequest } from "next/server";
import { readWebhookRequest, newRequestId } from "@/lib/commerce/webhooks/adapter";

function makeRequest({
  body,
  signature,
  headerName = "x-signature",
}: {
  body: string;
  signature?: string | null;
  headerName?: string;
}): NextRequest {
  return {
    text: vi.fn().mockResolvedValue(body),
    headers: {
      get: (name: string) => (name === headerName ? signature ?? null : null),
    },
  } as unknown as NextRequest;
}

describe("readWebhookRequest", () => {
  it("returns rawBody + signature when header is present", async () => {
    const req = makeRequest({ body: '{"a":1}', signature: "abc123" });
    const result = await readWebhookRequest(req, {
      signatureHeader: "x-signature",
      providerSlug: "lemonsqueezy",
    });
    expect(result.rawBody).toBe('{"a":1}');
    expect(result.signature).toBe("abc123");
  });

  it("returns null signature when the header is missing", async () => {
    const req = makeRequest({ body: "{}", signature: null });
    const result = await readWebhookRequest(req, {
      signatureHeader: "x-signature",
      providerSlug: "lemonsqueezy",
    });
    expect(result.signature).toBeNull();
  });

  it("uses the configured signatureHeader name (provider-agnostic)", async () => {
    const req = makeRequest({
      body: "{}",
      signature: "sig-x",
      headerName: "x-custom",
    });
    const result = await readWebhookRequest(req, {
      signatureHeader: "x-custom",
      providerSlug: "lemonsqueezy",
    });
    expect(result.signature).toBe("sig-x");
  });

  it("reads the body once (no re-read on signature miss)", async () => {
    const req = makeRequest({ body: "long body here", signature: null });
    await readWebhookRequest(req, {
      signatureHeader: "x-signature",
      providerSlug: "lemonsqueezy",
    });
    expect(req.text).toHaveBeenCalledTimes(1);
  });
});

describe("newRequestId", () => {
  it("returns a valid UUID", () => {
    const id = newRequestId();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("returns different values on each call", () => {
    const a = newRequestId();
    const b = newRequestId();
    expect(a).not.toBe(b);
  });
});
