export type SarvamAttemptStatus = "connected" | "no_answer" | "busy" | "failed";
export const SARVAM_TEST_PHONE = "+918019628820";

export function normalizePhoneNumber(input: string): string | null {
  const compact = input.trim().replace(/[\s()-]/g, "");
  if (/^\+[1-9]\d{7,14}$/.test(compact)) return compact;
  const digits = compact.replace(/\D/g, "");
  if (/^[6-9]\d{9}$/.test(digits)) return `+91${digits}`;
  return null;
}

export function isApprovedSupportTestPhone(input: string): boolean {
  return normalizePhoneNumber(input) === SARVAM_TEST_PHONE;
}

export function mapSarvamStatus(status: SarvamAttemptStatus): "completed" | "no_answer" | "failed" {
  if (status === "connected") return "completed";
  if (status === "no_answer") return "no_answer";
  return "failed";
}

export function isValidCallbackToken(providedHash: string, storedHash: string | null): boolean {
  return storedHash !== null && providedHash.length === storedHash.length && providedHash === storedHash;
}

export function formatSarvamTranscript(turns: Array<{ role: string; en_text: string }>): string {
  return turns
    .map((turn) => `${turn.role === "agent" ? "Agent" : "Customer"}: ${turn.en_text.trim()}`)
    .filter((turn) => !turn.endsWith(": "))
    .join("\n");
}