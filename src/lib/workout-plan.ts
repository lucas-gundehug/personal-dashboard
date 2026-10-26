// Plan/state shapes shared between server (workout-store.ts) and client
// (workout-tracker.tsx, workout-tab.tsx, workout-edit route) code.
// Deliberately has zero dependencies (no redis/supabase import) so client
// components can pull in these types without bundling server-only code.
//
// The plan itself (which sessions/exercises exist) lives in Supabase
// (workout_plan_sessions/workout_plan_exercises) instead of a hardcoded
// array, so it can be edited from the app instead of needing a code change.
export type SessionKind = "run" | "strength";

export type PlanExercise = {
  id: string;
  label: string;
  // e.g. "Håndvægt-gulvpres 3×{12:1}" — {base:step} is swapped for
  // base + step×N by renderDetail() in workout-tracker.tsx.
  detailTemplate: string;
  position: number;
};

export type PlanSession = {
  id: string;
  kind: SessionKind;
  label: string;
  position: number;
  exercises: PlanExercise[];
};

export const DIFFICULTIES = ["easy", "ok", "hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

// One exercise's state for a specific week: the plan fields plus whatever's
// been recorded against it. step/deloadFlag are meaningless (always 0/false)
// for run exercises, which aren't rated or progressed locally.
export type ExerciseWeekView = PlanExercise & {
  difficulty?: Difficulty;
  step: number;
  deloadFlag: boolean;
  recentRatings: { week: string; difficulty: Difficulty }[];
};

export type SessionWeekView = {
  id: string;
  kind: SessionKind;
  label: string;
  position: number;
  completed: boolean;
  exercises: ExerciseWeekView[];
};

// ISO 8601 week number — e.g. "2026-W34". Used as the storage key so a new
// week starts with an empty (all-unchecked) state automatically, no explicit
// reset needed.
export function getIsoWeekKey(date: Date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

// Inverse of getIsoWeekKey: the Monday of a given ISO week (Jan 4 is always
// in week 1, so week 1's Monday anchors every other week off of it).
function isoWeekMonday(year: number, week: number) {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - (jan4.getUTCDay() || 7) + 1);
  const monday = new Date(week1Monday);
  monday.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  return monday;
}

// The key of the week immediately before `week` — used to look up last
// week's difficulty rating when adjusting this week's progression.
export function getPreviousIsoWeekKey(week: string) {
  const [yearStr, weekStr] = week.split("-W");
  const monday = isoWeekMonday(Number(yearStr), Number(weekStr));
  monday.setUTCDate(monday.getUTCDate() - 7);
  return getIsoWeekKey(monday);
}
