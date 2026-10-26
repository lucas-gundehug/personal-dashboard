import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __clearAccessCodeOverrideForTests,
  buildAuthToken,
  checkAccessCode,
  isAuthedToken,
  setAccessCode,
  tokenFromRequest,
} from "./auth";

const ORIGINAL_CODE = process.env.DASHBOARD_ACCESS_CODE;

afterEach(() => {
  process.env.DASHBOARD_ACCESS_CODE = ORIGINAL_CODE;
  __clearAccessCodeOverrideForTests();
});

describe("checkAccessCode", () => {
  it("refuses every code when DASHBOARD_ACCESS_CODE is not set", async () => {
    delete process.env.DASHBOARD_ACCESS_CODE;
    expect(await checkAccessCode("1234")).toBe(false);
    expect(await checkAccessCode("0000")).toBe(false);
    expect(await checkAccessCode("")).toBe(false);
  });

  it("uses DASHBOARD_ACCESS_CODE when set", async () => {
    process.env.DASHBOARD_ACCESS_CODE = "4821";
    expect(await checkAccessCode("4821")).toBe(true);
    expect(await checkAccessCode("4822")).toBe(false);
  });

  it("rejects codes of the wrong length instead of throwing", async () => {
    process.env.DASHBOARD_ACCESS_CODE = "4321";
    expect(await checkAccessCode("43210")).toBe(false);
    expect(await checkAccessCode("")).toBe(false);
  });
});

describe("setAccessCode", () => {
  it("overrides the env var once set, without touching the env var itself", async () => {
    process.env.DASHBOARD_ACCESS_CODE = "4321";
    await setAccessCode("9999");
    expect(await checkAccessCode("4321")).toBe(false);
    expect(await checkAccessCode("9999")).toBe(true);
    expect(process.env.DASHBOARD_ACCESS_CODE).toBe("4321");
  });

  it("rotating the code invalidates tokens signed under the old one", async () => {
    process.env.DASHBOARD_ACCESS_CODE = "1234";
    const oldToken = await buildAuthToken();
    await setAccessCode("5678");
    expect(await isAuthedToken(oldToken)).toBe(false);
    const newToken = await buildAuthToken();
    expect(await isAuthedToken(newToken)).toBe(true);
  });
});

describe("buildAuthToken / isAuthedToken", () => {
  it("round-trips: a freshly built token is valid", async () => {
    process.env.DASHBOARD_ACCESS_CODE = "4821";
    const token = await buildAuthToken();
    expect(await isAuthedToken(token)).toBe(true);
  });

  it("rejects missing, empty, or malformed tokens", async () => {
    expect(await isAuthedToken(null)).toBe(false);
    expect(await isAuthedToken(undefined)).toBe(false);
    expect(await isAuthedToken("")).toBe(false);
    expect(await isAuthedToken("no-dot-here")).toBe(false);
  });

  it("rejects every token when no access code is configured, even one signed with an empty key", async () => {
    delete process.env.DASHBOARD_ACCESS_CODE;
    const payload = `ok:${Date.now() + 60_000}`;
    const forged = `${payload}.${createHmac("sha256", "").update(payload).digest("hex")}`;
    expect(await isAuthedToken(forged)).toBe(false);
  });

  it("rejects a tampered signature", async () => {
    process.env.DASHBOARD_ACCESS_CODE = "4821";
    const token = await buildAuthToken();
    const [payload] = token.split(".");
    expect(await isAuthedToken(`${payload}.deadbeef`)).toBe(false);
  });

  it("rejects a token signed under a different access code", async () => {
    process.env.DASHBOARD_ACCESS_CODE = "1111";
    const tokenForOldCode = await buildAuthToken();
    process.env.DASHBOARD_ACCESS_CODE = "2222";
    expect(await isAuthedToken(tokenForOldCode)).toBe(false);
  });

  it("rejects a token past its expiry", async () => {
    process.env.DASHBOARD_ACCESS_CODE = "4821";
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2020-01-01T00:00:00Z"));
      const token = await buildAuthToken();
      expect(await isAuthedToken(token)).toBe(true);

      vi.setSystemTime(new Date("2020-01-03T00:00:00Z"));
      expect(await isAuthedToken(token)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("tokenFromRequest", () => {
  it("extracts the token from a Bearer authorization header", () => {
    const req = new Request("https://example.com", {
      headers: { Authorization: "Bearer abc.123" },
    });
    expect(tokenFromRequest(req)).toBe("abc.123");
  });

  it("returns null when there's no authorization header, or it's not Bearer", () => {
    expect(tokenFromRequest(new Request("https://example.com"))).toBeNull();
    expect(
      tokenFromRequest(
        new Request("https://example.com", { headers: { Authorization: "Basic abc" } }),
      ),
    ).toBeNull();
  });
});
