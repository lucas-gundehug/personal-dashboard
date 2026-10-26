import { afterEach, describe, expect, it } from "vitest";
import { __clearAccessCodeOverrideForTests } from "@/lib/auth";
import { Route } from "./login";

type PostHandler = (ctx: { request: Request }) => Promise<Response>;
const POST = (Route.options as unknown as { server: { handlers: { POST: PostHandler } } }).server
  .handlers.POST;

const ORIGINAL_CODE = process.env.DASHBOARD_ACCESS_CODE;

afterEach(() => {
  process.env.DASHBOARD_ACCESS_CODE = ORIGINAL_CODE;
  __clearAccessCodeOverrideForTests();
});

// A fresh client address per call, so the rate limiter never kicks in here.
function login(code: string) {
  return POST({
    request: new Request("https://example.com/api/public/login", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": crypto.randomUUID() },
      body: JSON.stringify({ code }),
    }),
  });
}

describe("POST /api/public/login", () => {
  it("returns a token for the right code", async () => {
    process.env.DASHBOARD_ACCESS_CODE = "4821";
    const res = await login("4821");
    expect(res.status).toBe(200);
    expect((await res.json()).token).toEqual(expect.any(String));
  });

  it("refuses a wrong code with 401 and no token", async () => {
    process.env.DASHBOARD_ACCESS_CODE = "4821";
    const res = await login("9999");
    expect(res.status).toBe(401);
    expect((await res.json()).token).toBeUndefined();
  });

  it("refuses every code with 401 (not a crash) when no access code is configured", async () => {
    delete process.env.DASHBOARD_ACCESS_CODE;
    const res = await login("1234");
    expect(res.status).toBe(401);
  });
});
