import * as React from "react";

type BadgeVariant = "default" | "secondary" | "destructive" | "outline" | "ghost";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const baseClasses =
  "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold tracking-normal normal-case transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950";

const variantClasses: Record<BadgeVariant, string> = {
  default: "border-white/15 bg-white/5 text-zinc-200",
  secondary: "border-white/10 bg-zinc-900/70 text-zinc-300",
  destructive: "border-red-500/30 bg-red-500/10 text-red-200",
  outline: "border-white/20 bg-transparent text-zinc-200",
  ghost: "border-transparent bg-transparent text-zinc-400",
};

export function Badge({
  className = "",
  variant = "default",
  ...props
}: BadgeProps) {
  return (
    <span
      className={`${baseClasses} ${variantClasses[variant]} ${className}`.trim()}
      {...props}
    />
  );
}
