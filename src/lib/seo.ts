export const pageHead = (title: string, description: string) => ({
  meta: [
    { title: `${title} — Yulabs CRM` },
    { name: "description", content: description },
    { property: "og:title", content: `${title} — Yulabs CRM` },
    { property: "og:description", content: description },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ],
});
export const opts = (xs: string[]) => xs.map((v) => ({ value: v, label: (v[0]!.toUpperCase() + v.slice(1)).replace(/_/g, " ") }));
export const fmtDuration = (s: unknown) => { const n = Number(s) || 0; return `${Math.floor(n / 60)}m ${String(n % 60).padStart(2, "0")}s`; };
