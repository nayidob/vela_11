import { NextResponse } from "next/server";
import { invimaLookup, openFdaLookup } from "@/lib/meds";
import { appUrl } from "@/lib/messages";
import { doctorChatId, emailConfigured, telegramBotInfo, telegramConfigured } from "@/lib/notify";
import { nearestEmergencyRoom } from "@/lib/places";
import { storageMode } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

/** Setup checklist: what's configured and whether each public data source answers. */
export async function GET() {
  const t = async (fn: () => Promise<unknown>) => {
    const s = Date.now();
    try {
      const v = await fn();
      return { ok: Boolean(v), ms: Date.now() - s, sample: v };
    } catch (e) {
      return { ok: false, ms: Date.now() - s, error: (e as Error).message };
    }
  };
  const [invima, openfda, osm, telegram] = await Promise.all([
    t(() => invimaLookup("dolex")),
    t(() => openFdaLookup("tylenol")),
    t(() => nearestEmergencyRoom("El Poblado", "Medellín", { fresh: true }).then((v) => (v.source === "OpenStreetMap" ? v : null))),
    telegramConfigured() ? t(() => telegramBotInfo().then((b) => b.username)) : Promise.resolve(null),
  ]);
  return NextResponse.json({
    appUrl: appUrl(),
    storage: storageMode(),
    agent: Boolean(process.env.ELEVENLABS_AGENT_ID || process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID),
    privateAgentToken: Boolean(process.env.ELEVENLABS_API_KEY),
    toolSecret: Boolean(process.env.TOOL_SECRET),
    webhookSecret: Boolean(process.env.ELEVENLABS_WEBHOOK_SECRET),
    email: emailConfigured(),
    telegramBot: telegramConfigured(),
    telegramDoctorChat: Boolean(await doctorChatId()),
    dataSources: { invima, openfda, openstreetmap: osm, telegram },
  });
}
