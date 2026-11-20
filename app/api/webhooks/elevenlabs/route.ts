import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { addEvent, caseForConversation, updateCase } from "@/lib/cases";
import type { Channel, CriterionResult } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Same scheme as the ElevenLabs SDK: header "t=<ts>,v0=<hex hmac of `${ts}.${body}`>". */
function verify(raw: string, header: string | null, secret: string) {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const ts = parts.t;
  const sig = parts.v0;
  if (!ts || !sig) return false;
  if (Number(ts) * 1000 < Date.now() - 30 * 60 * 1000) return false;
  const digest = createHmac("sha256", secret).update(`${ts}.${raw}`).digest("hex");
  const a = Buffer.from(digest);
  const b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}

type Turn = { role: "agent" | "user"; message?: string | null; time_in_call_secs?: number };

/**
 * Dashboard-created analysis items get generated IDs ("aitem_…") and the webhook only carries
 * the ID for evaluation criteria, so names come from the agent config. Needs ELEVENLABS_API_KEY.
 */
async function analysisNames(agentId?: string): Promise<Record<string, string>> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key || !agentId) return {};
  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${encodeURIComponent(agentId)}`, {
      headers: { "xi-api-key": key },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return {};
    const agent = (await res.json()) as {
      platform_settings?: {
        evaluation?: { criteria?: { id: string; name?: string }[] };
        data_collection?: Record<string, { name?: string | null }>;
      };
    };
    const out: Record<string, string> = {};
    for (const c of agent.platform_settings?.evaluation?.criteria ?? []) if (c.name) out[c.id] = c.name;
    for (const [id, p] of Object.entries(agent.platform_settings?.data_collection ?? {})) if (p.name) out[id] = p.name;
    return out;
  } catch {
    return {};
  }
}

export async function POST(req: Request) {
  const raw = await req.text();
  const secret = process.env.ELEVENLABS_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "ELEVENLABS_WEBHOOK_SECRET is not configured" }, { status: 503 });
  if (!verify(raw, req.headers.get("elevenlabs-signature"), secret))
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });

  const evt = JSON.parse(raw) as { type: string; data: Record<string, any> };
  if (evt.type !== "post_call_transcription") return NextResponse.json({ ignored: evt.type });

  const d = evt.data;
  const dyn = d.conversation_initiation_client_data?.dynamic_variables ?? {};
  const channel: Channel =
    dyn.channel && dyn.channel !== "unknown"
      ? dyn.channel
      : /_tg_\d+$/.test(String(d.conversation_id))
        ? "telegram"
        : dyn.system__caller_id
          ? "phone"
          : "unknown";
  const c = await caseForConversation(d.conversation_id, channel);
  const a = d.analysis ?? {};
  const names = await analysisNames(d.agent_id);
  const criteria: CriterionResult[] = Object.values(a.evaluation_criteria_results ?? {}).map((r: any) => ({
    id: r.criteria_id,
    label: names[r.criteria_id],
    result: r.result,
    rationale: r.rationale,
  }));
  const data = Object.values(a.data_collection_results ?? {}).map((r: any) => ({
    id: r.data_collection_id,
    label: r.name || names[r.data_collection_id],
    value: r.value,
  }));
  const transcript = ((d.transcript ?? []) as Turn[])
    .filter((t) => t.message)
    .map((t) => ({ role: t.role, text: (t.message as string).replace(/\[[a-z][a-z -]*\]\s*/gi, "").trim(), t: t.time_in_call_secs }))
    .filter((t) => t.text);

  await updateCase(c.id, (x) => {
    x.callActive = false;
    if (transcript.length) x.transcript = transcript;
    if (x.patient.name === "Unknown caller" && typeof dyn.patient_name === "string" && dyn.patient_name !== "unknown")
      x.patient.name = dyn.patient_name;
    x.analysis = {
      summary: a.transcript_summary,
      callSuccessful: a.call_successful,
      criteria,
      data,
      durationSecs: d.metadata?.call_duration_secs,
      cost: d.metadata?.cost,
      terminationReason: d.metadata?.termination_reason,
    };
  });
  const passed = criteria.filter((r) => r.result === "success").length;
  await addEvent(c.id, {
    kind: "system",
    title: "Post-call analysis received",
    detail: criteria.length ? `${passed} of ${criteria.length} evaluation criteria passed` : "Transcript and summary attached",
    source: "ElevenAgents",
    tone: criteria.length && passed < criteria.length ? "warn" : "good",
  });
  return NextResponse.json({ ok: true, caseId: c.id });
}
