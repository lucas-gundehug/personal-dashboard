import { supabase } from "@/lib/supabase";
import {
  getPreviousIsoWeekKey,
  type Difficulty,
  type ExerciseWeekView,
  type PlanExercise,
  type PlanSession,
  type SessionKind,
  type SessionWeekView,
} from "@/lib/workout-plan";

// Same Supabase-or-in-memory pattern as before: `supabase` is null when no
// project is configured, and every function falls back to an in-memory
// version of its own state.

// Same ceiling the old calendar-based formula plateaued at.
const PROGRESSION_MAX_STEP = 10;
// How many past weeks' ratings feed the deload flag (all "hard" → flagged)
// and the "why is it this number" tooltip. Same window for both — the
// weeks that would trigger a deload are exactly the weeks worth showing.
const HISTORY_WEEKS = 3;

// ---------- in-memory fallback state ----------

const memoryPlan: PlanSession[] = [
  { id: "run1", kind: "run", label: "Løb 1", position: 0, exercises: [] },
  { id: "run2", kind: "run", label: "Løb 2", position: 1, exercises: [] },
  { id: "run3", kind: "run", label: "Løb 3", position: 2, exercises: [] },
  { id: "strength1", kind: "strength", label: "Bryst & triceps", position: 3, exercises: [] },
  {
    id: "strength2",
    kind: "strength",
    label: "Ryg & arme (pull-up bar)",
    position: 4,
    exercises: [],
  },
  { id: "strength3", kind: "strength", label: "Bryst & mave", position: 5, exercises: [] },
];
for (const [sessionId, label, detailTemplate] of [
  ["run1", "Løb 1", "Følg din løbeapp (5 km-træning)"],
  ["run2", "Løb 2", "Følg din løbeapp (5 km-træning)"],
  ["run3", "Løb 3", "Følg din løbeapp (5 km-træning)"],
  ["strength1", "Håndvægt-gulvpres", "Håndvægt-gulvpres 3×{12:1}"],
  [
    "strength1",
    "Skrå armstrækninger (fødder hævet)",
    "Skrå armstrækninger (fødder hævet) 3×{10:1}",
  ],
  ["strength1", "Planke", "Planke 3×{30:5} sek"],
  ["strength1", "Armstrækninger", "Armstrækninger {8:1} / {8:1} / så mange du kan"],
  ["strength2", "Håndvægt-roning", "Håndvægt-roning 3×{12:1} pr. side"],
  ["strength2", "Håndvægt-biceps curl", "Håndvægt-biceps curl 3×{12:1}"],
  ["strength2", "Hængende benløft", "Hængende benløft 3×{10:1}"],
  [
    "strength2",
    "Pull-ups/chin-ups",
    "Pull-ups/chin-ups {3:1} / {3:1} / så mange du kan (brug negative reps hvis nødvendigt)",
  ],
  ["strength3", "Håndvægt-gulvflyes", "Håndvægt-gulvflyes 3×{12:1}"],
  ["strength3", "Brede armstrækninger", "Brede armstrækninger 3×{12:1}"],
  ["strength3", "Håndvægt-pullover (liggende)", "Håndvægt-pullover (liggende) 3×{10:1}"],
  ["strength3", "Mavebøjninger", "Mavebøjninger 3×{20:1}"],
] as const) {
  const session = memoryPlan.find((s) => s.id === sessionId)!;
  session.exercises.push({
    id: `${sessionId}-${session.exercises.length}`,
    label,
    detailTemplate,
    position: session.exercises.length,
  });
}

const memorySessionCompletion = new Map<string, boolean>();
const memoryExerciseRatings = new Map<string, Difficulty>();
const memoryExerciseProgression = new Map<
  string,
  { step: number; lastWeekApplied: string | null }
>();

function weekItemKey(week: string, id: string) {
  return `${week}|${id}`;
}

// ---------- plan (sessions + exercises) ----------

export async function getWorkoutPlan(): Promise<PlanSession[]> {
  if (supabase) {
    const [sessionsRes, exercisesRes] = await Promise.all([
      supabase.from("workout_plan_sessions").select("id, kind, label, position").order("position"),
      supabase
        .from("workout_plan_exercises")
        .select("id, session_id, label, detail_template, position")
        .order("position"),
    ]);
    if (sessionsRes.error) throw sessionsRes.error;
    if (exercisesRes.error) throw exercisesRes.error;
    return (sessionsRes.data ?? []).map((s) => ({
      id: s.id,
      kind: s.kind as SessionKind,
      label: s.label,
      position: s.position,
      exercises: (exercisesRes.data ?? [])
        .filter((e) => e.session_id === s.id)
        .map((e) => ({
          id: e.id,
          label: e.label,
          detailTemplate: e.detail_template,
          position: e.position,
        })),
    }));
  }
  return memoryPlan.map((s) => ({ ...s, exercises: [...s.exercises] }));
}

// Full replace of the plan, sent from the edit screen. Sessions/exercises
// missing an id (or with a client-generated non-uuid placeholder) are new —
// minted a real id here. Existing ids are upserted in place (not deleted and
// reinserted) specifically so unrelated edits — reordering, fixing a typo —
// never touch exercise_ratings/exercise_progression, which cascade-delete
// off exercise id.
export async function savePlan(sessions: PlanSession[]): Promise<PlanSession[]> {
  // A non-empty id means "existing row, keep it" (so its exercise_ratings/
  // exercise_progression history survives) — not "looks like a uuid",
  // since the in-memory fallback's fixture ids aren't uuid-shaped. A new
  // row from the edit screen has an empty id and gets a fresh one minted
  // here.
  const withIds: PlanSession[] = sessions.map((s) => ({
    ...s,
    id: s.id || crypto.randomUUID(),
    exercises: s.exercises.map((e) => ({
      ...e,
      id: e.id || crypto.randomUUID(),
    })),
  }));

  if (supabase) {
    const sessionRows = withIds.map((s, i) => ({
      id: s.id,
      kind: s.kind,
      label: s.label,
      position: i,
    }));
    const exerciseRows = withIds.flatMap((s) =>
      s.exercises.map((e, ei) => ({
        id: e.id,
        session_id: s.id,
        label: e.label,
        detail_template: e.detailTemplate,
        position: ei,
      })),
    );
    const keepSessionIds = new Set(sessionRows.map((r) => r.id));
    const keepExerciseIds = new Set(exerciseRows.map((r) => r.id));

    const [{ data: currentSessions }, { data: currentExercises }] = await Promise.all([
      supabase.from("workout_plan_sessions").select("id"),
      supabase.from("workout_plan_exercises").select("id"),
    ]);
    const removedSessionIds = (currentSessions ?? [])
      .map((r) => r.id)
      .filter((id) => !keepSessionIds.has(id));
    const removedExerciseIds = (currentExercises ?? [])
      .map((r) => r.id)
      .filter((id) => !keepExerciseIds.has(id));

    const { error: sessionsError } = await supabase
      .from("workout_plan_sessions")
      .upsert(sessionRows);
    if (sessionsError) throw sessionsError;
    const { error: exercisesError } = await supabase
      .from("workout_plan_exercises")
      .upsert(exerciseRows);
    if (exercisesError) throw exercisesError;
    if (removedExerciseIds.length) {
      const { error } = await supabase
        .from("workout_plan_exercises")
        .delete()
        .in("id", removedExerciseIds);
      if (error) throw error;
    }
    if (removedSessionIds.length) {
      const { error } = await supabase
        .from("workout_plan_sessions")
        .delete()
        .in("id", removedSessionIds);
      if (error) throw error;
    }
  } else {
    memoryPlan.length = 0;
    memoryPlan.push(...withIds.map((s, i) => ({ ...s, position: i })));
  }
  return getWorkoutPlan();
}

// ---------- per-week view (plan + completion + ratings + progression) ----------

function adjustStep(step: number, difficulty: Difficulty | null | undefined): number {
  if (difficulty === "easy") return Math.min(PROGRESSION_MAX_STEP, step + 1);
  if (difficulty === "hard") return Math.max(0, step - 1);
  return step; // "ok", or no rating submitted: hold steady
}

// The C25K-style auto-progression above already steps down on any "hard"
// week — this is the escalation on top of it: three "hard" weeks in a row
// (the same window the deloadFlag badge uses) means the routine per-week
// -1 isn't enough, so that week's adjustment is skipped entirely — a real
// rest week at the current (already-lowered) step, instead of dropping
// further. Edge-triggered on purpose: `fourthWeekBack` is whatever was rated
// the week *before* that 3-week window. If it was also "hard", this streak
// was already handled on a previous transition, so it doesn't fire again
// every single week for as long as the streak continues.
function shouldHoldForDeload(
  last3Weeks: (Difficulty | undefined)[],
  fourthWeekBack: Difficulty | undefined,
): boolean {
  return (
    last3Weeks.length === HISTORY_WEEKS &&
    last3Weeks.every((d) => d === "hard") &&
    fourthWeekBack !== "hard"
  );
}

// The `count` weeks immediately before `week`, most recent first.
function recentWeekKeys(week: string, count: number): string[] {
  const keys: string[] = [];
  let cursor = week;
  for (let i = 0; i < count; i++) {
    cursor = getPreviousIsoWeekKey(cursor);
    keys.push(cursor);
  }
  return keys;
}

function buildExerciseView(
  ex: PlanExercise,
  isStrength: boolean,
  step: number,
  difficulty: Difficulty | undefined,
  history: { week: string; difficulty: Difficulty }[],
): ExerciseWeekView {
  const deloadFlag =
    isStrength && history.length === HISTORY_WEEKS && history.every((r) => r.difficulty === "hard");
  return {
    ...ex,
    difficulty: isStrength ? difficulty : undefined,
    step: isStrength ? step : 0,
    deloadFlag,
    recentRatings: isStrength ? history : [],
  };
}

export async function getWeekView(week: string): Promise<SessionWeekView[]> {
  const plan = await getWorkoutPlan();
  const previousWeek = getPreviousIsoWeekKey(week);
  const strengthExercises = plan.filter((s) => s.kind === "strength").flatMap((s) => s.exercises);
  const historyWeeks = recentWeekKeys(week, HISTORY_WEEKS); // [previousWeek, previousWeek-1, previousWeek-2]
  // One week further back than historyWeeks — only used to tell a *fresh*
  // 3-hard-weeks streak apart from a streak already handled by a previous
  // deload hold (see shouldHoldForDeload above), never shown in the UI.
  const fourthWeekBackKey = getPreviousIsoWeekKey(historyWeeks[HISTORY_WEEKS - 1]);

  if (supabase) {
    const sessionIds = plan.map((s) => s.id);
    const strengthExerciseIds = strengthExercises.map((e) => e.id);

    const [completionRes, progressionRes, historyRes] = await Promise.all([
      sessionIds.length
        ? supabase
            .from("workout_sessions")
            .select("session_id, completed")
            .eq("week", week)
            .in("session_id", sessionIds)
        : Promise.resolve({ data: [], error: null }),
      strengthExerciseIds.length
        ? supabase
            .from("exercise_progression")
            .select("exercise_id, step, last_week_applied")
            .in("exercise_id", strengthExerciseIds)
        : Promise.resolve({ data: [], error: null }),
      strengthExerciseIds.length
        ? supabase
            .from("exercise_ratings")
            .select("exercise_id, week, difficulty")
            .in("exercise_id", strengthExerciseIds)
            .in("week", [week, ...historyWeeks, fourthWeekBackKey])
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (completionRes.error) throw completionRes.error;
    if (progressionRes.error) throw progressionRes.error;
    if (historyRes.error) throw historyRes.error;

    const completedSet = new Set(
      (completionRes.data ?? []).filter((r) => r.completed).map((r) => r.session_id),
    );
    const progressionByExercise = new Map(
      (progressionRes.data ?? []).map((r) => [r.exercise_id, r]),
    );
    const ratingsByExercise = new Map<string, { week: string; difficulty: Difficulty }[]>();
    for (const row of historyRes.data ?? []) {
      const list = ratingsByExercise.get(row.exercise_id) ?? [];
      list.push({ week: row.week, difficulty: row.difficulty as Difficulty });
      ratingsByExercise.set(row.exercise_id, list);
    }

    // Lazily fold last week's rating into any exercise not yet caught up —
    // same "at most once per week, guarded by last_week_applied" idea as
    // before, just batched across all exercises in one upsert instead of
    // one round trip each (that N+1 pattern is exactly what caused the
    // heatmap slowness/corruption bug fixed earlier).
    const stepByExercise = new Map<string, number>();
    for (const ex of strengthExercises)
      stepByExercise.set(ex.id, progressionByExercise.get(ex.id)?.step ?? 0);
    const toAdjust = strengthExercises.filter(
      (ex) => progressionByExercise.get(ex.id)?.last_week_applied !== previousWeek,
    );
    if (toAdjust.length) {
      const upserts = toAdjust.map((ex) => {
        const currentStep = progressionByExercise.get(ex.id)?.step ?? 0;
        const exerciseRatings = ratingsByExercise.get(ex.id) ?? [];
        const previousDifficulty = exerciseRatings.find((r) => r.week === previousWeek)?.difficulty;
        const last3 = historyWeeks.map(
          (w) => exerciseRatings.find((r) => r.week === w)?.difficulty,
        );
        const fourthWeekBack = exerciseRatings.find(
          (r) => r.week === fourthWeekBackKey,
        )?.difficulty;
        const nextStep = shouldHoldForDeload(last3, fourthWeekBack)
          ? currentStep
          : adjustStep(currentStep, previousDifficulty);
        stepByExercise.set(ex.id, nextStep);
        return {
          exercise_id: ex.id,
          step: nextStep,
          last_week_applied: previousWeek,
          updated_at: new Date().toISOString(),
        };
      });
      const { error } = await supabase.from("exercise_progression").upsert(upserts);
      if (error) throw error;
    }

    return plan.map((s) => ({
      id: s.id,
      kind: s.kind,
      label: s.label,
      position: s.position,
      completed: completedSet.has(s.id),
      exercises: s.exercises.map((ex) => {
        const currentDifficulty = (ratingsByExercise.get(ex.id) ?? []).find(
          (r) => r.week === week,
        )?.difficulty;
        const history = (ratingsByExercise.get(ex.id) ?? [])
          .filter((r) => r.week !== week)
          .sort((a, b) => (a.week < b.week ? 1 : -1)); // most recent first
        return buildExerciseView(
          ex,
          s.kind === "strength",
          stepByExercise.get(ex.id) ?? 0,
          currentDifficulty,
          history.slice(0, HISTORY_WEEKS),
        );
      }),
    }));
  }

  return plan.map((s) => ({
    id: s.id,
    kind: s.kind,
    label: s.label,
    position: s.position,
    completed: memorySessionCompletion.get(weekItemKey(week, s.id)) ?? false,
    exercises: s.exercises.map((ex) => {
      if (s.kind !== "strength") return buildExerciseView(ex, false, 0, undefined, []);

      const prog = memoryExerciseProgression.get(ex.id) ?? { step: 0, lastWeekApplied: null };
      let step = prog.step;
      if (prog.lastWeekApplied !== previousWeek) {
        const previousDifficulty = memoryExerciseRatings.get(weekItemKey(previousWeek, ex.id));
        const last3 = historyWeeks.map((w) => memoryExerciseRatings.get(weekItemKey(w, ex.id)));
        const fourthWeekBack = memoryExerciseRatings.get(weekItemKey(fourthWeekBackKey, ex.id));
        step = shouldHoldForDeload(last3, fourthWeekBack)
          ? prog.step
          : adjustStep(prog.step, previousDifficulty);
        memoryExerciseProgression.set(ex.id, { step, lastWeekApplied: previousWeek });
      }
      const history = historyWeeks
        .map((w) => ({ week: w, difficulty: memoryExerciseRatings.get(weekItemKey(w, ex.id)) }))
        .filter((r): r is { week: string; difficulty: Difficulty } => !!r.difficulty);
      return buildExerciseView(
        ex,
        true,
        step,
        memoryExerciseRatings.get(weekItemKey(week, ex.id)),
        history,
      );
    }),
  }));
}

// Cheap read for the heatmap's past-weeks lookups: only the completed-session
// count, never touching exercise_progression/exercise_ratings. Reusing
// getWeekView for historical weeks would recompute (and upsert) progression
// as if those weeks were "now" — exactly the corruption bug fixed earlier,
// just hidden behind batched instead of N+1 queries.
export async function getWeekCompletedCount(week: string): Promise<number> {
  if (supabase) {
    const { data, error } = await supabase
      .from("workout_sessions")
      .select("completed")
      .eq("week", week);
    if (error) throw error;
    return (data ?? []).filter((r) => r.completed).length;
  }
  const plan = await getWorkoutPlan();
  return plan.filter((s) => memorySessionCompletion.get(weekItemKey(week, s.id))).length;
}

export async function setSessionCompleted(
  week: string,
  sessionId: string,
  completed: boolean,
): Promise<void> {
  if (supabase) {
    const { error } = await supabase.from("workout_sessions").upsert(
      {
        week,
        session_id: sessionId,
        completed,
        completed_at: completed ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "week,session_id" },
    );
    if (error) throw error;
  } else {
    memorySessionCompletion.set(weekItemKey(week, sessionId), completed);
  }
}

// Independent of session completion — rating an exercise doesn't require
// (or clear on) toggling the session checkbox. Simpler than trying to keep
// N per-exercise ratings in sync with one session-level checkbox, and there
// isn't a clean single rule for what unchecking "should" do to N independent
// exercise ratings.
export async function setExerciseRating(
  week: string,
  exerciseId: string,
  difficulty: Difficulty,
): Promise<void> {
  if (supabase) {
    const { error } = await supabase.from("exercise_ratings").upsert(
      { week, exercise_id: exerciseId, difficulty, rated_at: new Date().toISOString() },
      {
        onConflict: "week,exercise_id",
      },
    );
    if (error) throw error;
  } else {
    memoryExerciseRatings.set(weekItemKey(week, exerciseId), difficulty);
  }
}
