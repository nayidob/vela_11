import { NextResponse } from "next/server";
import { caseByToken } from "@/lib/cases";
import { applyDoctorAction, type DoctorAction } from "@/lib/doctor-actions";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const c = await caseByToken(token);
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { emailHtml: _e, telegramMessage: _m, ...rest } = c;
  return NextResponse.json({ case: rest, now: Date.now() });
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const c = await caseByToken(token);
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { action } = (await req.json()) as { action: DoctorAction };
  if (!["accept", "en_route", "completed"].includes(action))
    return NextResponse.json({ error: "bad action" }, { status: 400 });
  try {
    await applyDoctorAction(c.id, action, "Doctor");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 409 });
  }
}
