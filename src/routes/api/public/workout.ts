import { createFileRoute } from "@tanstack/react-router";
import { isAuthedToken, tokenFromRequest } from "@/lib/auth";
import { DIFFICULTIES, type Difficulty } from "@/lib/workout-plan";
import {
  getWeekCompletedCount,
  getWeekView,
  setExerciseRating,
  setSessionCompleted,
} from "@/lib/workout-store";

// Behind the same login token as the dashboard itself — same reasoning as
// highscores.ts, this only ever opens from there.
function isValidWeek(week: unknown): week is string {
  return typeof week === "string" && /^\d{4}-W\d{2}$/.test(week);
}

export const Route = createFileRoute("/api/public/workout")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isAuthedToken(tokenFromRequest(request)))) {
          return Response.json({ error: "unauthorized" }, { status: 401 });
        }
        const params = new URL(request.url).searchParams;
        const week = params.get("week");
        if (!isValidWeek(week)) {
          return Response.json({ error: "invalid_week" }, { status: 400 });
        }
        // Unlike highscores.ts, this can't tolerate a few stale seconds — a
        // cached read right after a check/uncheck would show the previous
        // value, and the client-side merge only ever turns boxes on, so a
        // stale "false" reappearing as "true" would silently revert an
        // uncheck. Always fetch fresh.
        //
        // summary=1 is used by the heatmap's past-weeks lookups — see
        // getWeekCompletedCount's own comment for why those must never run
        // the full week view.
        if (params.get("summary") === "1") {
          const completedCount = await getWeekCompletedCount(week);
          return Response.json({ completedCount }, { headers: { "Cache-Control": "no-store" } });
        }
        const sessions = await getWeekView(week);
        return Response.json({ sessions }, { headers: { "Cache-Control": "no-store" } });
      },
      POST: async ({ request }) => {
        if (!(await isAuthedToken(tokenFromRequest(request)))) {
          return Response.json({ error: "unauthorized" }, { status: 401 });
        }
        const body = await request.json().catch(
          () =>
            null as {
              week?: string;
              sessionId?: string;
              completed?: boolean;
              exerciseId?: string;
              difficulty?: string;
            } | null,
        );
        const week = body?.week;
        if (!isValidWeek(week)) {
          return Response.json({ error: "invalid_week" }, { status: 400 });
        }

        // Two independent action shapes on one endpoint: complete/uncheck a
        // session, or rate an exercise. Exactly one of the two id fields is
        // expected per request.
        if (typeof body?.sessionId === "string" && typeof body?.completed === "boolean") {
          await setSessionCompleted(week, body.sessionId, body.completed);
        } else if (
          typeof body?.exerciseId === "string" &&
          (DIFFICULTIES as readonly string[]).includes(body?.difficulty as string)
        ) {
          await setExerciseRating(week, body.exerciseId, body.difficulty as Difficulty);
        } else {
          return Response.json({ error: "invalid_body" }, { status: 400 });
        }

        const sessions = await getWeekView(week);
        return Response.json({ sessions });
      },
    },
  },
});
