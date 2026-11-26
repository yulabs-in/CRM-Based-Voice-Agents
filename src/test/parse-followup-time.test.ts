import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fromIst,
  isOutsideBusinessHoursIst,
  parseFollowUpTime,
  toIstParts,
} from "@/lib/parse-followup-time";

describe("parseFollowUpTime (IST)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 2026-11-23T08:30:00Z === Monday 23 Nov 2026, 14:00 IST
    vi.setSystemTime(new Date("2026-11-23T08:30:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const istIso = (text: string, ref = new Date()) => parseFollowUpTime(text, ref)?.start.toISOString() ?? null;

  describe("IST helpers", () => {
    it("converts IST wall-clock time to UTC accurately", () => {
      expect(fromIst(2026, 11, 24, 11, 0).toISOString()).toBe("2026-11-24T05:30:00.000Z");
      expect(fromIst(2026, 11, 24, 0, 0).toISOString()).toBe("2026-11-23T18:30:00.000Z");
    });

    it("extracts IST wall-clock parts from UTC", () => {
      expect(toIstParts(new Date("2026-11-23T08:30:00Z"))).toMatchObject({
        year: 2026,
        month: 11,
        day: 23,
        hour: 14,
        minute: 0,
        weekday: 1,
      });
    });

    it("flags Sundays and outside 09:00-20:00 IST", () => {
      expect(isOutsideBusinessHoursIst(fromIst(2026, 11, 29, 11, 0))).toBe(true); // Sunday
      expect(isOutsideBusinessHoursIst(fromIst(2026, 11, 24, 8, 30))).toBe(true); // 08:30
      expect(isOutsideBusinessHoursIst(fromIst(2026, 11, 24, 20, 30))).toBe(true); // 20:30
      expect(isOutsideBusinessHoursIst(fromIst(2026, 11, 24, 10, 0))).toBe(false); // Tuesday 10:00
      expect(isOutsideBusinessHoursIst(fromIst(2026, 11, 24, 20, 0))).toBe(false); // Tuesday 20:00
    });
  });

  describe("Relative days", () => {
    it("parses 'tomorrow 11 AM'", () => {
      const res = parseFollowUpTime("tomorrow 11 AM", new Date());
      expect(res?.start.toISOString()).toBe("2026-11-24T05:30:00.000Z");
      expect(res?.confidence).toBe("exact");
    });

    it("parses 'tmrw 3:30 pm'", () => {
      expect(istIso("tmrw 3:30 pm")).toBe("2026-11-24T10:00:00.000Z");
    });

    it("parses 'day after tomorrow morning' as approximate 10:00 IST", () => {
      const res = parseFollowUpTime("day after tomorrow morning", new Date());
      expect(res?.start.toISOString()).toBe("2026-11-25T04:30:00.000Z");
      expect(res?.confidence).toBe("approximate");
    });

    it("parses 'today 5 pm'", () => {
      expect(istIso("today 5 pm")).toBe("2026-11-23T11:30:00.000Z");
    });

    it("parses 'tonight' as approximate 20:00 IST", () => {
      const res = parseFollowUpTime("tonight", new Date());
      expect(res?.start.toISOString()).toBe("2026-11-23T14:30:00.000Z");
      expect(res?.confidence).toBe("approximate");
    });

    it("parses 'in 2 days at 4 pm'", () => {
      expect(istIso("in 2 days at 4 pm")).toBe("2026-11-25T10:30:00.000Z");
    });

    it("parses 'in 3 days afternoon'", () => {
      expect(istIso("in 3 days afternoon")).toBe("2026-11-26T08:30:00.000Z");
    });

    it("parses 'next week 11 am'", () => {
      expect(istIso("next week 11 am")).toBe("2026-11-30T05:30:00.000Z");
    });
  });

  describe("Hinglish phrases", () => {
    it("parses 'kal subah' as tomorrow 10:00 IST", () => {
      const res = parseFollowUpTime("kal subah", new Date());
      expect(res?.start.toISOString()).toBe("2026-11-24T04:30:00.000Z");
      expect(res?.confidence).toBe("approximate");
    });

    it("parses 'kal subah 9 baje' as tomorrow 09:00 IST", () => {
      const res = parseFollowUpTime("kal subah 9 baje", new Date());
      expect(res?.start.toISOString()).toBe("2026-11-24T03:30:00.000Z");
      expect(res?.confidence).toBe("exact");
    });

    it("parses 'parso shaam 6 baje' as day after tomorrow 18:00 IST", () => {
      const res = parseFollowUpTime("parso shaam 6 baje", new Date());
      expect(res?.start.toISOString()).toBe("2026-11-25T12:30:00.000Z");
      expect(res?.confidence).toBe("exact");
    });

    it("parses 'aaj shaam' as today 18:00 IST", () => {
      expect(istIso("aaj shaam")).toBe("2026-11-23T12:30:00.000Z");
    });

    it("parses 'kal dopahar' as tomorrow 14:00 IST", () => {
      expect(istIso("kal dopahar")).toBe("2026-11-24T08:30:00.000Z");
    });

    it("parses 'kal raat 8 baje' as tomorrow 20:00 IST", () => {
      expect(istIso("kal raat 8 baje")).toBe("2026-11-24T14:30:00.000Z");
    });
  });

  describe("Weekdays", () => {
    it("parses 'this Friday 3 pm'", () => {
      // Monday 23 Nov -> Friday 27 Nov
      expect(istIso("this Friday 3 pm")).toBe("2026-11-27T09:30:00.000Z");
    });

    it("parses 'Wednesday morning'", () => {
      expect(istIso("Wednesday morning")).toBe("2026-11-25T04:30:00.000Z");
    });

    it("parses 'next Monday' when today is Monday -> +7 days", () => {
      expect(istIso("next Monday evening")).toBe("2026-11-30T12:30:00.000Z");
    });

    it("parses 'Monday 10 am' when Monday 10 am already passed -> next Monday", () => {
      expect(istIso("Monday 10 am")).toBe("2026-11-30T04:30:00.000Z");
    });

    it("parses 'Monday 5 pm' when Monday 5 pm is still ahead today -> today", () => {
      expect(istIso("Monday 5 pm")).toBe("2026-11-23T11:30:00.000Z");
    });
  });

  describe("Calendar dates", () => {
    it("parses '25th at 3' -> 25 Nov 15:00 IST", () => {
      expect(istIso("25th at 3")).toBe("2026-11-25T09:30:00.000Z");
    });

    it("parses '25 Dec 11:30 am'", () => {
      expect(istIso("25 Dec 11:30 am")).toBe("2026-12-25T06:00:00.000Z");
    });

    it("parses 'December 25 evening'", () => {
      expect(istIso("December 25 evening")).toBe("2026-12-25T12:30:00.000Z");
    });

    it("parses '25/12 at 10 am'", () => {
      expect(istIso("25/12 at 10 am")).toBe("2026-12-25T04:30:00.000Z");
    });

    it("rolls past dates like '10 Nov 11 am' to next year", () => {
      expect(istIso("10 Nov 11 am")).toBe("2027-11-10T05:30:00.000Z");
    });
  });

  describe("Bare hours, 24h clock & past-time rollover", () => {
    it("moves bare '11' at 14:00 IST to tomorrow 11:00 IST", () => {
      expect(istIso("11")).toBe("2026-11-24T05:30:00.000Z");
    });

    it("treats bare '4' at 14:00 IST as today 16:00 IST (PM)", () => {
      expect(istIso("4")).toBe("2026-11-23T10:30:00.000Z");
    });

    it("treats bare '12' tomorrow as 12:00 noon IST", () => {
      expect(istIso("tomorrow at 12")).toBe("2026-11-24T06:30:00.000Z");
    });

    it("parses 'half past 3' as 15:30 IST", () => {
      expect(istIso("half past 3")).toBe("2026-11-23T10:00:00.000Z");
    });

    it("parses '3 o'clock' tomorrow as 15:00 IST", () => {
      expect(istIso("tomorrow 3 o'clock")).toBe("2026-11-24T09:30:00.000Z");
    });

    it("parses 24h 'tomorrow 15:00'", () => {
      expect(istIso("tomorrow 15:00")).toBe("2026-11-24T09:30:00.000Z");
    });
  });

  describe("IST date boundary & garbage rejection", () => {
    it("handles 23:50 IST 'tomorrow 10 am' across UTC date boundary", () => {
      // 2026-11-23 23:50 IST === 2026-11-23T18:20:00Z
      const lateIst = new Date("2026-11-23T18:20:00Z");
      expect(istIso("tomorrow 10 am", lateIst)).toBe("2026-11-24T04:30:00.000Z");
    });

    it("returns null for empty, vague, or invalid strings", () => {
      expect(parseFollowUpTime("", new Date())).toBeNull();
      expect(parseFollowUpTime("asap", new Date())).toBeNull();
      expect(parseFollowUpTime("call me sometime next month", new Date())).toBeNull();
      expect(parseFollowUpTime("tomorrow", new Date())).toBeNull(); // no time or day-part
      expect(parseFollowUpTime("32 Dec 10 am", new Date())).toBeNull();
      expect(parseFollowUpTime("tomorrow 25:99", new Date())).toBeNull();
    });
  });
});
