import type { CSSProperties, ReactNode } from "react";
import s from "./layout.module.css";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/** Route container: full width up to 1680 px, centred, responsive padding from the layout table. */
export function Page({ children, home, className, label }: { children: ReactNode; home?: boolean; className?: string; label?: string }) {
  return (
    <div className={cx(s.page, home && s.home, className)} data-screen-label={label}>
      {children}
    </div>
  );
}

export function PageHeader({ title, sub, actions, titleId }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; titleId?: string }) {
  return (
    <header className={s.header}>
      <div>
        <h1 id={titleId} className={s.title}>
          {title}
        </h1>
        {sub && <p className={s.sub}>{sub}</p>}
      </div>
      {actions && <div className={s.actions}>{actions}</div>}
    </header>
  );
}

export function Section({
  id,
  label,
  meta,
  children,
  className,
  style,
}: {
  id: string;
  label: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <section aria-labelledby={id} className={cx(s.section, className)} style={style}>
      <div className={s.sectionHead}>
        <h2 id={id} className={s.sectionLabel}>
          {label}
        </h2>
        {meta && <span className={s.sectionMeta}>{meta}</span>}
      </div>
      {children}
    </section>
  );
}

export function Card({
  children,
  head,
  headAside,
  pad,
  rows,
  className,
  style,
  as: As = "div",
  labelledBy,
}: {
  children: ReactNode;
  head?: ReactNode;
  headAside?: ReactNode;
  pad?: boolean;
  rows?: boolean;
  className?: string;
  style?: CSSProperties;
  as?: "div" | "section" | "article" | "li";
  labelledBy?: string;
}) {
  return (
    <As className={cx(s.card, pad && s.cardPad, className)} style={style} aria-labelledby={labelledBy}>
      {head && (
        <div className={s.cardHead}>
          <div className={s.cardHeadTitle}>{head}</div>
          {headAside}
        </div>
      )}
      {rows ? <div className={s.rows}>{children}</div> : children}
    </As>
  );
}

export function StatTile({ value, label }: { value: ReactNode; label: ReactNode }) {
  return (
    <div className={s.stat}>
      <div className={s.statValue}>{value}</div>
      <div className={s.statKey}>{label}</div>
    </div>
  );
}

/** Flex row of ratio columns; each child sets its own `flex` (e.g. "2 1 520px"). */
export function Columns({ children, className, gap, style }: { children: ReactNode; className?: string; gap?: number; style?: CSSProperties }) {
  return (
    <div className={cx(s.cols, className)} style={gap !== undefined ? { gap, ...style } : style}>
      {children}
    </div>
  );
}

export function Stack({ children, gap, className, style }: { children: ReactNode; gap?: number; className?: string; style?: CSSProperties }) {
  return (
    <div className={cx(s.stack, className)} style={gap !== undefined ? { gap, ...style } : style}>
      {children}
    </div>
  );
}
