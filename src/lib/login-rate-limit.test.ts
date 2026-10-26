import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearAttempts,
  clientKeyFromRequest,
  isLockedOut,
  recordFailedAttempt,
} from "./login-rate-limit";

afterEach(() => {
  vi.useRealTimers();
});

// No KV_REST_API_URL/TOKEN or UPSTASH_REDIS_REST_URL/TOKEN are set in the
// test environment, so these exercise the in-memory fallback path.
describe("isLockedOut / recordFailedAttempt", () => {
  it("is not locked out before the attempt threshold is hit", async () => {
    const key = crypto.randomUUID();
    for (let i = 0; i < 4; i++) await recordFailedAttempt(key);
    expect(await isLockedOut(key)).toBe(false);
  });

  it("locks out once the attempt threshold is hit", async () => {
    const key = crypto.randomUUID();
    for (let i = 0; i < 5; i++) await recordFailedAttempt(key);
    expect(await isLockedOut(key)).toBe(true);
  });

  it("keys are independent — one client's failures don't lock out another", async () => {
    const keyA = crypto.randomUUID();
    const keyB = crypto.randomUUID();
    for (let i = 0; i < 5; i++) await recordFailedAttempt(keyA);
    expect(await isLockedOut(keyA)).toBe(true);
    expect(await isLockedOut(keyB)).toBe(false);
  });

  it("lockout expires after the lockout window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2020-01-01T00:00:00Z"));
    const key = crypto.randomUUID();
    for (let i = 0; i < 5; i++) await recordFailedAttempt(key);
    expect(await isLockedOut(key)).toBe(true);

    vi.setSystemTime(new Date("2020-01-01T00:11:00Z"));
    expect(await isLockedOut(key)).toBe(false);
  });

  it("clearAttempts resets the counter", async () => {
    const key = crypto.randomUUID();
    for (let i = 0; i < 4; i++) await recordFailedAttempt(key);
    await clearAttempts(key);
    await recordFailedAttempt(key);
    expect(await isLockedOut(key)).toBe(false);
  });
});

describe("clientKeyFromRequest", () => {
  it("uses the first entry of x-forwarded-for", () => {
    const req = new Request("https://example.com", {
      headers: { "x-forwarded-for": "203.0.113.5, 10.0.0.1" },
    });
    expect(clientKeyFromRequest(req)).toBe("203.0.113.5");
  });

  it("falls back to x-real-ip when x-forwarded-for is absent", () => {
    const req = new Request("https://example.com", {
      headers: { "x-real-ip": "203.0.113.9" },
    });
    expect(clientKeyFromRequest(req)).toBe("203.0.113.9");
  });

  it("falls back to 'unknown' when neither header is present", () => {
    const req = new Request("https://example.com");
    expect(clientKeyFromRequest(req)).toBe("unknown");
  });
});
