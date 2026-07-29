import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: "primary" | "secondary" | "danger";
};

const variants = {
  primary: "bg-accent text-surface disabled:bg-disabled-soft disabled:text-disabled",
  secondary: "border border-line bg-surface text-ink disabled:bg-disabled-soft disabled:text-disabled",
  danger: "bg-warning text-surface disabled:bg-disabled-soft disabled:text-disabled",
};

export function Button({ children, className = "", variant = "primary", ...props }: ButtonProps) {
  return (
    <button
      className={`min-h-[52px] rounded-control px-4 text-[15px] font-semibold transition disabled:cursor-not-allowed ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
