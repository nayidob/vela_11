import { CallPanel } from "../components/CallPanel";
import { LogoMark } from "../components/ui";

export const dynamic = "force-dynamic";

export default function PatientLine() {
  const tg = process.env.TELEGRAM_PATIENT_BOT_USERNAME;
  return (
    <main className="patient">
      <div className="patient-intro">
        <LogoMark size={34} />
        <h1>Feeling unwell tonight?</h1>
        <p>Talk to Vela in English. We'll check what's going on and, if you need it, send a doctor to where you're staying.</p>
      </div>
      <CallPanel
        heading="Call Vela"
        sub="Usually answers in a second. Speak naturally."
        telegramUrl={tg ? `https://t.me/${tg.replace(/^@/, "")}` : undefined}
      />
    </main>
  );
}
