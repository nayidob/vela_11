import { NextResponse } from "next/server";
import { demoAuthorized } from "@/lib/auth";
import { appUrl } from "@/lib/messages";
import { doctorChatId, setTelegramWebhook, telegramBotInfo } from "@/lib/notify";

export const dynamic = "force-dynamic";

/** Open /api/telegram/setup once after deploying to register the bot's webhook. */
export async function GET(req: Request) {
  if (!demoAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!process.env.TELEGRAM_DOCTOR_BOT_TOKEN)
    return NextResponse.json({ error: "Set TELEGRAM_DOCTOR_BOT_TOKEN first" }, { status: 400 });
  const url = `${appUrl()}/api/telegram/webhook`;
  if (!url.startsWith("https://"))
    return NextResponse.json({ error: `Telegram needs a public https URL. Current app URL: ${url}` }, { status: 400 });
  try {
    const bot = await telegramBotInfo();
    await setTelegramWebhook(url, process.env.TELEGRAM_WEBHOOK_SECRET || "");
    return NextResponse.json({
      ok: true,
      bot: `@${bot.username}`,
      webhook: url,
      linkedChat: await doctorChatId(),
      next: "Add the bot to your doctors' group and send /vincular there.",
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
