import { NextResponse } from "next/server";
import { caseIdByConversation, getCaseWithEvents, publicView } from "@/lib/cases";

export const dynamic = "force-dynamic";

/** Accepts a case ID or an ElevenLabs conversation ID. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = (await getCaseWithEvents(id)) ?? (await getCaseWithEvents((await caseIdByConversation(id)) ?? ""));
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ case: publicView(c), now: Date.now() });
}
