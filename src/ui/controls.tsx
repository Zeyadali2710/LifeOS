"use client";

import Link from "next/link";
import { useId } from "react";
import type { InputHTMLAttributes, KeyboardEvent, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { Icon } from "./icon";
import type { IconName } from "./icon-names";
import s from "./controls.module.css";

type Opt<T extends string> = { value: T; label: ReactNode; count?: number; icon?: IconName };

/** Arrow keys move between siblings with the given role (roving focus for tab lists and radio groups). */
function rove(e: KeyboardEvent<HTMLElement>, select: (el: HTMLElement) => void) {
  const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
  if (!keys.includes(e.key)) return;
  const items = [...(e.currentTarget.querySelectorAll<HTMLElement>("[data-rove]"))];
  const i = items.indexOf(document.activeElement as HTMLElement);
  if (i < 0) return;
  e.preventDefault();
  const n = e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : (i + (e.key === "ArrowRight" ? 1 : items.length - 1)) % items.length;
  items[n]!.focus();
  select(items[n]!);
}

/** Segmented control. `role="radiogroup"` for a value choice, `"tablist"` when it switches panels. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  role = "radiogroup",
  small,
  className,
}: {
  options: Opt<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  role?: "radiogroup" | "tablist";
  small?: boolean;
  className?: string;
}) {
  const itemRole = role === "radiogroup" ? "radio" : "tab";
  return (
    <div
      role={role}
      aria-label={label}
      className={[s.seg, small && s.segSm, className].filter(Boolean).join(" ")}
      onKeyDown={(e) => rove(e, (el) => onChange(el.dataset.value as T))}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role={itemRole}
            data-rove
            data-value={o.value}
            aria-checked={itemRole === "radio" ? on : undefined}
            aria-selected={itemRole === "tab" ? on : undefined}
            tabIndex={on ? 0 : -1}
            className={s.segItem}
            onClick={() => onChange(o.value)}
          >
            {o.icon && <Icon name={o.icon} size={16} />}
            {o.label}
            {o.count !== undefined && <span className={s.chipCount}>{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export type TabItem = { value: string; label: ReactNode; count?: number; icon?: IconName; href?: string };

/** Joined view switcher (Agents). Items are links when `href` is set so the view lives in the URL. */
export function ViewSwitcher({ items, value, label, badge }: { items: TabItem[]; value: string; label: string; badge?: (v: string) => ReactNode }) {
  return (
    <nav aria-label={label} className={s.views}>
      {items.map((t) => (
        <Link key={t.value} href={t.href ?? "#"} className={s.view} aria-current={t.value === value ? "page" : undefined} scroll={false}>
          {t.icon && <Icon name={t.icon} size={17} />}
          {t.label}
          {badge?.(t.value)}
        </Link>
      ))}
    </nav>
  );
}

/** Underline tabs. Link tabs (`href`) for URL state; button tabs with `onChange` for local panels. */
export function Tabs({
  items,
  value,
  onChange,
  label,
  className,
}: {
  items: TabItem[];
  value: string;
  onChange?: (v: string) => void;
  label: string;
  className?: string;
}) {
  const asLinks = items.every((t) => t.href);
  const body = (t: TabItem) => (
    <>
      {t.icon && <Icon name={t.icon} size={17} className={s.tabIcon} />}
      {t.label}
      {t.count !== undefined && <span className={s.tabCount}>{t.count}</span>}
    </>
  );
  if (asLinks)
    return (
      <nav aria-label={label} className={[s.tabs, className].filter(Boolean).join(" ")}>
        {items.map((t) => (
          <Link key={t.value} href={t.href!} scroll={false} className={s.tab} aria-current={t.value === value ? "page" : undefined}>
            {body(t)}
          </Link>
        ))}
      </nav>
    );
  return (
    <div role="tablist" aria-label={label} className={[s.tabs, className].filter(Boolean).join(" ")} onKeyDown={(e) => rove(e, (el) => onChange?.(el.dataset.value!))}>
      {items.map((t) => (
        <button
          key={t.value}
          type="button"
          role="tab"
          data-rove
          data-value={t.value}
          aria-selected={t.value === value}
          tabIndex={t.value === value ? 0 : -1}
          className={s.tab}
          onClick={() => onChange?.(t.value)}
        >
          {body(t)}
        </button>
      ))}
    </div>
  );
}

export function FilterChip({
  selected,
  onClick,
  count,
  icon,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  count?: number;
  icon?: IconName;
  children: ReactNode;
}) {
  return (
    <button type="button" aria-pressed={selected} className={s.chip} onClick={onClick}>
      {icon && <Icon name={icon} size={16} />}
      {children}
      {count !== undefined && <span className={s.chipCount}>{count}</span>}
    </button>
  );
}

export function TogglePill({ pressed, onChange, children, iconOff = "sell" }: { pressed: boolean; onChange: (v: boolean) => void; children: ReactNode; iconOff?: IconName }) {
  return (
    <button type="button" aria-pressed={pressed} className={s.pill} onClick={() => onChange(!pressed)}>
      <Icon name={pressed ? "check" : iconOff} size={16} />
      {children}
    </button>
  );
}

export function SearchField({
  label,
  className,
  inputRef,
  ...rest
}: { label: string; className?: string; inputRef?: React.Ref<HTMLInputElement> } & Omit<InputHTMLAttributes<HTMLInputElement>, "aria-label">) {
  return (
    <label className={[s.search, className].filter(Boolean).join(" ")}>
      <Icon name="search" size={18} />
      <input ref={inputRef} type="search" aria-label={label} className={s.searchInput} {...rest} />
    </label>
  );
}

export function Select({
  label,
  inlineLabel,
  children,
  className,
  ...rest
}: { label: string; inlineLabel?: string; children: ReactNode; className?: string } & Omit<SelectHTMLAttributes<HTMLSelectElement>, "aria-label">) {
  const id = useId();
  return (
    <span className={[s.selectWrap, className].filter(Boolean).join(" ")}>
      {inlineLabel && <label htmlFor={id}>{inlineLabel}</label>}
      <select id={id} aria-label={inlineLabel ? undefined : label} className={s.select} {...rest}>
        {children}
      </select>
    </span>
  );
}

type FieldProps = { label: string; help?: ReactNode; error?: string | null; hideLabel?: boolean; className?: string };

export function TextField({ label, help, error, hideLabel, className, ...rest }: FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div className={[s.field, className].filter(Boolean).join(" ")}>
      <label htmlFor={id} className={hideLabel ? "sr-only" : s.label}>
        {label}
      </label>
      <input id={id} className={s.input} aria-invalid={error ? true : undefined} aria-describedby={error || help ? `${id}-d` : undefined} {...rest} />
      {error ? (
        <span id={`${id}-d`} className={s.error}>
          {error}
        </span>
      ) : help ? (
        <span id={`${id}-d`} className={s.help}>
          {help}
        </span>
      ) : null}
    </div>
  );
}

export function TextArea({ label, help, error, hideLabel, className, ...rest }: FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <div className={[s.field, className].filter(Boolean).join(" ")}>
      <label htmlFor={id} className={hideLabel ? "sr-only" : s.label}>
        {label}
      </label>
      <textarea id={id} className={s.textarea} aria-invalid={error ? true : undefined} aria-describedby={error || help ? `${id}-d` : undefined} {...rest} />
      {error ? (
        <span id={`${id}-d`} className={s.error}>
          {error}
        </span>
      ) : help ? (
        <span id={`${id}-d`} className={s.help}>
          {help}
        </span>
      ) : null}
    </div>
  );
}

export function SelectField({ label, help, error, className, children, ...rest }: FieldProps & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <div className={[s.field, className].filter(Boolean).join(" ")}>
      <label htmlFor={id} className={s.label}>
        {label}
      </label>
      <select id={id} className={`${s.input} ${s.select}`} aria-invalid={error ? true : undefined} {...rest}>
        {children}
      </select>
      {error ? <span className={s.error}>{error}</span> : help ? <span className={s.help}>{help}</span> : null}
    </div>
  );
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} className={s.switch} onClick={() => onChange(!checked)} />;
}

export function Checkbox({ label, ...rest }: { label: ReactNode } & Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  return (
    <label className={s.check}>
      <input type="checkbox" {...rest} />
      {label}
    </label>
  );
}
