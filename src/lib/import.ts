// CSV / Excel → CRM contacts. Parsing runs in the browser; mapping logic is pure so it can be unit-tested.
import { normalizePhoneNumber } from "@/lib/sarvam-call";

export type ContactTarget = "first_name" | "last_name" | "full_name" | "phone" | "email" | "job_title" | "city" | "tags" | "source" | "custom" | "skip";

export const TARGET_LABELS: Record<ContactTarget, string> = {
  first_name: "First name", last_name: "Last name", full_name: "Full name (split)", phone: "Phone", email: "Email",
  job_title: "Job title", city: "City", tags: "Tags (comma separated)", source: "Source", custom: "Keep as custom field", skip: "Don't import",
};

export type ParsedSheet = { headers: string[]; rows: string[][]; fileType: "csv" | "xlsx" };
export type Mapping = Record<string, ContactTarget>;
export type ContactDraft = {
  first_name: string; last_name: string | null; phone: string | null; email: string | null; job_title: string | null;
  city: string | null; tags: string[]; source: string; custom_fields: Record<string, string>;
};
export type RowIssue = { row: number; reason: string };

export const MAX_IMPORT_ROWS = 50000;

const GUESSES: Array<[ContactTarget, RegExp]> = [
  ["full_name", /^(full ?name|name|customer ?name|contact ?name|lead ?name|client ?name)$/],
  ["first_name", /^(first ?name|fname|given ?name)$/],
  ["last_name", /^(last ?name|lname|surname|family ?name)$/],
  ["phone", /(phone|mobile|contact ?no|contact ?number|whatsapp|cell|tel)/],
  ["email", /(e-?mail)/],
  ["job_title", /^(job ?title|title|designation|role|position)$/],
  ["city", /^(city|town|location)$/],
  ["tags", /^(tags?|labels?)$/],
  ["source", /^(source|lead ?source|channel)$/],
];

export function guessTarget(header: string, taken: Set<ContactTarget>): ContactTarget {
  const key = header.trim().toLowerCase().replace(/[_.]+/g, " ").replace(/\s+/g, " ");
  if (!key) return "skip";
  for (const [target, pattern] of GUESSES) {
    if (pattern.test(key) && !taken.has(target)) return target;
  }
  return "custom";
}

export function guessMapping(headers: string[]): Mapping {
  const taken = new Set<ContactTarget>();
  const mapping: Mapping = {};
  for (const header of headers) {
    const target = guessTarget(header, taken);
    if (target !== "custom" && target !== "skip" && target !== "tags") taken.add(target);
    mapping[header] = target;
  }
  return mapping;
}

/** Stable JSON key for a custom column ("Loan Amount (₹)" → "loan_amount"). */
export function customKey(header: string): string {
  return header.trim().toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "field";
}

const clean = (value: string | undefined) => {
  const text = (value ?? "").trim();
  return text.length ? text : null;
};

/** Turns sheet rows into contact drafts. Rows with neither a usable phone nor an email are reported, not imported; duplicate phones keep the first row. */
export function buildContacts(sheet: ParsedSheet, mapping: Mapping, source = "Import"): { contacts: ContactDraft[]; issues: RowIssue[] } {
  const contacts: ContactDraft[] = [];
  const issues: RowIssue[] = [];
  const seenPhones = new Set<string>();
  const index = new Map(sheet.headers.map((header, position) => [header, position]));
  const columns = (target: ContactTarget) => sheet.headers.filter((header) => mapping[header] === target);

  sheet.rows.forEach((row, rowIndex) => {
    const rowNumber = rowIndex + 2; // header is row 1
    const cell = (header: string) => clean(row[index.get(header) ?? -1]);
    const first = (target: ContactTarget) => columns(target).map(cell).find(Boolean) ?? null;
    if (row.every((value) => !String(value ?? "").trim())) return;

    const custom: Record<string, string> = {};
    for (const header of columns("custom")) {
      const value = cell(header);
      if (value) custom[customKey(header)] = value;
    }

    const rawPhone = first("phone");
    const phone = rawPhone ? normalizePhoneNumber(rawPhone) : null;
    if (rawPhone && !phone) custom.raw_phone = rawPhone;
    const emailText = first("email");
    const email = emailText && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailText) ? emailText.toLowerCase() : null;
    if (emailText && !email) custom.raw_email = emailText;

    if (!phone && !email) {
      issues.push({ row: rowNumber, reason: rawPhone ? `Invalid phone "${rawPhone}"` : "No phone or email" });
      return;
    }
    if (phone && seenPhones.has(phone)) {
      issues.push({ row: rowNumber, reason: `Duplicate phone ${phone}` });
      return;
    }
    if (phone) seenPhones.add(phone);

    let firstName = first("first_name");
    let lastName = first("last_name");
    const fullName = first("full_name");
    if (fullName && !firstName) {
      const parts = fullName.split(/\s+/);
      firstName = parts[0] ?? null;
      lastName = lastName ?? (parts.slice(1).join(" ") || null);
    }

    const tags = columns("tags").flatMap((header) => (cell(header) ?? "").split(/[,;|]/)).map((tag) => tag.trim()).filter(Boolean);
    contacts.push({
      first_name: (firstName ?? phone ?? email ?? "Unknown").slice(0, 120),
      last_name: lastName,
      phone,
      email,
      job_title: first("job_title"),
      city: first("city"),
      tags: [...new Set(tags)].slice(0, 20),
      source: first("source") ?? source,
      custom_fields: custom,
    });
  });
  return { contacts, issues };
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number" && Number.isFinite(value) && Math.abs(value) >= 1e9 && Number.isInteger(value)) return value.toFixed(0); // phone numbers stored as numbers
  return String(value);
}

function uniqueHeaders(raw: unknown[]): string[] {
  const seen = new Map<string, number>();
  return raw.map((value, position) => {
    const base = cellText(value).trim() || `Column ${position + 1}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count ? `${base} (${count + 1})` : base;
  });
}

export function fileTypeOf(file: File): "csv" | "xlsx" | null {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || name.endsWith(".tsv") || name.endsWith(".txt")) return "csv";
  if (name.endsWith(".xlsx")) return "xlsx";
  return null;
}

export async function parseFile(file: File): Promise<ParsedSheet> {
  const fileType = fileTypeOf(file);
  if (!fileType) throw new Error("Upload a .csv or .xlsx file (old .xls files: save as .xlsx first)");
  let matrix: unknown[][];
  if (fileType === "csv") {
    const Papa = (await import("papaparse")).default;
    const text = await file.text();
    const result = Papa.parse<string[]>(text.replace(/^\uFEFF/, ""), { skipEmptyLines: "greedy" });
    if (result.errors.length && !result.data.length) throw new Error(result.errors[0]!.message);
    matrix = result.data;
  } else {
    const { readSheet } = await import("read-excel-file/browser");
    matrix = await readSheet(file);
  }
  const [headerRow, ...body] = matrix;
  if (!headerRow?.length) throw new Error("The file is empty");
  if (body.length > MAX_IMPORT_ROWS) throw new Error(`Files are limited to ${MAX_IMPORT_ROWS.toLocaleString()} rows; split the file and import it in parts`);
  const headers = uniqueHeaders(headerRow);
  const rows = body.map((row) => headers.map((_, position) => cellText(row[position])));
  return { headers, rows, fileType };
}
