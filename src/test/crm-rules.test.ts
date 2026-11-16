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
