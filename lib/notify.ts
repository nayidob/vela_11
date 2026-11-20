import { db } from "./store";
import { appUrl } from "./messages";

/* ---------------- Email ---------------- */

export async function sendEmail(to: string, msg: { subject: string; text: string; html: string }) {
  const from = process.env.EMAIL_FROM;
  if (process.env.RESEND_API_KEY && from) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: AbortSignal.timeout(8000),
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject: msg.subject, html: msg.html, text: msg.text }),
    });
    if (!res.ok) return { status: "failed" as const, detail: `Resend ${res.status}: ${(await res.text()).slice(0, 160)}` };
    return { status: "sent" as const, detail: "via Resend" };
  }
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    try {
      const nodemailer = await import("nodemailer");
      const t = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 465),
        secure: Number(process.env.SMTP_PORT || 465) === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        connectionTimeout: 8000,
        greetingTimeout: 8000,
        socketTimeout: 10000,
      });
      await t.sendMail({ from: from || process.env.SMTP_USER, to, subject: msg.subject, text: msg.text, html: msg.html });
      return { status: "sent" as const, detail: "via SMTP" };
    } catch (e) {
      return { status: "failed" as const, detail: `SMTP: ${(e as Error).message.slice(0, 160)}` };
    }
  }
  return { status: "preview" as const, detail: "No email provider configured, preview saved on the case" };
}

export function emailConfigured() {
  return Boolean((process.env.RESEND_API_KEY && process.env.EMAIL_FROM) || (process.env.SMTP_HOST && process.env.SMTP_USER));
}

/* ---------------- Telegram (doctor dispatch bot) ---------------- */

const TG = () => process.env.TELEGRAM_DOCTOR_BOT_TOKEN;

async function tg<T = unknown>(method: string, body: Record<string, unknown>) {
  const token = TG();
  if (!token) throw new Error("TELEGRAM_DOCTOR_BOT_TOKEN is not set");
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const data = (await res.json()) as { ok: boolean; result?: T; description?: string };
  if (!data.ok) throw new Error(data.description || `Telegram ${method} failed`);
  return data.result as T;
}

export async function doctorChatId() {
  return process.env.TELEGRAM_DOCTOR_CHAT_ID || (await db().get<string>("tg:doctor_chat")) || null;
}

export function telegramConfigured() {
  return Boolean(TG());
}

export function dispatchKeyboard(caseId: string, token: string, state: "new" | "accepted" | "en_route" | "done") {
  const view = { text: "Ver caso", url: `${appUrl()}/d/${token}` };
  const rows: { text: string; callback_data?: string; url?: string }[][] = [];
  if (state === "new")
    rows.push([
      { text: "✅ Aceptar", callback_data: `accept:${caseId}` },
      { text: "🚗 En camino", callback_data: `en_route:${caseId}` },
    ]);
  if (state === "accepted") rows.push([{ text: "🚗 En camino", callback_data: `en_route:${caseId}` }]);
  if (state === "en_route") rows.push([{ text: "🏁 Visita completada", callback_data: `completed:${caseId}` }]);
  // Telegram rejects http://localhost URL buttons, so only add the link on https
  if (view.url.startsWith("https://")) rows.push([view]);
  return { inline_keyboard: rows };
}

export async function sendDoctorTelegram(html: string, keyboard?: ReturnType<typeof dispatchKeyboard>) {
  const chatId = await doctorChatId();
  if (!TG()) return { status: "preview" as const, detail: "No Telegram bot configured" };
  if (!chatId) return { status: "failed" as const, detail: "Bot has no doctor chat yet. Send /vincular in the doctors' group." };
  try {
    const r = await tg<{ message_id: number }>("sendMessage", {
      chat_id: chatId,
      text: html,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: keyboard,
    });
    return { status: "sent" as const, detail: `chat ${chatId}`, chatId: String(chatId), messageId: r.message_id };
  } catch (e) {
    return { status: "failed" as const, detail: (e as Error).message };
  }
}

export async function editDoctorTelegram(
  chatId: string,
  messageId: number,
  html: string,
  keyboard?: ReturnType<typeof dispatchKeyboard>,
) {
  try {
    await tg("editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text: html,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: keyboard,
    });
  } catch {
    /* message may be too old or unchanged; ignore */
  }
}

export async function answerCallback(id: string, text: string) {
  try {
    await tg("answerCallbackQuery", { callback_query_id: id, text });
  } catch {
    /* ignore */
  }
}

export async function replyTelegram(chatId: number | string, html: string) {
  try {
    await tg("sendMessage", { chat_id: chatId, text: html, parse_mode: "HTML" });
  } catch {
    /* ignore */
  }
}

export async function setTelegramWebhook(url: string, secret: string) {
  return tg("setWebhook", { url, secret_token: secret, allowed_updates: ["message", "callback_query"] });
}

export async function telegramBotInfo() {
  return tg<{ username: string; first_name: string }>("getMe", {});
}
