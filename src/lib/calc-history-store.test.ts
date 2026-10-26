import { describe, expect, it } from "vitest";
import { addCalcHistoryEntry, getCalcHistory } from "./calc-history-store";

// No KV_REST_API_URL/TOKEN or UPSTASH_REDIS_REST_URL/TOKEN are set in the
// test environment, so these exercise the in-memory fallback path. The
// in-memory list is a single module-level array (not keyed), so entries
// use crypto.randomUUID() to stay distinguishable from whatever earlier
// tests in this file already added.
describe("addCalcHistoryEntry / getCalcHistory", () => {
  it("puts the newest entry first", async () => {
    const entry = { id: crypto.randomUUID() };
    const history = await addCalcHistoryEntry(entry);
    expect(history[0]).toEqual(entry);
    expect((await getCalcHistory())[0]).toEqual(entry);
  });

  it("caps history at 5 entries, newest first", async () => {
    const entries = Array.from({ length: 6 }, () => ({ id: crypto.randomUUID() }));
    let history: unknown[] = [];
    for (const entry of entries) {
      history = await addCalcHistoryEntry(entry);
    }
    expect(history.length).toBeLessThanOrEqual(5);
    const expectedNewestFirst = [...entries].reverse().slice(0, history.length);
    expect(history).toEqual(expectedNewestFirst);
  });
});
