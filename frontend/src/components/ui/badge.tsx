import { cn } from "@/lib/utils";

export function Badge({
  variant = "default",
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  variant?: "default" | "accent" | "cyan" | "green" | "orange" | "red" | "vocal" | "drum" | "bass" | "piano";
}) {
  return (
    <span
      className={cn(
        "daw-badge",
        variant === "default" && "bg-daw-surface-3 text-daw-text-muted",
        variant === "accent" && "bg-daw-accent/10 text-daw-accent",
        variant === "cyan" && "bg-daw-cyan/10 text-daw-cyan",
        variant === "green" && "bg-daw-green/10 text-daw-green",
        variant === "orange" && "bg-daw-orange/10 text-daw-orange",
        variant === "red" && "bg-daw-red/10 text-daw-red",
        variant === "vocal" && "bg-daw-vocal/10 text-daw-vocal",
        variant === "drum" && "bg-daw-drum/10 text-daw-drum",
        variant === "bass" && "bg-daw-bass/10 text-daw-bass",
        variant === "piano" && "bg-daw-piano/10 text-daw-piano",
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
