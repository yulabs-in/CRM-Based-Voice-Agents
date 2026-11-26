import { describe, expect, it, vi } from "vitest";
import { bookingKind, bookingTime } from "@/lib/booking.server";
import { awaitingAnswers, createsLead, resolveVerdict, ANSWERS_GRACE_MS } from "@/lib/outcome-rules";

vi.mock("@/lib/supabase-admin.server", () => ({ supabaseAdmin: { from: vi.fn() } }));

describe("bookingKind: which calls schedule a meeting", () => {
  it("books every agent's booking outcome, even without a parsed time", () => {
    expect(bookingKind("consultation_booked", "positive", false)?.label).toBe("Consultation");
    expect(bookingKind("site_visit_booked", "positive", false)).toEqual({ label: "Site visit", inPerson: true });
    expect(bookingKind("test_drive_booked", "positive", false)?.label).toBe("Test drive");
    expect(bookingKind("counselling_booked", "positive", false)?.label).toBe("Counselling session");
    expect(bookingKind("service_booked", "neutral", false)?.label).toBe("Vehicle service");
    expect(bookingKind("appointment_requested", "positive", false)?.label).toBe("Appointment");
    expect(bookingKind("appointment_rescheduled", "neutral", false)?.label).toBe("Appointment");
    expect(bookingKind("reservation_requested", "positive", false)?.label).toBe("Reservation");
  });

  it("books a callback or any positive call when the caller agreed a time", () => {
    expect(bookingKind("callback", "positive", true)?.label).toBe("Call back");
    expect(bookingKind("interested", "positive", true)?.label).toBe("Advisor call");
    expect(bookingKind("registration_help", "positive", true)?.label).toBe("Advisor call");
    expect(bookingKind("interested", "positive", false)).toBeNull();
    expect(bookingKind("callback", "positive", false)).toBeNull();
  });

  it("never books cancellations, negatives or neutral support calls", () => {
    expect(bookingKind("appointment_cancelled", "neutral", true)).toBeNull();
    expect(bookingKind("booking_cancelled", "neutral", true)).toBeNull();
    expect(bookingKind("not_interested", "negative", true)).toBeNull();
    expect(bookingKind("resolved", "neutral", true)).toBeNull();
  });
});

describe("bookingTime: reads every agent's time field", () => {
  it("prefers the most specific time", () => {
    expect(bookingTime({ site_visit_time: "Saturday 11 am", follow_up_time: "tomorrow" })).toBe("Saturday 11 am");
    expect(bookingTime({ preferred_slot: "28 Nov 10:30 am" })).toBe("28 Nov 10:30 am");
    expect(bookingTime({ reservation_date: "Friday 8 pm" })).toBe("Friday 8 pm");
    expect(bookingTime({ follow_up_time: "  tomorrow morning " })).toBe("tomorrow morning");
    expect(bookingTime({})).toBe("");
  });
});

describe("createsLead: every real conversation reaches the Leads page", () => {
  const verdict = (disposition: string) => resolveVerdict({ status: "completed", answers: { disposition } }, null);

  it("creates leads for positive and service/support conversations from every agent", () => {
    for (const d of ["interested", "consultation_booked", "site_visit_booked", "callback", "appointment_requested", "appointment_confirmed", "resolved", "ticket_raised", "complaint", "payment_promised", "booking_confirmed", "enquiry_answered", "escalated"]) {
      expect(verdict(d)?.createLead, d).toBe(true);
    }
  });

  it("creates no new lead when nobody really talked or the caller declined", () => {
    for (const d of ["no_answer", "busy", "not_interested", "do_not_call", "wrong_person"]) {
      expect(verdict(d)?.createLead, d).toBe(false);
    }
    expect(createsLead({ kind: "neutral", label: "connected" })).toBe(false);
  });
});

describe("awaitingAnswers: don't apply a call before its outcome arrives", () => {
  const now = Date.parse("2026-11-26T12:00:00Z");
  const call = (answers: Record<string, string>, endedMinutesAgo: number, summary: string | null = null) => ({
    status: "completed", answers, summary, ended_at: new Date(now - endedMinutesAgo * 60_000).toISOString(),
  });

  it("waits while a just-finished call has no disposition or summary", () => {
    expect(awaitingAnswers(call({}, 0.2), now)).toBe(true);
    expect(awaitingAnswers(call({}, 19), now)).toBe(true);
  });

  it("applies as soon as the disposition or a summary is there", () => {
    expect(awaitingAnswers(call({ disposition: "interested" }, 0.2), now)).toBe(false);
    expect(awaitingAnswers(call({}, 0.2, "Caller wants a quote"), now)).toBe(false);
  });

  it("stops waiting after the grace period", () => {
    expect(awaitingAnswers(call({}, ANSWERS_GRACE_MS / 60_000 + 1), now)).toBe(false);
  });

  it("never holds back calls that aren't completed", () => {
    expect(awaitingAnswers({ status: "no_answer", answers: {}, summary: null, ended_at: null }, now)).toBe(false);
  });
});
