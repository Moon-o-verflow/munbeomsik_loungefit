import type { InputHTMLAttributes } from "react";

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`h-[52px] w-full rounded-control border border-line bg-surface px-4 text-[15px] text-ink outline-none focus:border-accent ${className}`} {...props} />;
}
