import { createFileRoute } from "@tanstack/react-router";
import { isAuthedToken, tokenFromRequest } from "@/lib/auth";
import { GAMES, getAllHighscores, submitHighscore, type Game } from "@/lib/highscore-store";

// Behind the same login token as the dashboard itself, since the games only
// ever open from there — not something meant to be publicly writable.
export const Route = createFileRoute("/api/public/highscores")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isAuthedToken(tokenFromRequest(request)))) {
          return Response.json({ error: "unauthorized" }, { status: 401 });
        }
        // Each game (snake/2048/tetris) fetches the same full scores object
        // independently on mount — this lets the browser dedupe those into
        // one Redis read instead of three when they mount close together.
        return Response.json(
          { scores: await getAllHighscores() },
          { headers: { "Cache-Control": "private, max-age=10" } },
        );
      },
      POST: async ({ request }) => {
        if (!(await isAuthedToken(tokenFromRequest(request)))) {
          return Response.json({ error: "unauthorized" }, { status: 401 });
        }
        const body = await request
          .json()
          .catch(() => null as { game?: string; score?: number } | null);
        const game = body?.game;
        const score = Number(body?.score);
        if (!GAMES.includes(game as Game) || !Number.isFinite(score)) {
          return Response.json({ error: "invalid_body" }, { status: 400 });
        }
        const best = await submitHighscore(game as Game, score);
        return Response.json({ best });
      },
    },
  },
});
