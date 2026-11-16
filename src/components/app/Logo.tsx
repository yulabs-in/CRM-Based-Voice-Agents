import { cn } from "@/lib/utils";

export function Logo({ className, showText = true }: { className?: string; showText?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span className="relative grid size-8 place-items-center rounded-[10px] bg-gradient-primary shadow-glow">
        <svg viewBox="0 0 24 24" className="size-4 text-primary-foreground" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden>
          <path d="M5 5l7 8 7-8M12 13v6" />
        </svg>
      </span>
      {showText && (
        <span className="text-[15px] font-bold tracking-tight text-foreground">
          Yulabs <span className="font-medium text-muted-foreground">CRM</span>
        </span>
      )}
    </span>
  );
}
