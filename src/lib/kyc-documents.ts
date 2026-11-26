// Pure helpers for KYC document uploads and workspace owner verification. No I/O here.
import { maskPan } from "@/lib/call-capture";

export const KYC_BUCKET = "kyc-documents";
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
export const ALLOWED_DOCUMENT_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
export const DOCUMENT_ACCEPT = ".jpg,.jpeg,.png,.webp,.pdf";

export const KYC_DOC_TYPES = [
  { value: "aadhaar", label: "Aadhaar (masked)" },
  { value: "pan", label: "PAN card" },
  { value: "passport", label: "Passport" },
  { value: "driving_licence", label: "Driving licence" },
  { value: "voter_id", label: "Voter ID" },
  { value: "photo", label: "Photograph" },
  { value: "address_proof", label: "Address proof" },
  { value: "other", label: "Other" },
] as const;
export type KycDocType = (typeof KYC_DOC_TYPES)[number]["value"];

export const docTypeLabel = (value: string) => KYC_DOC_TYPES.find((t) => t.value === value)?.label ?? value;

/** Returns why a file can't be uploaded, or null when it's fine. */
export function validateDocumentFile(file: { type: string; size: number; name: string }): string | null {
  if (!(ALLOWED_DOCUMENT_TYPES as readonly string[]).includes(file.type)) return "Upload a JPG, PNG, WebP or PDF file.";
  if (file.size <= 0) return "That file is empty.";
  if (file.size > MAX_DOCUMENT_BYTES) return "Files must be 5 MB or smaller.";
  return null;
}

/** A storage-safe file name: letters, digits, dot, dash and underscore only, keeping the extension. */
export function safeFileName(name: string): string {
  const trimmed = (name.split(/[\\/]/).pop() ?? "").trim().toLowerCase();
  const dot = trimmed.lastIndexOf(".");
  const base = (dot > 0 ? trimmed.slice(0, dot) : trimmed).replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "document";
  const ext = dot > 0 ? trimmed.slice(dot + 1).replace(/[^a-z0-9]/g, "").slice(0, 5) : "";
  return ext ? `${base}.${ext}` : base;
}

/** {org}/clients/{contact}/{id}-{file}: the folder the storage and table policies expect. */
export const clientDocumentPath = (orgId: string, contactId: string, id: string, fileName: string) =>
  `${orgId}/clients/${contactId}/${id}-${safeFileName(fileName)}`;

/** {org}/owner/{id}-{file}: owner verification documents. */
export const ownerDocumentPath = (orgId: string, id: string, fileName: string) => `${orgId}/owner/${id}-${safeFileName(fileName)}`;

// ---------------------------------------------------------------- PAN

export const normalizePan = (value: string) => value.replace(/\s+/g, "").toUpperCase();

/** PAN format: 5 letters, 4 digits, 1 letter (e.g. ABCDE1234F). */
export const isValidPan = (value: string) => /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(normalizePan(value));

/** Stores only the masked PAN (ABCxxxxx4F). */
export const maskedPan = (value: string) => (isValidPan(value) ? maskPan(normalizePan(value)) : null);

// ---------------------------------------------------------------- Aadhaar (Verhoeff checksum)

const D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6], [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1], [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4], [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2], [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1], [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

export const normalizeAadhaar = (value: string) => value.replace(/[\s-]+/g, "");

/** 12 digits, not starting with 0 or 1, with a valid Verhoeff check digit (UIDAI's format). */
export function isValidAadhaar(value: string): boolean {
  const digits = normalizeAadhaar(value);
  if (!/^[2-9][0-9]{11}$/.test(digits)) return false;
  let c = 0;
  digits.split("").reverse().forEach((ch, i) => { c = D[c]![P[i % 8]![Number(ch)]!]!; });
  return c === 0;
}

/** Only the last 4 digits are ever stored. */
export const aadhaarLast4 = (value: string) => (isValidAadhaar(value) ? normalizeAadhaar(value).slice(-4) : null);

export const VERIFICATION_STATUS_LABELS: Record<string, string> = {
  not_submitted: "Not submitted",
  pending: "Pending review",
  verified: "Verified",
  rejected: "Needs changes",
};
