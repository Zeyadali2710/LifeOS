import Link from "next/link";

const dots = { indigo: "bg-indigo", amber: "bg-amber", green: "bg-green", red: "bg-red", muted: "bg-text-3" };

export function StatusTile({ label, value, dot, href }: { label: string; value: string; dot: keyof typeof dots; href?: string }) {
  const cls =
    "flex min-h-11 min-w-[132px] flex-col gap-1.5 rounded-12 border border-[rgba(255,255,255,.07)] bg-[rgba(17,19,24,.7)] px-3.5 py-3 tab:min-h-0";
  const body = (
    <>
      <span className="flex items-center gap-1.5 font-mono text-[10px] font-medium tracking-[0.08em] text-text-3 uppercase">
        <span aria-hidden="true" className={`size-1.5 rounded-full ${dots[dot]}`} />
        {label}
      </span>
      <span className="text-[15px] font-medium text-text">{value}</span>
    </>
  );
  return href ? (
    <Link href={href} aria-label={`${label}: ${value}`} className={`${cls} hover:border-[rgba(255,255,255,.16)] hover:no-underline`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
