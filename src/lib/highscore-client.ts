// Thin client-side wrapper around /api/public/highscores. Failures are
// swallowed on purpose — a highscore sync hiccup shouldn't interrupt a game.
export async function fetchServerHighscore(
  game: string,
  authHeaders: HeadersInit,
): Promise<number | null> {
  try {
    const res = await fetch("/api/public/highscores", { headers: authHeaders });
    if (!res.ok) return null;
    const data = await res.json();
    const value = data?.scores?.[game];
    return typeof value === "number" ? value : null;
  } catch {
    return null;
  }
}

export function submitServerHighscore(game: string, score: number, authHeaders: HeadersInit): void {
  fetch("/api/public/highscores", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify({ game, score }),
  }).catch(() => {});
}
