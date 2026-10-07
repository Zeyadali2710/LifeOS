export function PageHeader({ title, lead }: { title: string; lead: string }) {
  return (
    <header className="mb-8">
      <h1 className="text-[clamp(28px,3vw,40px)] leading-[1.1] font-medium tracking-[-0.025em]">{title}</h1>
      <p className="mt-3 max-w-[640px] text-[15px] leading-normal text-text-2 tab:text-[17px]">{lead}</p>
    </header>
  );
}
