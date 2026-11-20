// Writes the six ElevenLabs webhook tool configs to elevenlabs/tools/ in the dashboard's
// "Edit as JSON" format. The x-vela-secret header is added in the form as a Secret.
// Usage: node elevenlabs/make-tools.mjs [https://your-app.vercel.app]
import { mkdirSync, writeFileSync } from "node:fs";

const base = (process.argv[2] || "https://vela-night-care.vercel.app").replace(/\/$/, "");

const prop = (id, type, description, required = false, extra = {}) => ({
  id,
  type,
  description,
  dynamic_variable: "",
  constant_value: "",
  value_type: "llm_prompt",
  required,
  enum: null,
  ...extra,
});
const dyn = (id, variable) => ({ ...prop(id, "string", ""), dynamic_variable: variable, value_type: "dynamic_variable" });

const tool = (name, path, description, props, opts = {}) => ({
  type: "webhook",
  name,
  description,
  api_schema: {
    url: `${base}/api/tools/${path}`,
    method: "POST",
    path_params_schema: [],
    query_params_schema: [],
    request_body_schema: {
      id: "body",
      type: "object",
      description: `Details for ${name}`,
      required: true,
      properties: [dyn("conversation_id", "system__conversation_id"), dyn("channel", "channel"), ...props],
      value_type: "llm_prompt",
    },
    request_headers: [],
    content_type: "application/json",
    auth_connection: null,
    mtls_auth_connection: null,
    response_filter: null,
  },
  response_timeout_secs: opts.timeout ?? 20,
  follow_redirects: false,
  follow_redirects_allowed_domains: [],
  dynamic_variables: { dynamic_variable_placeholders: {} },
  assignments: [],
  interruption_mode: "allow",
  pre_tool_speech: "auto",
  tool_call_sound: null,
  tool_call_sound_behavior: "auto",
  execution_mode: opts.execution ?? "immediate",
  tool_error_handling_mode: "auto",
  response_mocks: [],
});

const tools = [
  tool(
    "log_insight",
    "log-insight",
    "Log how you are adapting to the caller's emotional state.",
    [prop("insight", "string", "One short sentence on how you're adapting to the caller", true)],
    { execution: "async" },
  ),
  tool("verify_member", "verify-member", "Verify the caller's travel insurance before asking for case details.", [
    prop("policy_number", "string", "The policy number exactly as the caller read it, letters and digits", true),
    prop("patient_name", "string", "The caller's full name", true),
  ]),
  tool("open_case", "open-case", "Open or update the case once you know name, location and main complaint.", [
    prop("patient_name", "string", "The caller's full name"),
    prop("neighborhood", "string", "Neighborhood where the caller is staying, e.g. El Poblado"),
    prop("city", "string", "City, usually Medellín"),
    prop("chief_complaint", "string", "The main problem in a few words"),
    prop("patient_email", "string", "Email for the visit confirmation, or unknown"),
    prop("is_alone", "boolean", "True if the caller is alone where they are staying"),
  ]),
  tool(
    "check_medication",
    "check-medication",
    "Identify the active ingredients of one medication and detect duplicates. Call once per medication.",
    [prop("medication_name", "string", "The medication name exactly as the caller said it", true)],
  ),
  tool(
    "assess_triage",
    "assess-triage",
    "Submit your triage. Safety rules may raise the level. Always use final_level from the result.",
    [
      prop("level", "string", "Your proposed triage level", true, { enum: ["EMERGENCY", "URGENT", "STANDARD", "SELF_CARE"] }),
      prop("chief_complaint", "string", "The main problem in a few words"),
      prop("symptoms_summary", "string", "Short summary of all symptoms reported"),
      prop("red_flags", "string", "Red flags reported, comma-separated, or none"),
      prop("temperature_c", "number", "Temperature in °C, if known"),
      prop("pain_score", "number", "Pain from 0 to 10, if known"),
      prop("hours_since_onset", "number", "Hours since symptoms started, if known"),
      prop("hours_unable_to_keep_fluids", "number", "Hours unable to keep fluids down, if any"),
      prop("age", "number", "Caller's age, if known"),
      prop("pregnant", "boolean", "True if the caller is pregnant"),
    ],
  ),
  tool(
    "dispatch_doctor",
    "dispatch-doctor",
    "Dispatch the nearest on-call doctor. Sends the doctor's Spanish briefing and the patient's email.",
    [
      prop("symptoms_summary_en", "string", "One-paragraph English summary of the case for the record", true),
      prop("briefing_es", "string", "1 to 3 sentences in clinical Spanish for the doctor", true),
      prop("patient_email", "string", "Email for the visit confirmation, if the caller gave one"),
    ],
    { timeout: 30 },
  ),
];

const dir = new URL("./tools/", import.meta.url);
mkdirSync(dir, { recursive: true });
tools.forEach((t, i) => writeFileSync(new URL(`${i + 1}-${t.name}.json`, dir), JSON.stringify(t, null, 2) + "\n"));
console.log(`Wrote ${tools.length} tools for ${base} to elevenlabs/tools/`);
