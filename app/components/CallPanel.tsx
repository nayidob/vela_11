"use client";

import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { useEffect, useRef, useState } from "react";
import { Transcript } from "./CasePanel";
import { LogoMark } from "./ui";

export type Turn = { role: "agent" | "user"; text: string };

type Props = {
  onConversation?: (conversationId: string | null) => void;
  onTurns?: (turns: Turn[]) => void;
  showTranscript?: boolean;
  heading?: string;
  sub?: string;
  telegramUrl?: string;
};

export function CallPanel(props: Props) {
  return (
    <ConversationProvider>
      <CallInner {...props} />
    </ConversationProvider>
  );
}

function PhoneIcon({ off }: { off?: boolean }) {
  return off ? (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 9c-1.6 0-3.1.3-4.5.8v3.1c0 .4-.2.7-.6.9-1 .5-1.9 1.1-2.6 1.8-.2.2-.4.3-.7.3s-.5-.1-.7-.3L.3 13.1c-.2-.2-.3-.4-.3-.7s.1-.5.3-.7C3.3 8.8 7.4 7 12 7s8.7 1.8 11.7 4.7c.2.2.3.4.3.7s-.1.5-.3.7l-2.5 2.5c-.2.2-.4.3-.7.3s-.5-.1-.7-.3c-.8-.7-1.6-1.3-2.6-1.8-.3-.2-.6-.5-.6-.9V9.8C15.1 9.3 13.6 9 12 9Z" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1l-2.3 2.2Z" />
    </svg>
  );
}

function CallInner({ onConversation, onTurns, showTranscript = true, heading, sub, telegramUrl }: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const orbRef = useRef<HTMLButtonElement>(null);
  const convId = useRef<string | null>(null);

  useEffect(() => {
    try {
      setName(localStorage.getItem("vela:name") ?? "");
      setEmail(localStorage.getItem("vela:email") ?? "");
    } catch {
      /* storage unavailable */
    }
  }, []);

  const conversation = useConversation({
    onConnect: ({ conversationId }) => {
      convId.current = conversationId;
      onConversation?.(conversationId);
      fetch("/api/calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "start", conversationId, name, email }),
      }).catch(() => {});
    },
    onDisconnect: () => {
      if (convId.current)
        fetch("/api/calls", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event: "end", conversationId: convId.current }),
        }).catch(() => {});
    },
    onMessage: (m) => {
      // Expressive voices emit audio tags like "[calm]"; they shape the voice but shouldn't show as text.
      const text = m.message?.replace(/\[[a-z][a-z -]*\]\s*/gi, "").trim();
      if (!text) return;
      setTurns((t) => {
        const next = [...t, { role: (m.role === "user" ? "user" : "agent") as Turn["role"], text }];
        onTurns?.(next);
        return next;
      });
    },
    onError: (message) => setErr(typeof message === "string" ? message : "The call ran into a problem."),
  });

  const { status, isSpeaking } = conversation;
  const active = status === "connected";

  // Let the orb breathe with the agent's voice.
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const loop = () => {
      const v = isSpeaking ? conversation.getOutputVolume() : conversation.getInputVolume() * 0.6;
      orbRef.current?.style.setProperty("--s", String(Math.min(1.6, 0.35 + v * 3)));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active, isSpeaking, conversation]);

  async function start() {
    setErr(null);
    setStarting(true);
    try {
      try {
        localStorage.setItem("vela:name", name);
        localStorage.setItem("vela:email", email);
      } catch {
        /* ignore */
      }
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = await fetch("/api/session", { cache: "no-store" });
      const s = await r.json();
      if (!r.ok) throw new Error(s.error || "Could not start the call");
      setTurns([]);
      onTurns?.([]);
      const dynamicVariables = {
        patient_name: name.trim() || "unknown",
        patient_email: email.trim() || "unknown",
        channel: "web_voice",
      };
      if (s.mode === "token") conversation.startSession({ conversationToken: s.conversationToken, connectionType: "webrtc", dynamicVariables });
      else conversation.startSession({ agentId: s.agentId, connectionType: "webrtc", dynamicVariables });
    } catch (e) {
      const msg = (e as Error).message;
      setErr(/permission|denied|NotAllowed/i.test(msg) ? "Allow microphone access to talk to Vela." : msg);
    } finally {
      setStarting(false);
    }
  }

  function end() {
    conversation.endSession();
    onConversation?.(convId.current);
  }

  const state =
    status === "connecting" || starting
      ? "Connecting…"
      : active
        ? isSpeaking
          ? "Vela is speaking"
          : "Listening"
        : "";

  return (
    <>
      <section className="call">
        <LogoMark size={26} />
        <h2>{heading ?? "Talk to Vela"}</h2>
        <p>{sub ?? "After-hours medical intake in English. A doctor can come to you tonight."}</p>
        <div className="orb-wrap">
          <button
            ref={orbRef}
            className={`orb${active ? "" : " idle"}`}
            onClick={active ? end : start}
            disabled={starting || status === "connecting"}
            aria-label={active ? "End call" : "Start call"}
          >
            <PhoneIcon off={active} />
          </button>
        </div>
        <div className="call-state" aria-live="polite">
          {err ? <span style={{ color: "var(--danger)" }}>{err}</span> : state || (active ? "" : "Tap to call")}
        </div>
        {!active && (
          <div className="call-form">
            <div className="field">
              <label htmlFor="pname">Your name</label>
              <input id="pname" value={name} onChange={(e) => setName(e.target.value)} placeholder="Mark Ellison" autoComplete="name" />
            </div>
            <div className="field">
              <label htmlFor="pemail">Email for your visit confirmation</label>
              <input
                id="pemail"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
              />
            </div>
          </div>
        )}
        {telegramUrl && !active && (
          <p className="call-alt">
            Prefer to text? <a href={telegramUrl} target="_blank" rel="noreferrer">Message Vela on Telegram</a>
          </p>
        )}
        <p className="disclaimer">
          Demo service for a technical take-home. Use made-up details. If this were a real emergency, you would call 123.
        </p>
      </section>
      {showTranscript && (
        <section className="panel">
          <h3>Conversation</h3>
          <Transcript turns={turns} live />
        </section>
      )}
    </>
  );
}
