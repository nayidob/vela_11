import { randomBytes, randomUUID } from "node:crypto";
import { doctorTelegramHtml, emergencyTelegramHtml } from "./messages";
import { db } from "./store";
import { caseNumber } from "./time";
import type { Case, CaseEvent, CaseWithEvents, Channel } from "./types";

const K = {
  case: (id: string) => `case:${id}`,
  events: (id: string) => `case:${id}:events`,
  conv: (cid: string) => `conv:${cid}`,
  token: (t: string) => `token:${t}`,
  index: "cases",
  seq: "seq",
};

function newId() {
  return randomUUID().slice(0, 8);
}

async function nextSeq() {
  return 140 + (await db().incr(K.seq));
}

export async function createCase(init: Partial<Case> & { channel: Channel }): Promise<Case> {
  return (await insertCase(init)).case;
}

/**
 * Tool calls for a new conversation can arrive at the same time. The case is
 * written before the conversation is claimed, so a request that loses the
 * claim can always read the winner's case and drops its own.
 */
async function insertCase(init: Partial<Case> & { channel: Channel }): Promise<{ case: Case; created: boolean }> {
  const now = init.createdAt ?? Date.now();
  const c: Case = {
    id: newId(),
    number: caseNumber(now, await nextSeq()),
    createdAt: now,
    updatedAt: now,
    status: "intake",
    triage: "PENDING",
    triageReasons: [],
    callActive: true,
    patient: { name: "Unknown caller" },
    meds: [],
    alerts: [],
    notifications: [],
    transcript: [],
    doctorToken: randomBytes(9).toString("base64url"),
    ...init,
  };
  await db().set(K.case(c.id), c);
  await db().set(K.token(c.doctorToken), c.id);
  if (c.conversationId && !(await db().setnx(K.conv(c.conversationId), c.id))) {
    const existingId = await caseIdByConversation(c.conversationId);
    const existing = existingId ? await getCase(existingId) : null;
    if (existing) {
      await db().del(K.case(c.id));
      await db().del(K.token(c.doctorToken));
      return { case: existing, created: false };
    }
    await db().set(K.conv(c.conversationId), c.id);
  }
  await db().lpush(K.index, c.id);
  return { case: c, created: true };
}

export async function getCase(id: string): Promise<Case | null> {
  return db().get<Case>(K.case(id));
}

export async function getCaseWithEvents(id: string): Promise<CaseWithEvents | null> {
  const c = await getCase(id);
  if (!c) return null;
  const events = await db().rrange<CaseEvent>(K.events(id));
  return { ...c, events };
}

export async function caseIdByConversation(cid: string) {
  return db().get<string>(K.conv(cid));
}

export async function caseByToken(token: string) {
  const id = await db().get<string>(K.token(token));
  return id ? getCaseWithEvents(id) : null;
}

/**
 * Every tool call carries the ElevenLabs conversation ID (mapped from the
 * system__conversation_id dynamic variable), so the agent never has to
 * remember a case ID. The first tool that fires opens the case.
 */
export async function caseForConversation(
  cid: string | undefined,
  channel: Channel = "unknown",
): Promise<Case> {
  if (cid) {
    const id = await caseIdByConversation(cid);
    if (id) {
      const c = await getCase(id);
      if (c) return c;
    }
  }
  const { case: c, created } = await insertCase({ conversationId: cid || undefined, channel });
  if (!created) return c;
  await addEvent(c.id, {
    kind: "system",
    title: "Conversation started",
    detail: cid ? `Conversation ${cid}` : "No conversation ID was passed to the tool",
    source: "ElevenAgents",
  });
  return c;
}

export async function updateCase(id: string, patch: (c: Case) => Case | void): Promise<Case> {
  const c = await getCase(id);
  if (!c) throw new Error(`Case ${id} not found`);
  const next = patch(c) ?? c;
  next.updatedAt = Date.now();
  await db().set(K.case(id), next);
  if (next.conversationId) await db().set(K.conv(next.conversationId), id);
  return next;
}

export async function addEvent(id: string, e: Omit<CaseEvent, "id" | "at"> & { at?: number }) {
  const ev: CaseEvent = { id: newId(), at: e.at ?? Date.now(), ...e };
  await db().rpush(K.events(id), ev);
  return ev;
}

/** Case documents without their event logs: two Redis commands however many cases there are. */
export async function listCases(limit = 60): Promise<Case[]> {
  const ids = (await db().lrange(K.index)).slice(0, limit);
  const out = await db().mget<Case>(ids.map(K.case));
  return out.filter(Boolean) as Case[];
}

export async function deleteAllCases() {
  const ids = await db().lrange(K.index);
  for (const id of ids) {
    const c = await getCase(id);
    if (c?.conversationId) await db().del(K.conv(c.conversationId));
    if (c?.doctorToken) await db().del(K.token(c.doctorToken));
    await db().del(K.case(id));
    await db().del(K.events(id));
  }
  await db().del(K.index);
}

/**
 * Trimmed view for the console. The doctor link stays in because the
 * console is the dispatcher's internal tool (synthetic data only).
 */
export function publicView<T extends Case>(c: T) {
  const { emailHtml: _e, telegramMessage: _m, ...rest } = c;
  const telegramPreview = c.doctor
    ? doctorTelegramHtml(c)
    : c.triage === "EMERGENCY" && c.er
      ? emergencyTelegramHtml(c)
      : null;
  return { ...rest, hasEmailPreview: Boolean(c.emailHtml), telegramPreview };
}
export type PublicCase = ReturnType<typeof publicView<CaseWithEvents>>;
export type BoardCase = ReturnType<typeof publicView<Case>>;
