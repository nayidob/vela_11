import { NextResponse } from "next/server";
import { addEvent, caseForConversation, updateCase } from "@/lib/cases";

export const dynamic = "force-dynamic";

/**
 * Called by the patient page when a browser call connects or ends, so the
 * console shows the call the moment it starts (before any tool fires).
 */
export async function POST(req: Request) {
  const b = (await req.json()) as { conversationId?: string; event: "start" | "end"; name?: string; email?: string };
  if (!b.conversationId) return NextResponse.json({ error: "conversationId required" }, { status: 400 });
  const c = await caseForConversation(b.conversationId, "web_voice");
  if (b.event === "start") {
    await updateCase(c.id, (x) => {
      x.channel = "web_voice";
      x.callActive = true;
      if (b.name && x.patient.name === "Unknown caller") x.patient.name = b.name.slice(0, 80);
      if (b.email && b.email.includes("@")) x.patient.email = b.email.slice(0, 120);
    });
    await addEvent(c.id, { kind: "system", title: "Call connected", detail: "Browser voice call", source: "ElevenAgents" });
  } else {
    await updateCase(c.id, (x) => {
      x.callActive = false;
    });
    await addEvent(c.id, { kind: "system", title: "Call ended", source: "ElevenAgents" });
  }
  return NextResponse.json({ caseId: c.id });
}
