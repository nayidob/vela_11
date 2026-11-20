"use client";

import { TopBar, usePoll } from "../components/ui";

type Src = { ok: boolean; ms: number; error?: string };
type Health = {
  appUrl: string;
  storage: "redis" | "memory";
  agent: boolean;
  privateAgentToken: boolean;
  toolSecret: boolean;
  webhookSecret: boolean;
  email: boolean;
  telegramBot: boolean;
  telegramDoctorChat: boolean;
  dataSources: { invima: Src; openfda: Src; openstreetmap: Src; telegram: Src | null };
};

function Row({ ok, title, hint, extra }: { ok: boolean; title: string; hint: string; extra?: string }) {
  return (
    <div className="check">
      <span className={ok ? "yes" : "no"} aria-label={ok ? "Ready" : "Needs setup"}>{ok ? "✓" : "○"}</span>
      <div>
        <b>{title}</b>
        <span className="muted small">{hint}</span>
      </div>
      {extra && <span className="faint small">{extra}</span>}
    </div>
  );
}

export default function Setup() {
  const { data: h } = usePoll<Health>("/api/health", 15000);
  return (
    <div className="shell">
      <TopBar />
      <main className="page">
        <h1 style={{ fontSize: 26 }}>Setup checklist</h1>
        <p className="muted" style={{ margin: "4px 0 20px" }}>
          Everything the demo needs, checked live. Tool and webhook URLs use {h?.appUrl ?? "your deployment URL"}.
        </p>
        {!h ? <p className="faint">Checking…</p> : (
          <div className="checks">
            <Row ok={h.storage === "redis"} title="Shared storage" hint="Upstash Redis keeps cases between serverless calls. Without it, cases vanish on Vercel." extra={h.storage} />
            <Row ok={h.agent} title="ElevenLabs agent ID" hint="ELEVENLABS_AGENT_ID, used by the browser call." />
            <Row ok={h.privateAgentToken} title="Private agent (API key)" hint="ELEVENLABS_API_KEY lets the agent stay private. Optional for a public agent." />
            <Row ok={h.toolSecret} title="Tool secret" hint="TOOL_SECRET, sent by every server tool as the x-vela-secret header." />
            <Row ok={h.webhookSecret} title="Post-call webhook secret" hint="ELEVENLABS_WEBHOOK_SECRET, from the webhook you create in ElevenLabs." />
            <Row ok={h.email} title="Patient email" hint="Resend with a verified domain, or Gmail SMTP with an app password." />
            <Row ok={h.telegramBot} title="Doctor dispatch bot" hint="TELEGRAM_DOCTOR_BOT_TOKEN from @BotFather, then open /api/telegram/setup." />
            <Row ok={h.telegramDoctorChat} title="Doctors' Telegram group linked" hint="Add the bot to a group and send /vincular." />
            {h.dataSources.telegram && (
              <Row ok={h.dataSources.telegram.ok} title="Telegram API" hint={h.dataSources.telegram.error ?? "api.telegram.org answered for the dispatch bot"} extra={`${h.dataSources.telegram.ms} ms`} />
            )}
            <Row ok={h.dataSources.invima.ok} title="INVIMA drug registry" hint={h.dataSources.invima.error ?? "datos.gov.co answered for Dolex"} extra={`${h.dataSources.invima.ms} ms`} />
            <Row ok={h.dataSources.openfda.ok} title="openFDA drug labels" hint={h.dataSources.openfda.error ?? "api.fda.gov answered for Tylenol"} extra={`${h.dataSources.openfda.ms} ms`} />
            <Row ok={h.dataSources.openstreetmap.ok} title="OpenStreetMap hospitals" hint={h.dataSources.openstreetmap.error ?? "Nearest emergency department lookup"} extra={`${h.dataSources.openstreetmap.ms} ms`} />
          </div>
        )}
      </main>
    </div>
  );
}
