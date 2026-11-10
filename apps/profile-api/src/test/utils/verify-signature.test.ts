import type * as Crypto from "node:crypto";
import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { verifySignature } from "~/utils/verify-signature.js";

const timingSafeEqual = vi.hoisted(() => vi.fn());
vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof Crypto>();
  timingSafeEqual.mockImplementation(actual.timingSafeEqual);
  return { ...actual, default: actual, timingSafeEqual };
});

describe("verifySignature", () => {
  const signingKey = "test-secret-key";

  // Helper to generate test signatures
  const generateSignature = (key: string, payload: Buffer): string => {
    const hmac = createHmac("sha256", key);
    hmac.update(payload);
    return hmac.digest("hex");
  };

  it("should verify valid signature", () => {
    const payload = Buffer.from('{"test":"data"}');
    const signature = generateSignature(signingKey, payload);

    const result = verifySignature(signingKey, payload, signature);

    expect(result).toBe(true);
  });

  it("should reject invalid signature", () => {
    const payload = Buffer.from('{"test":"data"}');
    const invalidSignature = "invalid-signature";

    const result = verifySignature(signingKey, payload, invalidSignature);

    expect(result).toBe(false);
  });

  it("should be sensitive to payload changes", () => {
    const payload1 = Buffer.from('{"test":"data1"}');
    const payload2 = Buffer.from('{"test":"data2"}');
    const signature = generateSignature(
      signingKey,
      Buffer.from('{"test":"data"}'),
    );

    expect(verifySignature(signingKey, payload1, signature)).toBe(false);
    expect(verifySignature(signingKey, payload2, signature)).toBe(false);
  });

  it("should be sensitive to signing key changes", () => {
    const payload = Buffer.from('{"test":"data"}');
    const signature = generateSignature(signingKey, payload);

    const result = verifySignature("different-key", payload, signature);

    expect(result).toBe(false);
  });

  it("compares a same-length signature in constant time", () => {
    const payload = Buffer.from('{"test":"data"}');
    const signature = generateSignature(signingKey, payload);
    const tampered = `${signature.slice(0, -1)}${signature.endsWith("0") ? "1" : "0"}`;
    timingSafeEqual.mockClear();

    expect(verifySignature(signingKey, payload, tampered)).toBe(false);
    expect(timingSafeEqual).toHaveBeenCalledOnce();
  });

  it("should handle empty payload", () => {
    const payload = Buffer.from("");
    const signature = generateSignature(signingKey, payload);

    const result = verifySignature(signingKey, payload, signature);

    expect(result).toBe(true);
  });
});
