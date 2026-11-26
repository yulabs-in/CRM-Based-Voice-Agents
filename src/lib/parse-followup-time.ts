// Pure IST follow-up time parser for AI call answers. No I/O or external libraries.

export type ParsedFollowUpTime = {
  start: Date;
  confidence: "exact" | "approximate";
};

const IST_OFFSET_MS = 330 * 60 * 1000;

/** Converts an IST wall-clock date/time (year, 1-based month, day, hour, minute) to a UTC Date. */
export function fromIst(year: number, month: number, day: number, hour: number, minute = 0): Date {
  return new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0) - IST_OFFSET_MS);
}

/** Extracts IST wall-clock parts from a UTC Date. */
export function toIstParts(date: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
} {
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  return {
    year: ist.getUTCFullYear(),
    month: ist.getUTCMonth() + 1,
    day: ist.getUTCDate(),
    hour: ist.getUTCHours(),
    minute: ist.getUTCMinutes(),
    weekday: ist.getUTCDay(),
  };
}

/** Returns true if the IST time is on a Sunday or outside 09:00–20:00 IST. */
export function isOutsideBusinessHoursIst(date: Date): boolean {
  const { weekday, hour, minute } = toIstParts(date);
  if (weekday === 0) return true;
  if (hour < 9) return true;
  if (hour > 20 || (hour === 20 && minute > 0)) return true;
  return false;
}

function addIstDays(year: number, month: number, day: number, delta: number) {
  const shifted = new Date(Date.UTC(year, month - 1, day + delta, 0, 0, 0, 0));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
  };
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const check = new Date(Date.UTC(year, month - 1, day));
  return (
    check.getUTCFullYear() === year &&
    check.getUTCMonth() + 1 === month &&
    check.getUTCDate() === day
  );
}

const WEEKDAYS: Record<string, number> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
};

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

type DayPart = "morning" | "afternoon" | "evening" | "night" | "noon";

function extractDayPart(text: string): DayPart | null {
  if (/\b(morning|subah|savere)\b/.test(text)) return "morning";
  if (/\b(afternoon|dopahar)\b/.test(text)) return "afternoon";
  if (/\b(evening|shaam|sham)\b/.test(text)) return "evening";
  if (/\b(night|tonight|raat)\b/.test(text)) return "night";
  if (/\bnoon\b/.test(text)) return "noon";
  return null;
}

function defaultHourForPart(part: DayPart): number {
  switch (part) {
    case "morning":
      return 10;
    case "noon":
      return 12;
    case "afternoon":
      return 14;
    case "evening":
      return 18;
    case "night":
      return 20;
  }
}

function resolveHour(rawHour: number, meridiem: "am" | "pm" | null, part: DayPart | null): number | null {
  if (rawHour < 0 || rawHour > 23) return null;
  if (meridiem) {
    if (rawHour < 1 || rawHour > 12) return null;
    if (meridiem === "am") return rawHour === 12 ? 0 : rawHour;
    return rawHour === 12 ? 12 : rawHour + 12;
  }
  if (part) {
    if (rawHour >= 13) return rawHour;
    if (part === "morning") return rawHour === 12 ? 0 : rawHour;
    if (part === "noon") return rawHour === 12 ? 12 : rawHour <= 7 ? rawHour + 12 : rawHour;
    // afternoon / evening / night -> PM for 1..11
    return rawHour === 12 ? 12 : rawHour + 12;
  }
  // 24h clock e.g. 15:00
  if (rawHour >= 13) return rawHour;
  if (rawHour === 0) return 0;
  // Bare business hour without am/pm: 1-7 -> PM, 8-11 -> AM, 12 -> noon
  if (rawHour >= 1 && rawHour <= 7) return rawHour + 12;
  return rawHour;
}

function extractTime(
  text: string,
  dayPart: DayPart | null
): { hour: number; minute: number; confidence: "exact" | "approximate"; consumed: string } | null {
  // 1. "half past 3" / "half past 11"
  const halfPast = text.match(/\bhalf\s+past\s+(\d{1,2})\s*(am|pm)?\b/);
  if (halfPast) {
    const h = resolveHour(
      Number(halfPast[1]),
      (halfPast[2] as "am" | "pm" | undefined) ?? null,
      dayPart
    );
    if (h === null) return null;
    return { hour: h, minute: 30, confidence: "exact", consumed: halfPast[0] };
  }

  // 2. HH:MM (with optional am/pm) e.g. "11:30 am", "15:00", "3:15pm"
  const hhmm = text.match(/\b(\d{1,2}):(\d{2})\s*(am|pm)?\b/);
  if (hhmm) {
    const min = Number(hhmm[2]);
    if (min > 59) return null;
    const h = resolveHour(Number(hhmm[1]), (hhmm[3] as "am" | "pm" | undefined) ?? null, dayPart);
    if (h === null) return null;
    return { hour: h, minute: min, confidence: "exact", consumed: hhmm[0] };
  }

  // 3. Explicit meridiem / o'clock / baje e.g. "11 AM", "3 pm", "3 o'clock", "6 baje"
  const explicit = text.match(/\b(\d{1,2})\s*(am|pm|o'?clock|baje)\b/);
  if (explicit) {
    const unit = explicit[2];
    const meridiem = unit === "am" || unit === "pm" ? unit : null;
    const h = resolveHour(Number(explicit[1]), meridiem, dayPart);
    if (h === null) return null;
    return { hour: h, minute: 0, confidence: "exact", consumed: explicit[0] };
  }

  // 4. "at 11" / "at 3" / "@ 4" (bare hour after preposition)
  const atHour = text.match(/(?:\bat\b|@)\s*(\d{1,2})\b/);
  if (atHour) {
    const h = resolveHour(Number(atHour[1]), null, dayPart);
    if (h === null) return null;
    return { hour: h, minute: 0, confidence: "exact", consumed: atHour[0] };
  }

  // 5. Bare number remaining after date tokens are stripped, or standalone "11"
  const bare = text.match(/\b(\d{1,2})\b/);
  if (bare) {
    const h = resolveHour(Number(bare[1]), null, dayPart);
    if (h === null) return null;
    return { hour: h, minute: 0, confidence: "exact", consumed: bare[0] };
  }

  // 6. Part of day only -> approximate default hour
  if (dayPart) {
    return { hour: defaultHourForPart(dayPart), minute: 0, confidence: "approximate", consumed: "" };
  }

  return null;
}

/**
 * Parses natural-language follow-up times (including Hinglish and IST business-hour defaults)
 * relative to `reference`. Returns `null` when unsure rather than guessing wildly.
 */
export function parseFollowUpTime(
  text: string,
  reference: Date,
  _tz = "Asia/Kolkata"
): ParsedFollowUpTime | null {
  void _tz;
  if (!text || typeof text !== "string") return null;

  const ref = toIstParts(reference);
  let work = text
    .toLowerCase()
    .replace(/\bist\b/g, " ")
    .replace(/[.,]+$/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!work) return null;

  // 0. Machine-formatted date and time, as Sarvam's post-call extraction writes it: "2026-11-29 18:00",
  //    "2026-11-29T18:00" or "2026-11-29 6:00 pm". Read as IST wall-clock time.
  const iso = work.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ t](\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?$/);
  if (iso) {
    const [, y, mo, d, h, mi, ampm] = iso;
    let hour = Number(h);
    if (ampm === "pm" && hour < 12) hour += 12;
    if (ampm === "am" && hour === 12) hour = 0;
    const month = Number(mo);
    const day = Number(d);
    const minute = Number(mi);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && hour <= 23 && minute <= 59) {
      return { start: fromIst(Number(y), month, day, hour, minute), confidence: "exact" };
    }
    return null;
  }

  const dayPart = extractDayPart(work);
  let targetDate: { year: number; month: number; day: number } | null = null;
  let explicitDate = false;

  // 1. Relative multi-word / Hinglish day phrases (check longest first)
  if (/\b(day\s+after\s+tomorrow|parso)\b/.test(work)) {
    targetDate = addIstDays(ref.year, ref.month, ref.day, 2);
    explicitDate = true;
    work = work.replace(/\b(day\s+after\s+tomorrow|parso)\b/, " ");
  } else if (/\b(tomorrow|tmrw|tom|kal)\b/.test(work)) {
    targetDate = addIstDays(ref.year, ref.month, ref.day, 1);
    explicitDate = true;
    work = work.replace(/\b(tomorrow|tmrw|tom|kal)\b/, " ");
  } else if (/\b(today|tonight|aaj)\b/.test(work)) {
    targetDate = { year: ref.year, month: ref.month, day: ref.day };
    explicitDate = true;
    work = work.replace(/\b(today|tonight|aaj)\b/, " ");
  } else {
    const inDays = work.match(/\b(?:in|after)\s+(\d{1,2})\s+days?\b/);
    if (inDays) {
      const n = Number(inDays[1]);
      if (n >= 1 && n <= 60) {
        targetDate = addIstDays(ref.year, ref.month, ref.day, n);
        explicitDate = true;
        work = work.replace(inDays[0], " ");
      }
    } else if (/\bnext\s+week\b/.test(work)) {
      targetDate = addIstDays(ref.year, ref.month, ref.day, 7);
      explicitDate = true;
      work = work.replace(/\bnext\s+week\b/, " ");
    }
  }

  // 2. Explicit calendar dates: "25 Dec", "Dec 25", "25/12", "25-12", "25th"
  if (!targetDate) {
    const monthNames = Object.keys(MONTHS).join("|");
    const dayMonthRe = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthNames})\\b`);
    const monthDayRe = new RegExp(`\\b(${monthNames})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`);
    const dmMatch = work.match(dayMonthRe);
    const mdMatch = work.match(monthDayRe);
    const slashMatch = work.match(/\b(\d{1,2})[/-](\d{1,2})\b/);
    const ordinalMatch = work.match(/\b(\d{1,2})(?:st|nd|rd|th)\b/);

    if (dmMatch || mdMatch) {
      const day = Number(dmMatch ? dmMatch[1] : mdMatch![2]);
      const month = MONTHS[dmMatch ? dmMatch[2] : mdMatch![1]];
      if (!isValidCalendarDate(ref.year, month, day)) return null;
      let year = ref.year;
      if (month < ref.month || (month === ref.month && day < ref.day)) {
        year += 1;
      }
      targetDate = { year, month, day };
      explicitDate = true;
      work = work.replace((dmMatch ?? mdMatch)![0], " ");
    } else if (slashMatch) {
      const day = Number(slashMatch[1]);
      const month = Number(slashMatch[2]);
      if (!isValidCalendarDate(ref.year, month, day)) return null;
      let year = ref.year;
      if (month < ref.month || (month === ref.month && day < ref.day)) {
        year += 1;
      }
      targetDate = { year, month, day };
      explicitDate = true;
      work = work.replace(slashMatch[0], " ");
    } else if (ordinalMatch) {
      const day = Number(ordinalMatch[1]);
      if (day < 1 || day > 31) return null;
      let year = ref.year;
      let month = ref.month;
      if (day < ref.day || !isValidCalendarDate(year, month, day)) {
        month += 1;
        if (month > 12) {
          month = 1;
          year += 1;
        }
        if (!isValidCalendarDate(year, month, day)) return null;
      }
      targetDate = { year, month, day };
      explicitDate = true;
      work = work.replace(ordinalMatch[0], " ");
    }
  }

  // 3. Weekday: "Monday", "next Monday", "this Friday"
  if (!targetDate) {
    const weekdayNames = Object.keys(WEEKDAYS).join("|");
    const wdRe = new RegExp(`\\b(?:(next|this)\\s+)?(${weekdayNames})\\b`);
    const wdMatch = work.match(wdRe);
    if (wdMatch) {
      const qualifier = wdMatch[1];
      const targetWd = WEEKDAYS[wdMatch[2]];
      let delta = (targetWd - ref.weekday + 7) % 7;
      if (delta === 0 && qualifier === "next") {
        delta = 7;
      } else if (delta === 0 && !qualifier) {
        // Same weekday without qualifier: check below if parsed time is already in the past -> +7
      }
      targetDate = addIstDays(ref.year, ref.month, ref.day, delta);
      explicitDate = true;
      work = work.replace(wdMatch[0], " ");
    }
  }

  // Extract time from remaining text
  const parsedTime = extractTime(work, dayPart);
  if (!parsedTime) {
    // Only a bare date like "tomorrow" without any time or part-of-day -> ambiguous, return null
    return null;
  }

  if (!targetDate) {
    targetDate = { year: ref.year, month: ref.month, day: ref.day };
  }

  let candidate = fromIst(
    targetDate.year,
    targetDate.month,
    targetDate.day,
    parsedTime.hour,
    parsedTime.minute
  );

  // If result is in the past:
  if (candidate.getTime() <= reference.getTime()) {
    if (!explicitDate) {
      // Bare time e.g. "11 AM" spoken at 14:00 -> move to tomorrow
      const next = addIstDays(targetDate.year, targetDate.month, targetDate.day, 1);
      candidate = fromIst(next.year, next.month, next.day, parsedTime.hour, parsedTime.minute);
    } else if (targetDate.year === ref.year && targetDate.month === ref.month && targetDate.day === ref.day) {
      // e.g. same-weekday or "today" with past time -> if weekday was given, move +7 days, else +1 day
      const hadWeekday = new RegExp(`\\b(${Object.keys(WEEKDAYS).join("|")})\\b`).test(text.toLowerCase());
      const next = addIstDays(targetDate.year, targetDate.month, targetDate.day, hadWeekday ? 7 : 1);
      candidate = fromIst(next.year, next.month, next.day, parsedTime.hour, parsedTime.minute);
    }
  }

  return { start: candidate, confidence: parsedTime.confidence };
}
