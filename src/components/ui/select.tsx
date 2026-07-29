import type { SelectHTMLAttributes } from "react";

export function Select({ className = "", ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`h-[44px] rounded-control border border-line bg-surface px-3 text-[15px] text-ink ${className}`} {...props} />;
}
