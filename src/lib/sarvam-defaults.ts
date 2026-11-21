// Default Sarvam Voice Agents setup used when a workspace hasn't entered its own.
// These are identifiers, not secrets — the API key stays in SARVAM_API_KEY on the server.
// Keep in sync with db/migrations/0006_default_sarvam_setup.sql and 0013_yulabs_insurance_agent.sql.
export const SARVAM_DEFAULTS = {
  organizationId: "019e90bb-4638-7c0c-8779-3b46919584f2",
  workspaceId: "019e90bb-466e-7199-9d47-d08cbf9eb144",
  agentId: "YULabs-Insu-13e07aa4-48c0", // "YULabs Insurance — India"
  agentVersion: 1,
  connectionId: "614a33c8-31-e56314c0-c598",
  callerNumber: "+918064269483",
} as const;

// Input variables of the YULabs Insurance script on YULabs-Insu-13e07aa4-48c0. Names must match the Sarvam
// agent exactly (it rejects unknown ones). Empty values are fine — the agent skips missing details.
// Lead-file columns are matched by their snake_case header, e.g. "Renewal Date" → custom.renewal_date.
export const DEFAULT_AGENT_VARIABLES = {
  customer_name: "full_name",
  user_name: "full_name", // legacy alias; the new agent defaults it to empty, but keep sending it
  city: "city",
  call_track: "custom.call_track", // A = new enquiry, B = renewal due
  interest: "custom.interest",
  current_insurer: "custom.current_insurer",
  renewal_date: "custom.renewal_date",
  vehicle_model: "custom.vehicle_model",
  family_size: "custom.family_size",
} as const;

export const DEFAULT_GREETING = "Hello, am I speaking with {customer_name}?";

export const DEFAULT_AGENT = {
  name: "Sarvam Conversation Agent",
  purpose: "support",
  language: "en-IN",
  status: "active",
  sarvam_agent_id: SARVAM_DEFAULTS.agentId,
  sarvam_app_version: SARVAM_DEFAULTS.agentVersion,
  sarvam_connection_id: SARVAM_DEFAULTS.connectionId,
  sarvam_agent_phone_number: SARVAM_DEFAULTS.callerNumber,
} as const;
