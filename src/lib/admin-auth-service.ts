// Machine-to-machine credential for the companion housekeeping admin app
// (a separate repo) to call into this app's admin-only routes (e.g.
// change-code.ts) without a real browser session — personal-dashboard has
// no session/cookie login of its own, only the 4-digit dashboard code
// checked in auth.ts, so this is a separate, independent credential.
//
// Give HOUSEKEEPING_SERVICE_SECRET its own random value (housekeeping sends
// it as PERSONAL_DASHBOARD_SERVICE_SECRET on its side) and don't reuse it
// for anything else, so a leak of one secret doesn't open another app.

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function isAuthedServiceRequest(request: Request): boolean {
  const secret = process.env.HOUSEKEEPING_SERVICE_SECRET;
  if (!secret) return false;
  const provided = request.headers.get("x-housekeeping-secret");
  if (!provided) return false;
  return constantTimeEqual(provided, secret);
}
