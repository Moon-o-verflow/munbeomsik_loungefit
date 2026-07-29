import type { ReactNode } from "react";

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "accent" | "warning" | "neutral" }) {
  const tones = {
    accent: "bg-accent-soft text-accent",
    warning: "bg-warning-soft text-warning",
    neutral: "bg-quiet text-muted",
  };
  return <span className={`inline-flex h-6 items-center rounded-md px-2 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}
