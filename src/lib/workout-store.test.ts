import { describe, expect, it } from "vitest";
import { getIsoWeekKey } from "@/lib/workout-plan";
import {
  getWeekCompletedCount,
  getWeekView,
  getWorkoutPlan,
  savePlan,
  setExerciseRating,
  setSessionCompleted,
} from "./workout-store";

// No SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY are set in the test environment,
// so these exercise the in-memory fallback path. getWeekView tests each use
// their own randomly-generated week key so the shared in-memory completion/
// rating maps never leak state between tests.
function randomWeek() {
  return `2099-${crypto.randomUUID()}`;
}

// Progression/deload tests instead need real, consecutive ISO week keys
// (getWeekView looks up the *previous* week via getPreviousIsoWeekKey) — and
// since exercise_progression state is keyed by exercise id (a small, fixed
// set in the in-memory fallback), each test uses its own dedicated exercise
// plus its own year, so no two tests can collide even though the in-memory
// store persists across tests in the same run.
function weekKeys(startYear: number, count: number): string[] {
  const start = new Date(Date.UTC(startYear, 0, 15)); // mid-January: comfortably clear of any W1/W53 boundary weirdness
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i * 7);
    return getIsoWeekKey(d);
  });
}

async function findExercise(label: string) {
  const plan = await getWorkoutPlan();
  for (const session of plan) {
    const exercise = session.exercises.find((e) => e.label === label);
    if (exercise) return { session, exercise };
  }
  throw new Error(`fixture exercise not found: ${label}`);
}

describe("getWorkoutPlan", () => {
  it("has a seeded default plan with runs and strength sessions", async () => {
    const plan = await getWorkoutPlan();
    expect(plan.filter((s) => s.kind === "run")).toHaveLength(3);
    expect(plan.filter((s) => s.kind === "strength")).toHaveLength(3);
    expect(plan.every((s) => s.exercises.length > 0)).toBe(true);
  });
});

describe("getWeekView / setSessionCompleted", () => {
  it("an unset week has every session incomplete", async () => {
    const week = randomWeek();
    const sessions = await getWeekView(week);
    expect(sessions.every((s) => !s.completed)).toBe(true);
  });

  it("completing a session persists it for that week", async () => {
    const week = randomWeek();
    const { session } = await findExercise("Håndvægt-gulvpres");
    await setSessionCompleted(week, session.id, true);
    const sessions = await getWeekView(week);
    expect(sessions.find((s) => s.id === session.id)?.completed).toBe(true);
  });

  it("weeks are independent — completing one week doesn't affect another", async () => {
    const weekA = randomWeek();
    const weekB = randomWeek();
    const { session } = await findExercise("Håndvægt-roning");
    await setSessionCompleted(weekA, session.id, true);
    const sessionsB = await getWeekView(weekB);
    expect(sessionsB.find((s) => s.id === session.id)?.completed).toBe(false);
  });

  it("getWeekCompletedCount matches the number of completed sessions", async () => {
    const week = randomWeek();
    const { session: s1 } = await findExercise("Håndvægt-gulvpres");
    const { session: s2 } = await findExercise("Håndvægt-roning");
    await setSessionCompleted(week, s1.id, true);
    await setSessionCompleted(week, s2.id, true);
    expect(await getWeekCompletedCount(week)).toBe(2);
  });
});

describe("setExerciseRating", () => {
  it("a rating is independent per exercise, and doesn't require completing the session", async () => {
    const week = randomWeek();
    const { exercise: gulvpres } = await findExercise("Håndvægt-gulvpres");
    const { exercise: planke } = await findExercise("Planke");
    await setExerciseRating(week, gulvpres.id, "hard");
    const sessions = await getWeekView(week);
    const session = sessions.find((s) => s.exercises.some((e) => e.id === gulvpres.id))!;
    expect(session.exercises.find((e) => e.id === gulvpres.id)?.difficulty).toBe("hard");
    expect(session.exercises.find((e) => e.id === planke.id)?.difficulty).toBeUndefined();
  });
});

describe("getWeekView progression", () => {
  it("starts at 0 with no history, and bumps up after each 'easy' week, capped at 10", async () => {
    const weeks = weekKeys(2090, 13);
    const { exercise } = await findExercise("Håndvægt-gulvflyes");

    const first = await getWeekView(weeks[0]);
    expect(stepOf(first, exercise.id)).toBe(0);

    for (let i = 1; i < weeks.length; i++) {
      await setExerciseRating(weeks[i - 1], exercise.id, "easy");
      await getWeekView(weeks[i]);
    }
    // 12 easy weeks folded in one at a time — capped at 10, not 12.
    const last = await getWeekView(weeks[weeks.length - 1]);
    expect(stepOf(last, exercise.id)).toBe(10);
  });

  it("eases the step down after a 'hard' week (floored at 0), applying each week's rating only once", async () => {
    const weeks = weekKeys(2091, 4);
    const { exercise } = await findExercise("Brede armstrækninger");

    await setExerciseRating(weeks[0], exercise.id, "easy");
    expect(stepOf(await getWeekView(weeks[1]), exercise.id)).toBe(1);
    expect(stepOf(await getWeekView(weeks[1]), exercise.id)).toBe(1); // re-read within the same week: idempotent

    await setExerciseRating(weeks[1], exercise.id, "hard");
    expect(stepOf(await getWeekView(weeks[2]), exercise.id)).toBe(0);

    await setExerciseRating(weeks[2], exercise.id, "hard");
    expect(stepOf(await getWeekView(weeks[3]), exercise.id)).toBe(0); // floored, not negative

    // weeks[2]'s rating was already folded into weeks[3]'s step — changing
    // it after the fact must not retroactively change that step on a later
    // re-read of the same (already-advanced-to) week.
    await setExerciseRating(weeks[2], exercise.id, "easy");
    expect(stepOf(await getWeekView(weeks[3]), exercise.id)).toBe(0);
  });

  it("holds steady after an 'ok' week or a week with no rating at all", async () => {
    const weeks = weekKeys(2092, 3);
    const { exercise } = await findExercise("Håndvægt-pullover (liggende)");

    await setExerciseRating(weeks[0], exercise.id, "ok");
    expect(stepOf(await getWeekView(weeks[1]), exercise.id)).toBe(0);

    // weeks[1] never gets a rating (exercise skipped entirely) — still holds.
    expect(stepOf(await getWeekView(weeks[2]), exercise.id)).toBe(0);
  });
});

describe("deload flag", () => {
  it("flags an exercise after 3 straight 'hard' weeks", async () => {
    const weeks = weekKeys(2093, 4);
    const { exercise } = await findExercise("Mavebøjninger");
    await setExerciseRating(weeks[0], exercise.id, "hard");
    await setExerciseRating(weeks[1], exercise.id, "hard");
    await setExerciseRating(weeks[2], exercise.id, "hard");
    const view = await getWeekView(weeks[3]);
    expect(deloadOf(view, exercise.id)).toBe(true);
  });

  it("does not flag a mix of ratings", async () => {
    const weeks = weekKeys(2094, 4);
    const { exercise } = await findExercise("Hængende benløft");
    await setExerciseRating(weeks[0], exercise.id, "hard");
    await setExerciseRating(weeks[1], exercise.id, "ok");
    await setExerciseRating(weeks[2], exercise.id, "hard");
    const view = await getWeekView(weeks[3]);
    expect(deloadOf(view, exercise.id)).toBe(false);
  });
});

describe("deload hold", () => {
  it("holds the step steady on the week a fresh 3-hard streak completes, then resumes normal -1 if it continues", async () => {
    const weeks = weekKeys(2095, 8);
    const { exercise } = await findExercise("Skrå armstrækninger (fødder hævet)");

    // Build up a step of 3 first, so a held vs. non-held week is distinguishable.
    await setExerciseRating(weeks[0], exercise.id, "easy");
    await getWeekView(weeks[1]);
    await setExerciseRating(weeks[1], exercise.id, "easy");
    await getWeekView(weeks[2]);
    await setExerciseRating(weeks[2], exercise.id, "easy");
    expect(stepOf(await getWeekView(weeks[3]), exercise.id)).toBe(3);

    // Three "hard" weeks in a row (weeks[3..5]) — not yet 3 in a row as of
    // weeks[4]'s transition (only weeks[3] is hard so far), so this is just
    // the routine -1.
    await setExerciseRating(weeks[3], exercise.id, "hard");
    expect(stepOf(await getWeekView(weeks[4]), exercise.id)).toBe(2);
    await setExerciseRating(weeks[4], exercise.id, "hard");
    expect(stepOf(await getWeekView(weeks[5]), exercise.id)).toBe(1);

    // weeks[3..5] are now all "hard" — the transition into weeks[6] is the
    // first time that's true, so it holds instead of dropping to 0.
    await setExerciseRating(weeks[5], exercise.id, "hard");
    const held = await getWeekView(weeks[6]);
    expect(deloadOf(held, exercise.id)).toBe(true);
    expect(stepOf(held, exercise.id)).toBe(1); // held, not adjustStep'd down to 0

    // The streak continues into weeks[6] — weeks[4..6] are all "hard" too,
    // but weeks[3] (the 4th week back from this transition) was ALSO hard,
    // so this is a continuation of an already-handled streak: normal -1
    // resumes rather than holding every week indefinitely.
    await setExerciseRating(weeks[6], exercise.id, "hard");
    expect(stepOf(await getWeekView(weeks[7]), exercise.id)).toBe(0);
  });
});

describe("savePlan", () => {
  it("round-trips an added, reordered, and removed exercise", async () => {
    const plan = await getWorkoutPlan();
    const session = plan.find((s) => s.label === "Bryst & triceps")!;
    const withoutFirst = session.exercises.slice(1);
    const edited = plan.map((s) =>
      s.id !== session.id
        ? s
        : {
            ...s,
            exercises: [
              ...withoutFirst,
              { id: "", label: "Ny øvelse", detailTemplate: "Ny øvelse 3×{10:1}", position: 0 },
            ],
          },
    );

    const saved = await savePlan(edited);
    const savedSession = saved.find((s) => s.label === "Bryst & triceps")!;
    expect(savedSession.exercises.map((e) => e.label)).toEqual([
      ...withoutFirst.map((e) => e.label),
      "Ny øvelse",
    ]);

    // restore the fixture plan so later tests (and their exercise lookups
    // by label) aren't affected by this test's edit
    await savePlan(plan);
  });
});

function stepOf(sessions: Awaited<ReturnType<typeof getWeekView>>, exerciseId: string) {
  for (const s of sessions) {
    const ex = s.exercises.find((e) => e.id === exerciseId);
    if (ex) return ex.step;
  }
  throw new Error(`exercise not found in week view: ${exerciseId}`);
}

function deloadOf(sessions: Awaited<ReturnType<typeof getWeekView>>, exerciseId: string) {
  for (const s of sessions) {
    const ex = s.exercises.find((e) => e.id === exerciseId);
    if (ex) return ex.deloadFlag;
  }
  throw new Error(`exercise not found in week view: ${exerciseId}`);
}
