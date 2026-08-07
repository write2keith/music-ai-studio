import { cn } from "@/lib/utils";

interface ProgressProps {
  value: number;
  max?: number;
  size?: "sm" | "md";
  color?: "accent" | "cyan" | "green" | "orange";
  className?: string;
}

export function Progress({ value, max = 100, size = "sm", color = "accent", className }: ProgressProps) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const colors: Record<string, string> = {
    accent: "bg-daw-accent",
    cyan: "bg-daw-cyan",
    green: "bg-daw-green",
    orange: "bg-orange-500",
  };

  return (
    <div
      className={cn(
        "bg-daw-surface rounded-full overflow-hidden",
        size === "sm" && "h-1.5",
        size === "md" && "h-3",
        className
      )}
    >
      <div
        className={cn("h-full rounded-full transition-all duration-500 ease-out", colors[color])}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
