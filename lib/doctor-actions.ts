import { addEvent, getCase, updateCase } from "./cases";
import { doctorTelegramHtml, statusLineEs } from "./messages";
import { dispatchKeyboard, editDoctorTelegram } from "./notify";
import type { Case } from "./types";

export type DoctorAction = "accept" | "en_route" | "completed";

const NEXT: Record<DoctorAction, Case["status"]> = {
  accept: "accepted",
  en_route: "en_route",
  completed: "completed",
};

const TITLE: Record<DoctorAction, string> = {
  accept: "Doctor accepted the visit",
  en_route: "Doctor is on the way",
  completed: "Visit completed",
};

/** `message` is the Telegram message the button was pressed on; it backfills the reference when the original send timed out. */
export async function applyDoctorAction(
  caseId: string,
  action: DoctorAction,
  via: "Telegram" | "Doctor",
  message?: { chatId: string; messageId: number },
) {
  const c = await getCase(caseId);
  if (!c) throw new Error("Case not found");
  if (!c.doctor) throw new Error("No doctor has been dispatched for this case");
  const status = NEXT[action];
  const updated = await updateCase(caseId, (x) => {
    x.status = status;
    if (message && !x.telegramMessage) {
      x.telegramMessage = message;
      const n = x.notifications.findLast((n) => n.kind === "telegram" && n.status === "failed");
      if (n) Object.assign(n, { status: "sent", detail: "Delivered late; confirmed by the doctor's button press" });
    }
  });
  await addEvent(caseId, {
    kind: "status",
    title: TITLE[action],
    detail: `${c.doctor.name}${via === "Telegram" ? ", from Telegram" : ", from the doctor view"}`,
    source: via,
    tone: "good",
  });
  if (updated.telegramMessage) {
    const state = status === "accepted" ? "accepted" : status === "en_route" ? "en_route" : "done";
    await editDoctorTelegram(
      updated.telegramMessage.chatId,
      updated.telegramMessage.messageId,
      `${doctorTelegramHtml(updated)}\n\n<b>${statusLineEs(status, c.doctor.name)}</b>`,
      dispatchKeyboard(updated.id, updated.doctorToken, state),
    );
  }
  return updated;
}
