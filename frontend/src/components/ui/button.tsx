import { cn } from "@/lib/utils";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
}

export function Button({ variant = "primary", size = "md", className, children, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "daw-button",
        variant === "primary" && "daw-button-primary",
        variant === "secondary" && "daw-button-secondary",
        variant === "ghost" && "daw-button-ghost",
        variant === "danger" && "bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20",
        size === "sm" && "text-xs px-2.5 py-1.5 gap-1",
        size === "lg" && "text-sm px-5 py-3 gap-2.5",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function IconButton({ className, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "flex items-center justify-center w-8 h-8 rounded-lg",
        "text-daw-text-muted hover:text-daw-text hover:bg-daw-surface-3",
        "transition-colors disabled:opacity-30 disabled:cursor-not-allowed",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
