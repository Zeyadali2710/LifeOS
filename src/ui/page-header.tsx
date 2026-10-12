export function PageHeader({ title, lead, eyebrow }: { title: string; lead: string; eyebrow?: { text: string; className?: string } }) {
  return (
    <header className="mb-8">
      {eyebrow && <p className={`mb-2.5 text-[11px] font-medium tracking-[.14em] uppercase ${eyebrow.className ?? "text-text-2"}`}>{eyebrow.text}</p>}
      <h1 className="font-display text-[clamp(34px,4.4vw,60px)] leading-[.95] font-normal tracking-[-0.015em] [text-wrap:pretty]">{title}</h1>
      <p className="mt-2.5 max-w-[640px] text-[15px] leading-normal text-text-2">{lead}</p>
    </header>
  );
}
