import { NextResponse } from "next/server";
import { applyDoctorAction, type DoctorAction } from "@/lib/doctor-actions";
import { answerCallback, replyTelegram } from "@/lib/notify";
import { db } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * Webhook for the doctor dispatch bot.
 *  - "/vincular" in a group links that chat as the on-call doctors' channel. Private chats
 *    are refused because Telegram sends /start automatically when anyone opens the bot.
 *  - Inline buttons (Aceptar / En camino / Visita completada) update the case live.
 */
export async function POST(req: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && req.headers.get("x-telegram-bot-api-secret-token") !== secret)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const u = (await req.json()) as any;

  if (u.message?.text) {
    const text: string = u.message.text.trim();
    const chat = u.message.chat;
    const pinned = process.env.TELEGRAM_DOCTOR_CHAT_ID;
    if (/^\/vincular(@\w+)?/i.test(text)) {
      if (chat.type !== "group" && chat.type !== "supergroup") {
        await replyTelegram(chat.id, "Agrega este bot al grupo de médicos de turno y envía /vincular allí.");
      } else if (pinned && pinned !== String(chat.id)) {
        await replyTelegram(chat.id, "⚠️ El grupo de turno está fijado en la configuración (TELEGRAM_DOCTOR_CHAT_ID).");
      } else {
        await db().set("tg:doctor_chat", String(chat.id), 60 * 60 * 24 * 90);
        await replyTelegram(
          chat.id,
          `✅ <b>Chat vinculado</b>\nLas nuevas visitas de Vela Night Care llegarán aquí.\n<i>Chat ID: ${chat.id}</i>`,
        );
      }
    } else if (/^\/start(@\w+)?/i.test(text) && chat.type === "private") {
      await replyTelegram(chat.id, "Este bot es solo para el equipo médico de turno de Vela Night Care.");
    }
    return NextResponse.json({ ok: true });
  }

  if (u.callback_query) {
    const q = u.callback_query;
    const [action, caseId] = String(q.data || "").split(":") as [DoctorAction, string];
    const message = q.message?.message_id
      ? { chatId: String(q.message.chat.id), messageId: Number(q.message.message_id) }
      : undefined;
    try {
      await applyDoctorAction(caseId, action, "Telegram", message);
      const label = action === "accept" ? "Visita aceptada" : action === "en_route" ? "Marcado en camino" : "Visita completada";
      await answerCallback(q.id, label);
    } catch (e) {
      await answerCallback(q.id, (e as Error).message.slice(0, 180));
    }
  }
  return NextResponse.json({ ok: true });
}
