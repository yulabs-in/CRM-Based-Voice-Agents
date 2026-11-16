export const inr = (n: unknown) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(n ?? 0));
export const shortDate = (d: unknown) => (d ? new Date(String(d)).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—");
export const DEAL_STAGES = [
  { value: "qualification", label: "Qualification" },
  { value: "proposal", label: "Proposal" },
  { value: "negotiation", label: "Negotiation" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
];
