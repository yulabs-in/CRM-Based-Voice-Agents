import { asAnswers, humanize } from "@/lib/sarvam-call";

/** Compact "key: value" chips for the answers a Sarvam agent captured on a call. */
export function AnswerChips({ answers, max = 4 }: { answers: unknown; max?: number }) {
  const entries = Object.entries(asAnswers(answers));
  if (!entries.length) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {entries.slice(0, max).map(([key, value]) => (
        <span key={key} title={`${humanize(key)}: ${value}`} className="inline-flex max-w-56 truncate rounded-full bg-accent px-2 py-0.5 text-[11px] text-accent-foreground">
          <span className="font-semibold">{humanize(key)}:</span>&nbsp;{value}
        </span>
      ))}
      {entries.length > max && <span className="text-[11px] text-muted-foreground">+{entries.length - max} more</span>}
    </div>
  );
}
