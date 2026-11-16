import { describe, expect, it } from "vitest";
import { rangeStart } from "@/lib/ranges";
import { toCsv } from "@/lib/csv";
import { canDelete, canWrite } from "@/lib/org";

describe("date ranges", () => {
  const now = new Date(2026, 10, 16, 15, 0);
  it("last 7 days starts 6 days ago at midnight", () => expect(rangeStart("7d", now)).toEqual(new Date(2026, 10, 10)));
  it("this month starts on the 1st", () => expect(rangeStart("month", now)).toEqual(new Date(2026, 10, 1)));
});

describe("csv export", () => {
  it("quotes values with commas", () => expect(toCsv([{ a: "x,y", b: 1 }])).toBe('a,b\n"x,y",1'));
});

describe("roles", () => {
  it("read-only and analysts cannot edit", () => { expect(canWrite("read_only")).toBe(false); expect(canWrite("analyst")).toBe(false); expect(canWrite("sales_rep")).toBe(true); });
  it("only owners, admins and sales managers delete", () => { expect(canDelete("sales_rep")).toBe(false); expect(canDelete("sales_manager")).toBe(true); });
});

import { buildAnalytics } from "@/lib/analytics";
describe("analytics", () => {
  const base = { deals: [], leads: [], calls: [], campaigns: [], tasks: [], members: [], profiles: [] };
  it("win rate counts only closed deals", () => {
    const a = buildAnalytics("sales", { ...base, deals: [{ stage: "won", value: 100 }, { stage: "lost", value: 50 }, { stage: "proposal", value: 10 }] });
    expect(a.kpis.find((k) => k.label === "Win rate")?.value).toBe("50%");
  });
  it("answered rate uses completed calls", () => {
    const a = buildAnalytics("calls", { ...base, calls: [{ status: "completed", duration_seconds: 120 }, { status: "no_answer", duration_seconds: 0 }] });
    expect(a.kpis.find((k) => k.label === "Answered rate")?.value).toBe("50%");
  });
});
