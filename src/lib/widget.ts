export interface CallingHours {
  start: string;
  end: string;
  tz: string;
}

export interface WidgetAppearance {
  colour: string;
  title: string;
  button: string;
}

export interface WidgetSettingsData {
  id?: string;
  organization_id: string;
  widget_key: string;
  allowed_domains: string[];
  project_id: string | null;
  agent_id: string | null;
  instant_callback: boolean;
  calling_hours: CallingHours;
  appearance: WidgetAppearance;
  privacy_url: string | null;
}

export const DEFAULT_CALLING_HOURS: CallingHours = {
  start: "09:00",
  end: "20:00",
  tz: "Asia/Kolkata",
};

export const DEFAULT_APPEARANCE: WidgetAppearance = {
  colour: "#6d28d9",
  title: "Get a call back",
  button: "Call me",
};

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** Generates a public widget identifier prefixed with `wk_`. */
export function generateWidgetKey(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let out = "wk_";
  for (const b of bytes) {
    out += BASE62[b % BASE62.length];
  }
  return out;
}

function normalizeAllowedEntry(entry: string): string {
  return entry
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
}

/**
 * Checks whether a request `Origin` header matches one of the configured allowed domains.
 * Supports `localhost:*` for local testing, exact `host:port`, and exact `hostname` matches.
 */
export function isOriginAllowed(origin: string | null | undefined, allowedDomains: string[]): boolean {
  if (!origin || !allowedDomains.length) return false;
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;

  const reqHostname = parsed.hostname.toLowerCase();
  const reqHost = parsed.host.toLowerCase();

  for (const raw of allowedDomains) {
    const entry = normalizeAllowedEntry(raw);
    if (!entry) continue;
    if (entry === "localhost:*" && (reqHostname === "localhost" || reqHostname === "127.0.0.1")) {
      return true;
    }
    if (entry.includes(":")) {
      if (reqHost === entry) return true;
    } else if (reqHostname === entry) {
      return true;
    }
  }
  return false;
}

/** Masks a phone number for server logs so full numbers are never logged. */
export function maskPhone(phone: string): string {
  const trimmed = phone.trim();
  if (trimmed.length <= 4) return "****";
  return `${trimmed.slice(0, 3)}****${trimmed.slice(-2)}`;
}

/** Returns HH:mm in the target timezone (default Asia/Kolkata). */
function timeInTz(now: Date, tz: string): { hhmm: string; ymd: string } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz || "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const hour = get("hour").replace("24", "00");
  return {
    hhmm: `${hour}:${get("minute")}`,
    ymd: `${get("year")}-${get("month")}-${get("day")}`,
  };
}

/** True when `now` falls within [callingHours.start, callingHours.end) in callingHours.tz. */
export function isWithinCallingHours(callingHours: CallingHours, now = new Date()): boolean {
  const tz = callingHours.tz || "Asia/Kolkata";
  const { hhmm } = timeInTz(now, tz);
  return hhmm >= callingHours.start && hhmm < callingHours.end;
}

/** Computes the next calling-window start UTC Date (for scheduling outside-hours callback tasks). */
export function nextCallingWindowStart(callingHours: CallingHours, now = new Date()): Date {
  const tz = callingHours.tz || "Asia/Kolkata";
  const { hhmm, ymd } = timeInTz(now, tz);
  const offset = tz === "Asia/Kolkata" ? "+05:30" : "Z";
  const todayStart = new Date(`${ymd}T${callingHours.start}:00${offset}`);
  if (hhmm < callingHours.start) {
    return todayStart;
  }
  return new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
}
