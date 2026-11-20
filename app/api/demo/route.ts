import { after, NextResponse } from "next/server";
import { demoAuthorized } from "@/lib/auth";
import { deleteAllCases } from "@/lib/cases";
import { runGoldenPath, seedDemo } from "@/lib/demo";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  if (!demoAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { action, email } = (await req.json()) as { action: "seed" | "reset" | "rehearse"; email?: string };
  if (action === "reset") {
    await deleteAllCases();
    return NextResponse.json({ ok: true });
  }
  if (action === "seed") {
    await deleteAllCases();
    await seedDemo();
    return NextResponse.json({ ok: true });
  }
  if (action === "rehearse") {
    const r = await runGoldenPath({ email, speed: 1.15 });
    after(r.run);
    return NextResponse.json({ ok: true, caseId: r.caseId, conversationId: r.conversationId });
  }
  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
