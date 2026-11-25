import { describe, expect, it } from "vitest";
import {
  balanceDue, daysToRenewal, groupSum, hierarchyRows, leaderboard, managerOptions, paymentState, paymentSummary, renewalWindow, renewalsDue, teamOf,
} from "@/lib/sales-ops";

const today = new Date(2026, 10, 25); // 25 Nov 2026, local time
const order = (over: Record<string, unknown> = {}) => ({ id: "o1", status: "confirmed", premium_amount: 24000, amount_paid: 0, ...over });

describe("paymentState", () => {
  it("covers every state", () => {
    expect(paymentState(order({ amount_paid: 24000 }), today)).toBe("paid");
    expect(paymentState(order({ amount_paid: 30000 }), today)).toBe("paid");
    expect(paymentState(order({ amount_paid: 1000 }), today)).toBe("partial");
    expect(paymentState(order(), today)).toBe("pending");
    expect(paymentState(order({ payment_due_date: "2026-11-24" }), today)).toBe("overdue");
    expect(paymentState(order({ payment_due_date: "2026-11-25" }), today)).toBe("pending"); // due today is not overdue yet
    expect(paymentState(order({ premium_amount: 0 }), today)).toBe("not_set");
    expect(paymentState(order({ status: "cancelled" }), today)).toBe("cancelled");
  });

  it("works out the balance", () => {
    expect(balanceDue(order({ amount_paid: 4000 }))).toBe(20000);
    expect(balanceDue(order({ amount_paid: 50000 }))).toBe(0);
  });
});

describe("renewals", () => {
  it("counts days and buckets them", () => {
    expect(daysToRenewal(order({ policy_end_date: "2026-12-02" }), today)).toBe(7);
    expect(daysToRenewal(order({ policy_end_date: "2026-11-20" }), today)).toBe(-5);
    expect(daysToRenewal(order(), today)).toBeNull();
    expect([renewalWindow(-1), renewalWindow(7), renewalWindow(30), renewalWindow(90), renewalWindow(91), renewalWindow(null)])
      .toEqual(["overdue", "week", "month", "quarter", "later", "none"]);
  });

  it("drops policies that already have a renewal order", () => {
    const orders = [
      order({ id: "a", status: "issued", policy_end_date: "2026-12-01" }),
      order({ id: "b", status: "issued", policy_end_date: "2026-12-05" }),
      order({ id: "c", status: "draft", renewed_from_order_id: "a" }),
      order({ id: "d", status: "cancelled", renewed_from_order_id: "b" }),
      order({ id: "e", status: "confirmed", policy_end_date: "2026-12-01" }),
    ];
    expect(renewalsDue(orders).map((o) => o.id)).toEqual(["b"]);
  });
});

describe("hierarchy", () => {
  const members = [
    { user_id: "mgr", role: "sales_manager", reports_to: null },
    { user_id: "tl1", role: "team_lead", reports_to: "mgr" },
    { user_id: "tl2", role: "team_lead", reports_to: "mgr" },
    { user_id: "rep1", role: "sales_rep", reports_to: "tl1" },
    { user_id: "rep2", role: "sales_rep", reports_to: "tl2" },
    { user_id: "admin", role: "admin", reports_to: null },
  ];

  it("finds a whole team", () => {
    expect([...teamOf(members, "mgr")].sort()).toEqual(["mgr", "rep1", "rep2", "tl1", "tl2"]);
    expect([...teamOf(members, "tl1")].sort()).toEqual(["rep1", "tl1"]);
    expect([...teamOf(members, "rep1")]).toEqual(["rep1"]);
  });

  it("orders the tree with depth", () => {
    expect(hierarchyRows(members).map((m) => `${m.depth}:${m.user_id}`))
      .toEqual(["0:mgr", "1:tl1", "2:rep1", "1:tl2", "2:rep2", "0:admin"]);
  });

  it("never offers a manager that would create a loop", () => {
    expect(managerOptions(members, "tl1").map((m) => m.user_id).sort()).toEqual(["admin", "mgr", "rep2", "tl2"]);
  });

  it("survives a loop in bad data", () => {
    const looped = [{ user_id: "a", role: "x", reports_to: "b" }, { user_id: "b", role: "x", reports_to: "a" }];
    expect(hierarchyRows(looped)).toHaveLength(2);
    expect([...teamOf(looped, "a")].sort()).toEqual(["a", "b"]);
  });
});

describe("paymentSummary / groupSum", () => {
  it("adds up collections, outstanding and overdue", () => {
    const orders = [
      order({ id: "1", amount_paid: 24000 }),
      order({ id: "2", amount_paid: 4000 }),
      order({ id: "3", payment_due_date: "2026-11-01" }),
      order({ id: "4", status: "draft" }),
      order({ id: "5", status: "cancelled" }),
    ];
    const payments = [
      { amount: 24000, status: "received", paid_on: "2026-11-20" },
      { amount: 5000, status: "received", paid_on: "2026-10-01" },
      { amount: 1000, status: "refunded", paid_on: "2026-11-21" },
    ];
    expect(paymentSummary(orders, payments, new Date(2026, 10, 1), today)).toEqual({
      collected: 23000, outstanding: 44000, overdue: 24000, overdueCount: 1, partialCount: 1, paidCount: 1,
    });
  });

  it("groups and sorts", () => {
    expect(groupSum([{ k: "a", v: 1 }, { k: "b", v: 5 }, { k: "a", v: 2 }], (r) => r.k, (r) => r.v)).toEqual([
      { name: "b", value: 5 }, { name: "a", value: 3 },
    ]);
  });
});


describe("leaderboard", () => {
  it("rolls each person's numbers up to their managers", () => {
    const members = [
      { user_id: "mgr", role: "sales_manager", reports_to: null },
      { user_id: "tl", role: "team_lead", reports_to: "mgr" },
      { user_id: "rep", role: "sales_rep", reports_to: "tl" },
    ];
    const orders = [
      { id: "1", status: "issued", premium_amount: 10000, amount_paid: 0, owner_id: "rep" },
      { id: "2", status: "confirmed", premium_amount: 5000, amount_paid: 0, owner_id: "tl" },
      { id: "3", status: "cancelled", premium_amount: 99999, amount_paid: 0, owner_id: "rep" },
      { id: "4", status: "draft", premium_amount: 1000, amount_paid: 0, owner_id: null },
    ];
    const payments = [{ sales_order_id: "1", amount: 10000, status: "received", paid_on: "2026-11-01" }];
    const rows = leaderboard(members, orders, payments);
    expect(rows.map((r) => [r.user_id, r.depth, r.own.orders, r.team.orders, r.team.premium, r.team.collected])).toEqual([
      ["mgr", 0, 0, 2, 15000, 10000],
      ["tl", 1, 1, 2, 15000, 10000],
      ["rep", 2, 1, 1, 10000, 10000],
    ]);
    expect(rows[2].own.issued).toBe(1);
  });
});
