"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { PublicCase } from "@/lib/cases";
import { CallPanel } from "../components/CallPanel";
import { CasePanel, Transcript } from "../components/CasePanel";
import { LogoMark, TopBar, usePoll } from "../components/ui";

type Resp = { case: PublicCase };

function Demo() {
  const params = useSearchParams();
  const [key, setKey] = useState<string | null>(params.get("case"));
  const [rehearsal, setRehearsal] = useState(false);
  const [busy, setBusy] = useState(false);
  const { data } = usePoll<Resp>(key ? `/api/cases/${key}` : null, 1000);
  const c = data?.case ?? null;
  const showRehearsal = rehearsal || c?.channel === "simulated";

  useEffect(() => {
    const k = params.get("case");
    if (k) setKey(k);
  }, [params]);

  async function rehearse() {
    setBusy(true);
    const k = new URLSearchParams(location.search).get("key");
    const r = await fetch(`/api/demo${k ? `?key=${k}` : ""}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "rehearse" }),
    });
    const j = await r.json();
    setBusy(false);
    if (j.caseId) {
      setRehearsal(true);
      setKey(j.caseId);
    }
  }

  return (
    <div className="shell">
      <TopBar />
      <main className="page">
        <div className="demo">
          <div className="demo-left">
            {showRehearsal ? (
              <>
                <section className="call" style={{ paddingBottom: 18 }}>
                  <LogoMark size={26} />
                  <h2>Rehearsal run</h2>
                  <p>The scripted golden path drives the real tools, so every panel on the right is live.</p>
                  <div className="toolbar" style={{ justifyContent: "center", marginTop: 14 }}>
                    <button className="btn" onClick={() => { setRehearsal(false); setKey(null); }}>Back to live call</button>
                  </div>
                </section>
                <section className="panel">
                  <h3>Conversation</h3>
                  <Transcript turns={c?.transcript ?? []} live />
                </section>
              </>
            ) : (
              <CallPanel onConversation={(id) => id && setKey(id)} />
            )}
            {!showRehearsal && (
              <button className="btn ghost small" onClick={rehearse} disabled={busy} style={{ alignSelf: "center" }}>
                {busy ? "Starting…" : "Run a rehearsal without the microphone"}
              </button>
            )}
          </div>
          <div>
            {c ? (
              <CasePanel c={c} compact logHeight="calc(100vh - 262px)" />
            ) : (
              <section className="panel" style={{ padding: "48px 28px", textAlign: "center" }}>
                <h2 style={{ fontSize: 22 }}>The dispatcher's view appears here</h2>
                <p className="muted" style={{ marginTop: 8, maxWidth: 460, marginInline: "auto" }}>
                  Start a call on the left. Each step the agent takes, from verifying coverage to dispatching a doctor,
                  shows up here as it happens.
                </p>
              </section>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default function DemoPage() {
  return (
    <Suspense>
      <Demo />
    </Suspense>
  );
}
