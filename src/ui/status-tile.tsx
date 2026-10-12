import Link from "next/link";

const dots = { indigo: "bg-accent", amber: "bg-amber", green: "bg-green", red: "bg-red", muted: "bg-text-3" };

export function StatusTile({ label, value, dot, href }: { label: string; value: string; dot: keyof typeof dots; href?: string }) {
  const cls =
    "flex min-h-11 min-w-[132px] flex-col justify-center gap-1.5 glass-card rounded-24 px-4 py-3 tab:min-h-0";
  const body = (
    <>
      <span className="flex items-center gap-1.5 text-[10px] font-medium tracking-[.12em] text-text-3 uppercase">
        <span aria-hidden="true" className={`size-1.5 rounded-full ${dots[dot]}`} />
        {label}
      </span>
      <span className="font-display text-[20px] leading-none text-text">{value}</span>
    </>
  );
  return href ? (
    <Link href={href} aria-label={`${label}: ${value}`} className={`${cls} hover:no-underline`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
