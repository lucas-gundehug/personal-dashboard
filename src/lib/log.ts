type LogFields = Record<string, unknown>;

// Supabase/Postgrest errors (and similar) are plain {message, details, hint,
// code} objects, not real Error instances — new Error(String(error)) used to
// collapse them to the useless message "[object Object]" (Object.prototype.
// toString(), since they don't override it), which is exactly what happened
// the one time this actually mattered: a real production error was
// unreadable in the logs. Pull out whatever fields are actually there
// instead of stringifying blindly.
function describeError(
  error: unknown,
): { name: string; message: string; stack?: string } & LogFields {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  if (error && typeof error === "object") {
    const obj = error as Record<string, unknown>;
    const message = typeof obj.message === "string" ? obj.message : JSON.stringify(obj);
    const extra: LogFields = {};
    for (const key of ["code", "details", "hint"]) {
      if (obj[key] != null) extra[key] = obj[key];
    }
    return { name: "NonErrorObject", message, ...extra };
  }
  return { name: "NonError", message: String(error) };
}

// One JSON line per error instead of a bare console.error(error) — Vercel's
// log viewer parses JSON log lines, so this makes errors searchable/filterable
// by route, source, etc. instead of only full-text-greppable stack traces.
export function logError(error: unknown, fields: LogFields = {}) {
  console.error(
    JSON.stringify({
      level: "error",
      time: new Date().toISOString(),
      ...describeError(error),
      ...fields,
    }),
  );
}
