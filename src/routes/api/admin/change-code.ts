import { createFileRoute } from "@tanstack/react-router";
import { isAuthedServiceRequest } from "@/lib/admin-auth-service";
import { setAccessCode } from "@/lib/auth";
import {
  clearAttempts,
  clientKeyFromRequest,
  isLockedOut,
  recordFailedAttempt,
} from "@/lib/login-rate-limit";

// Service-secret-gated only — there's no browser session to check here.
// The owner never logs into a "dashboard-admin" panel directly; only the
// companion housekeeping app calls this, on their behalf, after they've
// already authenticated there.
export const Route = createFileRoute("/api/admin/change-code")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthedServiceRequest(request)) {
          return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
        }

        const key = `changecode:service:${clientKeyFromRequest(request)}`;
        if (await isLockedOut(key)) {
          return Response.json({ ok: false, error: "locked" }, { status: 429 });
        }

        const body = await request.json().catch(() => ({}) as { newCode?: string });
        const newCode = typeof body.newCode === "string" ? body.newCode : "";

        if (!/^\d{4}$/.test(newCode)) {
          await recordFailedAttempt(key);
          return Response.json({ ok: false, error: "invalid_code" }, { status: 400 });
        }

        await clearAttempts(key);
        await setAccessCode(newCode);
        return Response.json({ ok: true });
      },
    },
  },
});
