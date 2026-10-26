import { createFileRoute } from "@tanstack/react-router";
import { addCalcHistoryEntry, getCalcHistory } from "@/lib/calc-history-store";

// Deliberately public, no auth — matches /calculate itself being a public
// page anyone can use (customers included). That does mean anyone who saves
// a calculation there lands in the same shared list; low-stakes since it's
// just numbers capped at 5 entries, but worth knowing if this ever needs
// per-visitor isolation later.
export const Route = createFileRoute("/api/public/calc-history")({
  server: {
    handlers: {
      GET: async () => {
        return Response.json({ history: await getCalcHistory() });
      },
      POST: async ({ request }) => {
        const body = await request
          .json()
          .catch(
            () => null as { name?: unknown; calc?: { guests?: unknown; hours?: unknown } } | null,
          );
        const calc = body?.calc;
        if (
          !calc ||
          typeof calc.guests !== "number" ||
          !Number.isFinite(calc.guests) ||
          typeof calc.hours !== "number" ||
          !Number.isFinite(calc.hours)
        ) {
          return Response.json({ error: "invalid_body" }, { status: 400 });
        }
        const name = typeof body?.name === "string" ? body.name.slice(0, 60) : "";
        const entry = { timestamp: Date.now(), name, calc };
        return Response.json({ history: await addCalcHistoryEntry(entry) });
      },
    },
  },
});
