import { cn } from "@/lib/utils";
import { passwordStrength } from "@/lib/password-strength";

const STRENGTH = ["Too short", "Weak", "Fair", "Good", "Strong"];

export function PasswordStrength({ value }: { value: string }) {
  const strength = passwordStrength(value);
  return (
    <div className="flex items-center gap-2 pt-1" aria-live="polite">
      <div className="flex flex-1 gap-1">
        {[1, 2, 3, 4].map((step) => (
          <span
            key={step}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors",
              strength >= step
                ? strength >= 3
                  ? "bg-success"
                  : strength === 2
                    ? "bg-primary-glow"
                    : "bg-destructive"
                : "bg-muted",
            )}
          />
        ))}
      </div>
      <span className="w-16 text-right text-xs text-muted-foreground">{STRENGTH[strength]}</span>
    </div>
  );
}
