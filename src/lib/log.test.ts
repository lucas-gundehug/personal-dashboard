import { describe, expect, it, vi } from "vitest";
import { logError } from "./log";

function loggedPayload(spy: ReturnType<typeof vi.spyOn>): Record<string, unknown> {
  const line = spy.mock.calls[0]?.[0] as string;
  return JSON.parse(line);
}

describe("logError", () => {
  it("logs a real Error's name/message/stack unchanged", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logError(new TypeError("boom"));
    const payload = loggedPayload(spy);
    expect(payload.name).toBe("TypeError");
    expect(payload.message).toBe("boom");
    expect(payload.stack).toContain("TypeError: boom");
    spy.mockRestore();
  });

  it("extracts message/code/details/hint from a Postgrest-style error object instead of collapsing to [object Object]", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logError({
      message: "insert or update on table violates foreign key constraint",
      code: "23503",
      details: "Key (exercise_id)=(...) is not present in table.",
      hint: null,
    });
    const payload = loggedPayload(spy);
    expect(payload.message).toBe("insert or update on table violates foreign key constraint");
    expect(payload.code).toBe("23503");
    expect(payload.details).toBe("Key (exercise_id)=(...) is not present in table.");
    expect(payload).not.toHaveProperty("hint"); // null fields are omitted, not logged as null
    spy.mockRestore();
  });

  it("falls back to JSON.stringify for a plain object with no message field", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logError({ weird: "shape" });
    const payload = loggedPayload(spy);
    expect(payload.message).toBe('{"weird":"shape"}');
    spy.mockRestore();
  });

  it("stringifies a thrown primitive", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logError("just a string");
    const payload = loggedPayload(spy);
    expect(payload.message).toBe("just a string");
    spy.mockRestore();
  });
});
