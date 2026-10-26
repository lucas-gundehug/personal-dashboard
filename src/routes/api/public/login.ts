import { createFileRoute } from "@tanstack/react-router";
import { buildAuthToken, checkAccessCode } from "@/lib/auth";
import {
  clearAttempts,
  clientKeyFromRequest,
  isLockedOut,
  recordFailedAttempt,
} from "@/lib/login-rate-limit";

export const Route = createFileRoute("/api/public/login")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = clientKeyFromRequest(request);
        if (await isLockedOut(key)) {
          return Response.json({ ok: false, error: "locked" }, { status: 429 });
        }

        const body = await request.json().catch(() => ({}) as { code?: string });
        const code = typeof body.code === "string" ? body.code : "";

        if (!code || !(await checkAccessCode(code))) {
          await recordFailedAttempt(key);
          // Lille kunstig forsinkelse på toppen af lockouten, så et enkelt
          // forkert gæt heller ikke er helt gratis.
          await new Promise((r) => setTimeout(r, 400));
          return Response.json({ ok: false }, { status: 401 });
        }

        await clearAttempts(key);
        return Response.json({ ok: true, token: await buildAuthToken() });
      },
    },
  },
});
