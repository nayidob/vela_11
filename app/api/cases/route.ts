import { NextResponse } from "next/server";
import { listCases, publicView } from "@/lib/cases";
import { onCallCount } from "@/lib/roster";

export const dynamic = "force-dynamic";

export async function GET() {
  const cases = await listCases(60);
  return NextResponse.json({
    cases: cases.map(publicView),
    roster: onCallCount(cases),
    now: Date.now(),
  });
}
