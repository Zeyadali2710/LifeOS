import { cloneElement, useId } from "react";
import type { InputHTMLAttributes, ReactElement, Ref, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { Icon } from "./icon";

const base =
  "w-full rounded-9 border border-border-strong bg-inset text-[14px] text-text placeholder:text-text-3 outline-none transition focus:border-[rgba(139,140,255,.45)] focus:shadow-[var(--ring-input)] disabled:cursor-not-allowed disabled:bg-fill-1 disabled:text-text-4 aria-[invalid=true]:border-[rgba(240,122,110,.5)]";

export function Input({ ref, className = "", ...p }: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return <input ref={ref} className={`${base} h-9 px-3 ${className}`} {...p} />;
}

export function Textarea({ ref, className = "", rows = 7, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement> & { ref?: Ref<HTMLTextAreaElement> }) {
  return <textarea ref={ref} rows={rows} className={`${base} resize-y px-3.5 py-2.5 leading-normal ${className}`} {...p} />;
}

export function Select({ ref, className = "", children, ...p }: SelectHTMLAttributes<HTMLSelectElement> & { ref?: Ref<HTMLSelectElement> }) {
  return (
    <span className="relative block">
      <select ref={ref} className={`${base} h-9 appearance-none pr-9 pl-3 ${className}`} {...p}>
        {children}
      </select>
      <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-text-3">
        <Icon name="expand_more" size={18} />
      </span>
    </span>
  );
}

type Control = { id?: string; "aria-describedby"?: string; "aria-invalid"?: boolean };

export function Field({ label, error, helper, children }: { label: string; error?: string; helper?: string; children: ReactElement<Control> }) {
  const uid = useId();
  const id = children.props.id ?? `${uid}-c`;
  const hid = `${uid}-h`;
  const eid = `${uid}-e`;
  const describedBy = [error && eid, helper && hid].filter(Boolean).join(" ") || undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[12.5px] text-text-2">
        {label}
      </label>
      {cloneElement(children, { id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })}
      {helper && (
        <p id={hid} className="text-[12.5px] text-text-3">
          {helper}
        </p>
      )}
      {error && (
        <p id={eid} className="text-[12.5px] text-red">
          {error}
        </p>
      )}
    </div>
  );
}
