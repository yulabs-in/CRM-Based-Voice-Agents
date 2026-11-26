import { describe, expect, it } from "vitest";
import {
  billableMinutes,
  budgetLevel,
  canViewBilling,
  computeBudgetStatus,
  currentIstMonth,
  estimateCost,
  formatDurationMmSs,
  formatInr,
  istDateRange,
  istMonthRange,
  minutesForSummaryRow,
  toCsv,
} from "@/lib/usage";

describe("usage helpers", () => {
  describe("billableMinutes", () => {
    it("rounds up per call minute by default", () => {
      expect(billableMinutes(0)).toBe(0);
      expect(billableMinutes(-5)).toBe(0);
      expect(billableMinutes(1)).toBe(1);
      expect(billableMinutes(60)).toBe(1);
      expect(billableMinutes(61)).toBe(2);
      expect(billableMinutes(125)).toBe(3);
    });

    it("returns exact fractional minutes in exact mode", () => {
      expect(billableMinutes(0, "exact")).toBe(0);
      expect(billableMinutes(30, "exact")).toBe(0.5);
      expect(billableMinutes(90, "exact")).toBe(1.5);
    });

    it("selects summary row minutes by rounding mode", () => {
      const row = { seconds: 90, billable_minutes: 2 };
      expect(minutesForSummaryRow(row, "per_call_minute")).toBe(2);
      expect(minutesForSummaryRow(row, "exact")).toBe(1.5);
    });
  });

  describe("estimateCost", () => {
    it("combines minute and attempt rates cleanly", () => {
      expect(
        estimateCost({
          minutes: 12,
          attempts: 20,
          costPerMinute: 2.5,
          costPerAttempt: 0.25,
        })
      ).toBe(35);
    });

    it("handles zero attempt rate and rounds to 2 decimals", () => {
      expect(
        estimateCost({
          minutes: 1.3333,
          attempts: 5,
          costPerMinute: 1.5,
        })
      ).toBe(2);
    });
  });

  describe("budgetLevel and computeBudgetStatus", () => {
    it("returns ok below 80%, warning at 80-99.9%, exceeded at >=100%", () => {
      expect(budgetLevel(790, 1000)).toBe("ok");
      expect(budgetLevel(800, 1000)).toBe("warning");
      expect(budgetLevel(999, 1000)).toBe("warning");
      expect(budgetLevel(1000, 1000)).toBe("exceeded");
      expect(budgetLevel(1250, 1000)).toBe("exceeded");
    });

    it("never warns or exceeds when budget is null or 0", () => {
      expect(budgetLevel(5000, null)).toBe("ok");
      expect(budgetLevel(5000, 0)).toBe("ok");
      expect(computeBudgetStatus(500, null, true)).toEqual({
        spent: 500,
        budget: null,
        percent: 0,
        level: "ok",
        hardStop: true,
      });
    });
  });

  describe("IST month and date boundaries", () => {
    it("computes UTC ISO boundaries for an IST month", () => {
      expect(istMonthRange("2026-11")).toEqual({
        fromIso: "2026-10-31T18:30:00.000Z",
        toIso: "2026-11-30T18:30:00.000Z",
      });
      // Year rollover December -> January
      expect(istMonthRange("2026-12")).toEqual({
        fromIso: "2026-11-30T18:30:00.000Z",
        toIso: "2026-12-31T18:30:00.000Z",
      });
    });

    it("treats 00:30 IST on the 1st as the new IST month", () => {
      // 2026-11-01 00:30 IST == 2026-10-31 19:00 UTC
      const instant = new Date("2026-10-31T19:00:00.000Z");
      expect(currentIstMonth(instant)).toBe("2026-11");
    });

    it("computes inclusive IST date range", () => {
      expect(istDateRange("2026-11-01", "2026-11-02")).toEqual({
        fromIso: "2026-10-31T18:30:00.000Z",
        toIso: "2026-11-02T18:30:00.000Z",
      });
    });
  });

  describe("formatting, permissions, and CSV", () => {
    it("formats INR and mm:ss durations", () => {
      expect(formatInr(8200)).toContain("8,200");
      expect(formatDurationMmSs(0)).toBe("0:00");
      expect(formatDurationMmSs(75)).toBe("1:15");
    });

    it("restricts billing view to owner, admin, and sales_manager", () => {
      expect(canViewBilling("owner")).toBe(true);
      expect(canViewBilling("admin")).toBe(true);
      expect(canViewBilling("sales_manager")).toBe(true);
      expect(canViewBilling("sales_rep")).toBe(false);
      expect(canViewBilling("read_only")).toBe(false);
    });

    it("exports UTF-8 BOM CSV and escapes commas and quotes", () => {
      const csv = toCsv([
        {
          date: "2026-11-23",
          agent: 'Agent, "Alpha"',
          campaign: "Q4 Renewal",
          attempts: 10,
          connected: 6,
          minutes: 12,
          estimated_cost_inr: 30,
        },
      ]);
      expect(csv.startsWith("\uFEFFdate,agent,campaign,attempts,connected,minutes,estimated_cost_inr\n")).toBe(true);
      expect(csv).toContain('2026-11-23,"Agent, ""Alpha""",Q4 Renewal,10,6,12,30');
    });
  });
});
