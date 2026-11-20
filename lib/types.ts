export type Triage = "EMERGENCY" | "URGENT" | "STANDARD" | "SELF_CARE" | "PENDING";

export type CaseStatus =
  | "intake" // call in progress, case opened
  | "triaged" // triage level assigned, not dispatched
  | "dispatched" // doctor assigned, waiting for acceptance
  | "accepted" // doctor accepted
  | "en_route" // doctor on the way
  | "completed" // visit done
  | "escalated"; // emergency, sent to 123

export type Channel = "web_voice" | "phone" | "telegram" | "whatsapp" | "simulated" | "unknown";

export type EventTone = "neutral" | "good" | "warn" | "danger" | "insight";

export type DataSource =
  | "ElevenAgents"
  | "INVIMA"
  | "openFDA"
  | "Brand list"
  | "Offline list"
  | "OpenStreetMap"
  | "Insurer"
  | "Roster"
  | "Telegram"
  | "Email"
  | "Rules"
  | "Doctor";

export interface CaseEvent {
  id: string;
  at: number;
  kind: "tool" | "insight" | "safety" | "notify" | "status" | "system";
  title: string;
  detail?: string;
  source?: DataSource;
  tone?: EventTone;
  tool?: string;
}

export interface MedicationEntry {
  reported: string;
  ingredients: string[]; // canonical English names
  source: DataSource;
  matched?: string; // product name matched in the source
}

export interface Doctor {
  id: string;
  name: string;
  zone: string;
  phone: string;
  lat: number;
  lon: number;
}

export interface Notification {
  kind: "email" | "telegram";
  to: string;
  status: "sent" | "preview" | "failed";
  at: number;
  detail?: string;
}

export interface TranscriptTurn {
  role: "agent" | "user";
  text: string;
  t?: number;
}

export interface CriterionResult {
  id: string;
  label?: string;
  result: "success" | "failure" | "unknown";
  rationale?: string;
}

export interface Case {
  id: string;
  number: string;
  conversationId?: string;
  channel: Channel;
  createdAt: number;
  updatedAt: number;
  status: CaseStatus;
  triage: Triage;
  triageReasons: string[];
  triageReasonsEs?: string[];
  callActive: boolean;
  patient: {
    name: string;
    email?: string;
    neighborhood?: string;
    city?: string;
    alone?: boolean;
    age?: number;
    policy?: {
      number: string;
      insurer?: string;
      plan?: string;
      verified: boolean;
      note?: string;
    };
  };
  complaint?: string;
  symptoms?: {
    summary?: string;
    temperatureC?: number;
    pain?: number;
    onsetHours?: number;
    fluidsHours?: number;
    redFlags?: string[];
    pregnant?: boolean;
  };
  summaryEn?: string;
  briefingEs?: string;
  meds: MedicationEntry[];
  alerts: string[];
  doctor?: Doctor;
  etaMinutes?: number;
  etaAt?: number;
  dispatchedAt?: number;
  doctorToken: string;
  er?: { name: string; distanceKm: number; address?: string; source: DataSource };
  notifications: Notification[];
  emailHtml?: string;
  transcript: TranscriptTurn[];
  analysis?: {
    summary?: string;
    callSuccessful?: string;
    criteria: CriterionResult[];
    data: { id: string; label?: string; value: unknown }[];
    durationSecs?: number;
    cost?: number;
    terminationReason?: string;
  };
  telegramMessage?: { chatId: string; messageId: number };
  seeded?: boolean;
}

export type CaseWithEvents = Case & { events: CaseEvent[] };

export const TRIAGE_ORDER: Record<Triage, number> = {
  PENDING: 0,
  SELF_CARE: 1,
  STANDARD: 2,
  URGENT: 3,
  EMERGENCY: 4,
};

export const TRIAGE_LABEL: Record<Triage, string> = {
  EMERGENCY: "Emergency",
  URGENT: "Urgent",
  STANDARD: "Standard",
  SELF_CARE: "Self-care",
  PENDING: "Not triaged",
};

export const TRIAGE_LABEL_ES: Record<Triage, string> = {
  EMERGENCY: "EMERGENCIA",
  URGENT: "URGENTE",
  STANDARD: "ESTÁNDAR",
  SELF_CARE: "AUTOCUIDADO",
  PENDING: "SIN TRIAGE",
};

export const STATUS_LABEL: Record<CaseStatus, string> = {
  intake: "Intake",
  triaged: "Triaged",
  dispatched: "Doctor assigned",
  accepted: "Doctor accepted",
  en_route: "Doctor on the way",
  completed: "Completed",
  escalated: "Sent to 123",
};
