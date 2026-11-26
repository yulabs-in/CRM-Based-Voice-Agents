import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { friendlyError } from "@/lib/auth-errors";

function formatFriendlyMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "Something went wrong.";
  const lower = raw.toLowerCase();
  if (lower.includes("failed to fetch") || lower.includes("networkerror") || lower.includes("load failed")) {
    return "Could not reach the server. Check your connection and try again.";
  }
  if (lower.includes("jwt expired") || lower.includes("not authenticated")) {
    return "Your session expired. Sign in again to continue.";
  }
  return friendlyError(raw).text;
}

export function ErrorState({
  error,
  title = "Could not load data",
  onRetry,
}: {
  error?: unknown;
  title?: string;
  onRetry?: () => void;
}) {
  const message = formatFriendlyMessage(error);

  return (
    <div
      role="alert"
      className="m-3 flex flex-col items-center rounded-xl border border-destructive/25 bg-danger-soft/40 px-4 py-12 text-center"
    >
      <span className="grid size-11 place-items-center rounded-2xl bg-danger-soft text-destructive">
        <AlertCircle className="size-5" aria-hidden="true" />
      </span>
      <p className="mt-3 font-semibold text-foreground">{title}</p>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-4 gap-1.5" onClick={onRetry}>
          <RefreshCw className="size-3.5" />
          Try again
        </Button>
      )}
    </div>
  );
}
