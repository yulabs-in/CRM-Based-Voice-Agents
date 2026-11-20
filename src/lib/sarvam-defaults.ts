// Default Sarvam Voice Agents setup used when a workspace hasn't entered its own.
// These are identifiers, not secrets — the API key stays in SARVAM_API_KEY on the server.
// Keep in sync with db/migrations/0006_default_sarvam_setup.sql and 0008_default_agent_version_7.sql.
export const SARVAM_DEFAULTS = {
  organizationId: "019e90bb-4638-7c0c-8779-3b46919584f2",
  workspaceId: "019e90bb-466e-7199-9d47-d08cbf9eb144",
  agentId: "Conversatio-db355446-5fb3",
  agentVersion: 7,
  connectionId: "614a33c8-31-e56314c0-c598",
  callerNumber: "+918064269483",
} as const;

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
