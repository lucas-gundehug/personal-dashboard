import { describe, expect, it } from "vitest";
import { GAMES, getAllHighscores, getHighscore, submitHighscore } from "./highscore-store";

// No KV_REST_API_URL/TOKEN or UPSTASH_REDIS_REST_URL/TOKEN are set in the
// test environment, so these exercise the in-memory fallback path. The
// in-memory store is keyed by the fixed GAMES set (not a random id per
// test like login-rate-limit's Map), so assertions are written relative to
// submitHighscore's own return values instead of assuming a pristine 0.
describe("submitHighscore / getHighscore", () => {
  it("only updates the stored score on an actual improvement", async () => {
    const best = await submitHighscore("snake", (await getHighscore("snake")) + 100);
    const afterLower = await submitHighscore("snake", best - 1);
    expect(afterLower).toBe(best);
    expect(await getHighscore("snake")).toBe(best);

    const afterHigher = await submitHighscore("snake", best + 1);
    expect(afterHigher).toBe(best + 1);
    expect(await getHighscore("snake")).toBe(best + 1);
  });

  it("an equal score does not count as an improvement", async () => {
    const best = await submitHighscore("2048", (await getHighscore("2048")) + 50);
    expect(await submitHighscore("2048", best)).toBe(best);
  });

  it("games are independent — a score on one game doesn't affect another", async () => {
    const tetrisBefore = await getHighscore("tetris");
    await submitHighscore("snake", (await getHighscore("snake")) + 1);
    expect(await getHighscore("tetris")).toBe(tetrisBefore);
  });
});

describe("getAllHighscores", () => {
  it("returns an entry for every game", async () => {
    const all = await getAllHighscores();
    expect(Object.keys(all).sort()).toEqual([...GAMES].sort());
    for (const game of GAMES) {
      expect(all[game]).toBe(await getHighscore(game));
    }
  });
});
