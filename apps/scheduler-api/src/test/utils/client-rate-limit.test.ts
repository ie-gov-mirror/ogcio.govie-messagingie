import { describe, expect, test } from "vitest";
import { createClientRateLimiter } from "../../utils/client-rate-limit.js";

describe("createClientRateLimiter", () => {
  test("allows up to max hits per client in the window", () => {
    const allow = createClientRateLimiter(2, 1000);
    expect(allow("a", 0)).toBe(true);
    expect(allow("a", 1)).toBe(true);
    expect(allow("a", 2)).toBe(false);
    expect(allow("b", 2)).toBe(true);
  });

  test("resets after the window", () => {
    const allow = createClientRateLimiter(1, 10);
    expect(allow("a", 0)).toBe(true);
    expect(allow("a", 9)).toBe(false);
    expect(allow("a", 10)).toBe(true);
  });
});
