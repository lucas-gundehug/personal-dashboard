import { createFileRoute } from "@tanstack/react-router";
import { isAuthedToken, tokenFromRequest } from "@/lib/auth";
import type { PlanSession } from "@/lib/workout-plan";
import { getWorkoutPlan, savePlan } from "@/lib/workout-store";

function isValidPlan(body: unknown): body is PlanSession[] {
  return (
    Array.isArray(body) &&
    body.every(
      (s) =>
        s &&
        typeof s.label === "string" &&
        (s.kind === "run" || s.kind === "strength") &&
        Array.isArray(s.exercises) &&
        s.exercises.every(
          (e: unknown) =>
            e !== null &&
            typeof e === "object" &&
            typeof (e as { label?: unknown }).label === "string" &&
            typeof (e as { detailTemplate?: unknown }).detailTemplate === "string",
        ),
    )
  );
}

// Same login-token gate as workout.ts — this only ever opens from the edit
// screen reached off /workout.
export const Route = createFileRoute("/api/public/workout-plan")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isAuthedToken(tokenFromRequest(request)))) {
          return Response.json({ error: "unauthorized" }, { status: 401 });
        }
        const sessions = await getWorkoutPlan();
        return Response.json({ sessions }, { headers: { "Cache-Control": "no-store" } });
      },
      PUT: async ({ request }) => {
        if (!(await isAuthedToken(tokenFromRequest(request)))) {
          return Response.json({ error: "unauthorized" }, { status: 401 });
        }
        const body = await request.json().catch(() => null);
        if (!isValidPlan(body)) {
          return Response.json({ error: "invalid_body" }, { status: 400 });
        }
        const sessions = await savePlan(body);
        return Response.json({ sessions });
      },
    },
  },
});
