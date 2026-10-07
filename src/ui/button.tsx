import type { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "destructive" | "ai" | "inverse";
  size?: "xs" | "sm" | "md" | "touch";
  loading?: boolean;
};

const variants = {
  primary: "bg-indigo text-on-accent border border-transparent hover:bg-indigo-soft",
  secondary: "bg-fill-1 text-text border border-[rgba(255,255,255,.10)] hover:bg-[rgba(255,255,255,.06)] hover:border-[rgba(255,255,255,.2)]",
  ghost: "bg-transparent text-text-2 border border-transparent hover:bg-fill-2 hover:text-text",
  destructive: "bg-transparent text-red border border-[rgba(240,122,110,.3)] uppercase tracking-[0.05em] hover:bg-[rgba(240,122,110,.08)] hover:border-[rgba(240,122,110,.5)]",
  ai: "bg-[rgba(139,140,255,.10)] text-[#c7c8ff] border border-[rgba(139,140,255,.35)] hover:bg-[rgba(139,140,255,.18)]",
  inverse: "bg-[#e9eaf0] text-[#0b0c10] font-semibold uppercase tracking-[0.05em] border border-transparent hover:bg-white",
};

const sizes = {
  xs: "h-[26px] px-2.5 rounded-6 text-[12.5px]",
  sm: "h-[30px] px-3 rounded-7 text-[12.5px]",
  md: "h-[34px] px-3.5 rounded-9 text-[13px]",
  touch: "h-11 px-4 rounded-10 text-[13px]",
};

const spinner: Record<string, string> = {
  primary: "border-[rgba(11,12,16,.25)] border-t-[#0b0c10]",
  inverse: "border-[rgba(11,12,16,.25)] border-t-[#0b0c10]",
  destructive: "border-[rgba(240,122,110,.25)] border-t-red",
};

export function Button({ variant = "primary", size = "md", loading = false, type = "button", disabled, className = "", children, ...props }: Props) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center gap-2 font-medium transition active:scale-[.98] disabled:cursor-not-allowed disabled:border-[rgba(255,255,255,.06)] disabled:bg-fill-1 disabled:text-text-4 disabled:hover:bg-fill-1 ${loading ? "opacity-85" : ""} ${sizes[size]} ${variants[variant]} ${className}`}
      {...props}
    >
      {loading && (
        <span
          aria-hidden="true"
          className={`size-3 shrink-0 animate-[lo-spin_.7s_linear_infinite] rounded-full border-2 ${spinner[variant] ?? "border-[rgba(255,255,255,.2)] border-t-text"}`}
        />
      )}
      {children}
    </button>
  );
}
