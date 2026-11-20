import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Returns credentials for the browser call. With ELEVENLABS_API_KEY set the
 * agent can stay private (WebRTC conversation token, minted server-side).
 * Without it, the agent must be public and the browser connects by agent ID.
 */
export async function GET() {
  const agentId = process.env.ELEVENLABS_AGENT_ID || process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID;
  if (!agentId) return NextResponse.json({ error: "ELEVENLABS_AGENT_ID is not set" }, { status: 500 });
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return NextResponse.json({ mode: "public", agentId });
  const res = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${encodeURIComponent(agentId)}`,
    { headers: { "xi-api-key": key }, cache: "no-store" },
  );
  if (!res.ok) {
    return NextResponse.json(
      { error: `ElevenLabs token request failed (${res.status})`, detail: (await res.text()).slice(0, 200) },
      { status: 502 },
    );
  }
  const { token } = (await res.json()) as { token: string };
  return NextResponse.json({ mode: "token", conversationToken: token });
}
