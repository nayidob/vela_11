import { addEvent, caseForConversation, caseIdByConversation, listCases, updateCase } from "./cases";
import { verifyMember } from "./members";
import { findDuplicates, lookupMedication } from "./meds";
import { doctorTelegramHtml, emergencyTelegramHtml, patientEmail } from "./messages";
import { dispatchKeyboard, emailConfigured, sendDoctorTelegram, sendEmail } from "./notify";
import { nearestEmergencyRoom } from "./places";
import { pickDoctor } from "./roster";
import { clock } from "./time";
import { applyTriageRules } from "./triage";
import { TRIAGE_LABEL, type Case, type Channel } from "./types";

/**
 * Server tools called by the ElevenLabs agent. Each returns a small JSON
 * object. `agent_instruction` tells the LLM exactly what to say or do next,
 * which keeps behavior predictable on camera.
 */

type Params = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v));
const bool = (v: unknown) => v === true || str(v).toLowerCase() === "true" || str(v).toLowerCase() === "yes";

function channelOf(p: Params): Channel {
  const c = str(p.channel).toLowerCase();
  if (["web_voice", "phone", "telegram", "whatsapp", "simulated"].includes(c)) return c as Channel;
  if (/_tg_\d+$/.test(str(p.conversation_id))) return "telegram";
  return "unknown";
}

async function ctx(p: Params) {
  return caseForConversation(str(p.conversation_id) || undefined, channelOf(p));
}

/** Work that runs after the agent has its answer, so a slow Telegram or email never stalls the call. */
type Defer = (task: () => Promise<void>) => void;

export const TOOLS: Record<string, (p: Params, defer: Defer) => Promise<Record<string, unknown>>> = {
  /* 1 ─ tone / insight, fire-and-forget */
  async log_insight(p) {
    const c = await ctx(p);
    await addEvent(c.id, {
      kind: "insight",
      title: str(p.insight) || "Agent adapted its approach",
      source: "ElevenAgents",
      tone: "insight",
      tool: "log_insight",
    });
    return { ok: true };
  },

  /* 2 ─ identity */
  async verify_member(p) {
    const c = await ctx(p);
    const policy = str(p.policy_number);
    const name = str(p.patient_name);
    const r = verifyMember(policy, name);
    await updateCase(c.id, (x) => {
      if (name) x.patient.name = name;
      x.patient.policy = r.verified
        ? { number: r.member.policy, insurer: r.member.insurer, plan: r.member.plan, verified: true }
        : { number: policy, verified: false, note: r.reason };
      if (r.verified && !x.patient.age) x.patient.age = r.member.age;
    });
    await addEvent(c.id, {
      kind: "tool",
      tool: "verify_member",
      title: r.verified ? "Member verified" : "Policy not verified",
      detail: r.verified ? `${r.member.insurer} · ${r.member.plan} · home visits covered` : r.reason,
      source: "Insurer",
      tone: r.verified ? "good" : "warn",
    });
    if (r.verified)
      return {
        verified: true,
        insurer: r.member.insurer,
        plan: r.member.plan,
        home_visits_covered: true,
        age_on_file: r.member.age,
        agent_instruction: "Tell the caller their coverage is confirmed, then continue with location and symptoms. Don't ask their age; it is on file.",
      };
    return {
      verified: false,
      reason: r.reason,
      agent_instruction:
        "Ask the caller to read the policy number once more. If it still fails, say the team will check coverage later and continue. Never delay care over coverage.",
    };
  },

  /* 3 ─ open / update the case */
  async open_case(p, defer) {
    const c = await ctx(p);
    const updated = await updateCase(c.id, (x) => {
      const name = str(p.patient_name);
      if (name) x.patient.name = name;
      const email = str(p.patient_email);
      if (email && email !== "unknown" && email.includes("@")) x.patient.email = email;
      if (str(p.neighborhood)) x.patient.neighborhood = str(p.neighborhood);
      x.patient.city = str(p.city) || x.patient.city || "Medellín";
      if (p.is_alone !== undefined && p.is_alone !== "") x.patient.alone = bool(p.is_alone);
      if (str(p.chief_complaint)) x.complaint = str(p.chief_complaint);
      if (x.channel === "unknown" && channelOf(p) !== "unknown") x.channel = channelOf(p);
    });
    await addEvent(c.id, {
      kind: "tool",
      tool: "open_case",
      title: `Case ${updated.number} opened`,
      detail: [updated.patient.name, [updated.patient.neighborhood, updated.patient.city].filter(Boolean).join(", "), updated.complaint]
        .filter(Boolean)
        .join(" · "),
      source: "ElevenAgents",
    });
    // Warm the nearest-ER cache so a later emergency answers instantly.
    defer(async () => {
      await nearestEmergencyRoom(updated.patient.neighborhood, updated.patient.city);
    });
    return {
      case_number: updated.number,
      has_email: Boolean(updated.patient.email),
      agent_instruction: updated.patient.email
        ? "Continue the intake, one question at a time."
        : "Continue the intake. Before dispatching, ask for an email address for the confirmation.",
    };
  },

  /* 4 ─ medication safety */
  async check_medication(p) {
    const c = await ctx(p);
    const name = str(p.medication_name);
    if (!name) return { error: "medication_name is required" };
    const entry = await lookupMedication(name);
    const updated = await updateCase(c.id, (x) => {
      x.meds = [...x.meds.filter((m) => m.reported.toLowerCase() !== name.toLowerCase()), entry];
    });
    const dups = findDuplicates(updated.meds);
    await addEvent(c.id, {
      kind: "tool",
      tool: "check_medication",
      title: entry.ingredients.length ? `${name} identified` : `${name} could not be identified`,
      detail: entry.ingredients.length
        ? `Active ingredient${entry.ingredients.length > 1 ? "s" : ""}: ${entry.ingredients.join(", ")}`
        : "The doctor will check it in person",
      source: entry.source,
      tone: entry.ingredients.length ? "neutral" : "warn",
    });
    const newDups = dups.filter((d) => d.names.some((n) => n.toLowerCase() === name.toLowerCase()));
    if (newDups.length) {
      const alert = newDups.map((d) => `Duplicate ${d.ingredient}: ${d.names.join(" + ")}`).join("; ");
      await updateCase(c.id, (x) => {
        x.alerts = [...new Set([...x.alerts, alert])];
      });
      await addEvent(c.id, {
        kind: "safety",
        title: "Duplicate medication detected",
        detail: `${newDups[0].names.join(" and ")} both contain ${newDups[0].ingredient}`,
        source: "Rules",
        tone: "danger",
      });
      return {
        medication: name,
        active_ingredients: entry.ingredients,
        duplicate_warning: true,
        duplicates: newDups,
        agent_instruction: `Calmly explain that ${newDups[0].names.join(" and ")} contain the same medicine, ${newDups[0].ingredient}, and ask the caller not to take more of either until the doctor reviews them. Do not mention doses.`,
      };
    }
    return {
      medication: name,
      active_ingredients: entry.ingredients,
      identified: entry.ingredients.length > 0,
      duplicate_warning: false,
      agent_instruction: "Acknowledge briefly and ask about any other medication taken in the last 24 hours.",
    };
  },

  /* 5 ─ triage with a deterministic safety floor */
  async assess_triage(p, defer) {
    const c = await ctx(p);
    const r = applyTriageRules(p.age == null && c.patient.age ? { ...p, age: c.patient.age } : p);
    // An emergency is never downgraded later in the same call, or dispatch_doctor would unlock.
    const wasEscalated = c.status === "escalated";
    if (wasEscalated && r.final !== "EMERGENCY") {
      r.final = "EMERGENCY";
      r.reasons.push("Already escalated earlier in this call");
    }
    const updated = await updateCase(c.id, (x) => {
      x.triage = r.final;
      x.triageReasons = r.reasons;
      x.triageReasonsEs = r.reasonsEs;
      if (str(p.chief_complaint)) x.complaint = str(p.chief_complaint);
      x.symptoms = {
        summary: str(p.symptoms_summary) || x.symptoms?.summary,
        temperatureC: r.vitals.temp,
        pain: r.vitals.pain,
        onsetHours: r.vitals.onset,
        fluidsHours: r.vitals.fluids,
        redFlags: r.redFlags,
        pregnant: r.vitals.pregnant,
      };
      if (r.vitals.age) x.patient.age = r.vitals.age;
      x.status = r.final === "EMERGENCY" ? "escalated" : "triaged";
    });
    await addEvent(c.id, {
      kind: "tool",
      tool: "assess_triage",
      title: `Triage: ${TRIAGE_LABEL[r.final]}`,
      detail: r.raisedByRules
        ? `Agent proposed ${TRIAGE_LABEL[r.proposed]}; safety rules raised it. ${r.reasons.join("; ")}`
        : r.reasons.join("; ") || "No escalation criteria met",
      source: "Rules",
      tone: r.final === "EMERGENCY" ? "danger" : r.final === "URGENT" ? "warn" : "neutral",
    });

    if (r.final === "EMERGENCY") {
      const repeat = wasEscalated && Boolean(c.er);
      const er = repeat ? c.er! : await nearestEmergencyRoom(updated.patient.neighborhood, updated.patient.city);
      if (!repeat) {
        const esc = await updateCase(c.id, (x) => {
          x.er = er;
        });
        await addEvent(c.id, {
          kind: "safety",
          title: "Emergency escalated to 123",
          detail: `Nearest emergency department: ${er.name}, ${er.distanceKm} km`,
          source: er.source,
          tone: "danger",
        });
        defer(async () => {
          const tgr = await sendDoctorTelegram(emergencyTelegramHtml(esc));
          await updateCase(c.id, (x) => {
            x.notifications.push({ kind: "telegram", to: "Doctors on call", status: tgr.status, at: Date.now(), detail: tgr.detail });
          });
        });
      }
      return {
        final_level: "EMERGENCY",
        red_flags: r.redFlags,
        nearest_emergency_department: er.name,
        distance_km: er.distanceKm,
        dispatch_allowed: false,
        agent_instruction: `This is an emergency. Tell the caller, calmly and clearly, to hang up and call 123 now. Tell them the nearest emergency department is ${er.name}, about ${er.distanceKm} km away. Do not book a home visit. Stay with them only until they confirm they will call.`,
      };
    }
    return {
      final_level: r.final,
      raised_by_safety_rules: r.raisedByRules,
      reasons: r.reasons,
      dispatch_allowed: r.final !== "SELF_CARE",
      agent_instruction:
        r.final === "SELF_CARE"
          ? "Offer a morning home visit or safe comfort guidance. If they want a visit now, call dispatch_doctor."
          : "Tell the caller you are arranging a doctor to come to them now, then call dispatch_doctor.",
    };
  },

  /* 6 ─ dispatch + notifications */
  async dispatch_doctor(p, defer) {
    const c = await ctx(p);
    if (c.triage === "EMERGENCY")
      return {
        dispatched: false,
        agent_instruction: "Emergency cases are never dispatched. Repeat that the caller must call 123 now.",
      };
    if (c.triage === "PENDING")
      return { dispatched: false, agent_instruction: "Call assess_triage first, then dispatch_doctor." };
    if (c.doctor)
      return {
        dispatched: true,
        already_dispatched: true,
        doctor_name: c.doctor.name,
        eta_clock: c.etaAt ? clock(c.etaAt) : undefined,
        eta_minutes: c.etaMinutes,
        case_number: c.number,
        agent_instruction: "The doctor is already on this case. Read back the details.",
      };

    const open = await listCases(80);
    const pick = await pickDoctor(c, open, c.triage);
    const now = Date.now();
    const email = str(p.patient_email);
    const updated = await updateCase(c.id, (x) => {
      x.doctor = pick.doctor;
      x.etaMinutes = pick.eta;
      x.etaAt = now + pick.eta * 60_000;
      x.dispatchedAt = now;
      x.status = "dispatched";
      if (str(p.symptoms_summary_en)) x.summaryEn = str(p.symptoms_summary_en);
      if (str(p.briefing_es)) x.briefingEs = str(p.briefing_es);
      if (email.includes("@")) x.patient.email = email;
    });
    await addEvent(c.id, {
      kind: "tool",
      tool: "dispatch_doctor",
      title: `${pick.doctor.name} dispatched`,
      detail: `ETA ${clock(updated.etaAt!)} (${pick.eta} min) · ${pick.doctor.zone} · target ${pick.targetMinutes / 60} h${pick.withinTarget ? "" : ", over target"}`,
      source: "Roster",
      tone: "good",
    });

    const to = updated.patient.email;
    const emailing = Boolean(to) && emailConfigured();
    defer(() => notifyDispatch(updated));

    return {
      dispatched: true,
      doctor_name: pick.doctor.name,
      eta_clock: clock(updated.etaAt!),
      eta_minutes: pick.eta,
      case_number: updated.number,
      confirmation_email_sent_to: emailing ? to : null,
      agent_instruction: `Read back: ${pick.doctor.name} will arrive around ${clock(updated.etaAt!)}, in about ${pick.eta} minutes, case number ending in ${updated.number.slice(-4).split("").join(" ")}.${
        emailing ? ` Say you're emailing the confirmation to ${to}.` : ""
      } Give the while-you-wait guidance and remind them to call 123 if anything gets worse.`,
    };
  },
};

/** Spanish briefing to the doctors' Telegram group and English confirmation email to the patient. */
async function notifyDispatch(c: Case) {
  const tgr = await sendDoctorTelegram(doctorTelegramHtml(c), dispatchKeyboard(c.id, c.doctorToken, "new"));
  await addEvent(c.id, {
    kind: "notify",
    title: tgr.status === "sent" ? "Spanish briefing sent to doctor" : "Doctor briefing not sent",
    detail: tgr.status === "sent" ? "Telegram, doctors on call" : tgr.detail,
    source: "Telegram",
    tone: tgr.status === "sent" ? "good" : "warn",
  });

  const msg = patientEmail(c);
  const to = c.patient.email;
  const er = to ? await sendEmail(to, msg) : { status: "preview" as const, detail: "No patient email on file" };
  await addEvent(c.id, {
    kind: "notify",
    title: er.status === "sent" ? "Confirmation emailed to patient" : er.status === "preview" ? "Confirmation email ready" : "Confirmation email failed",
    detail: to ? `${to}${er.detail ? ` · ${er.detail}` : ""}` : er.detail,
    source: "Email",
    tone: er.status === "sent" ? "good" : "warn",
  });

  await updateCase(c.id, (x) => {
    x.emailHtml = msg.html;
    x.notifications.push(
      { kind: "telegram", to: "Doctors on call", status: tgr.status, at: Date.now(), detail: tgr.detail },
      { kind: "email", to: to ?? "—", status: er.status, at: Date.now(), detail: er.detail },
    );
    if ("messageId" in tgr && tgr.messageId) x.telegramMessage = { chatId: tgr.chatId!, messageId: tgr.messageId };
  });
}

async function logFailure(name: string, params: Params, e: unknown) {
  const cid = str(params.conversation_id);
  if (!cid) return;
  const id = await caseIdByConversation(cid).catch(() => null);
  if (id) await addEvent(id, { kind: "system", title: `Tool ${name} failed`, detail: (e as Error).message, tone: "warn" }).catch(() => {});
}

/** `background`, when present, must be awaited after the response is sent (Next's `after`). */
export async function runTool(name: string, params: Params) {
  const fn = TOOLS[name];
  if (!fn) return { status: 404, body: { error: `Unknown tool ${name}` } };
  const tasks: (() => Promise<void>)[] = [];
  try {
    const body = await fn(params, (t) => tasks.push(t));
    const background = tasks.length
      ? async () => {
          for (const t of tasks) await t().catch((e) => logFailure(name, params, e));
        }
      : undefined;
    return { status: 200, body, background };
  } catch (e) {
    await logFailure(name, params, e);
    return {
      status: 200,
      body: {
        error: (e as Error).message,
        agent_instruction: "Apologize briefly, retry once, and if it fails again tell the caller a human coordinator will call them back within 10 minutes.",
      },
    };
  }
}
