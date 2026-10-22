import type { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "destructive" | "ai" | "inverse";
  size?: "xs" | "sm" | "md" | "touch";
  loading?: boolean;
};

const variants = {
  primary: "bg-accent-solid text-white border border-transparent hover:bg-[#0066cc] active:bg-[#005bb8]",
  secondary: "bg-white/[.03] text-text border border-white/10 hover:border-white/20 hover:bg-white/[.06]",
  ghost: "bg-transparent text-text-2 border border-transparent hover:bg-white/[.06] hover:text-text",
  destructive: "bg-transparent text-red border border-[rgba(255,105,97,.3)] hover:bg-[rgba(255,105,97,.08)] hover:border-[rgba(255,105,97,.5)]",
  ai: "bg-[rgba(10,132,255,.2)] text-cyan-soft border border-transparent hover:bg-[rgba(10,132,255,.3)]",
  inverse: "bg-text text-on-accent font-semibold border border-transparent hover:bg-white",
};

const sizes = {
  xs: "h-[26px] px-2.5 rounded-full text-[12px]",
  sm: "h-[30px] px-3 rounded-full text-[12.5px]",
  md: "h-8 px-3.5 rounded-full text-[13px] font-medium",
  touch: "h-11 px-4 rounded-full text-[13px]",
};

const spinner: Record<string, string> = {
  primary: "border-white/30 border-t-white",
  inverse: "border-[rgba(11,12,16,.25)] border-t-on-accent",
  destructive: "border-[rgba(255,105,97,.25)] border-t-red",
};

export function Button({ variant = "primary", size = "md", loading = false, type = "button", disabled, className = "", children, ...props }: Props) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center gap-2 font-medium transition active:scale-[.98] disabled:cursor-not-allowed disabled:border-white/[.06] disabled:bg-white/[.06] disabled:text-text-3 disabled:hover:bg-white/[.06] ${loading ? "opacity-85" : ""} ${sizes[size]} ${variants[variant]} ${className}`}
      {...props}
    >
      {loading && (
        <span
          aria-hidden="true"
          className={`size-3 shrink-0 animate-[lo-spin_.7s_linear_infinite] rounded-full border-2 ${spinner[variant] ?? "border-white/20 border-t-text"}`}
        />
      )}
      {children}
    </button>
  );
}
