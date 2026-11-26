import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  action?: ReactNode;
}) {
  return (
    <div className="dot-canvas m-3 rounded-xl border border-dashed px-4 py-14 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-accent text-accent-foreground">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <p className="mt-4 font-semibold text-foreground">{title}</p>
      {description && <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{description}</p>}
      {action ? (
        <div className="mt-5 flex justify-center">{action}</div>
      ) : actionLabel && onAction ? (
        <Button variant="hero" className="mt-5" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
