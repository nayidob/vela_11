import { timingSafeEqual } from "node:crypto";

/** Server tools send `x-vela-secret`. If TOOL_SECRET is unset (local dev), tools are open. */
export function toolAuthorized(req: Request) {
  const expected = process.env.TOOL_SECRET;
  if (!expected) return true;
  const got = req.headers.get("x-vela-secret") || "";
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Demo controls (seed / reset / rehearsal) can be locked with DEMO_KEY. */
export function demoAuthorized(req: Request) {
  const key = process.env.DEMO_KEY;
  if (!key) return true;
  const url = new URL(req.url);
  return url.searchParams.get("key") === key || req.headers.get("x-demo-key") === key;
}
