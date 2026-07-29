import type { ReactNode } from "react";

export function DataTable({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto rounded-card border border-line bg-surface"><table className="min-w-full text-left text-sm">{children}</table></div>;
}
