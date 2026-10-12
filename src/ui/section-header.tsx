import Link from "next/link";

export function SectionHeader({ id, label, meta, link }: { id: string; label: string; meta?: string; link?: { href: string; label: string } }) {
  return (
    <div className="mb-3.5 flex items-center gap-3">
      <h2 id={id} className="text-[11px] leading-[1.3] font-medium tracking-[.14em] text-text-3 uppercase">
        {label}
      </h2>
      {meta && <span className="text-[10.5px] text-text-3">{meta}</span>}
      <span aria-hidden="true" className="h-px flex-1 bg-white/[.06]" />
      {link && (
        <Link href={link.href} className="text-[12.5px] text-text-2 hover:text-text">
          {link.label}
        </Link>
      )}
    </div>
  );
}
