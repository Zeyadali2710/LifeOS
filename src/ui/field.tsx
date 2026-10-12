import { cloneElement, useId } from "react";
import type { InputHTMLAttributes, ReactElement, ReactNode, Ref, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { Icon } from "./icon";

const base =
  "w-full border border-white/[.10] bg-white/[.03] text-[14px] text-text placeholder:text-text-3 outline-none transition focus:border-[rgba(100,210,255,.55)] focus:shadow-[var(--ring-input)] disabled:cursor-not-allowed disabled:bg-white/[.06] disabled:text-text-3 aria-invalid:border-[rgba(255,105,97,.6)]";

export function Input({ ref, className = "", ...p }: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return <input ref={ref} className={`${base} h-9 rounded-full px-3 [@media(pointer:coarse)]:h-11 ${className}`} {...p} />;
}

export function Textarea({ ref, className = "", rows = 7, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement> & { ref?: Ref<HTMLTextAreaElement> }) {
  return <textarea ref={ref} rows={rows} className={`${base} resize-y rounded-14 px-3.5 py-2.5 leading-normal ${className}`} {...p} />;
}

export function Select({ ref, className = "", children, ...p }: SelectHTMLAttributes<HTMLSelectElement> & { ref?: Ref<HTMLSelectElement> }) {
  return (
    <span className="relative block">
      <select ref={ref} className={`${base} h-9 appearance-none rounded-full pr-9 pl-3 [@media(pointer:coarse)]:h-11 ${className}`} {...p}>
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

const ctl =
  "peer m-0 size-4 shrink-0 appearance-none border-[1.5px] border-[rgba(255,255,255,.25)] bg-transparent [color-scheme:dark] checked:border-accent-solid checked:bg-accent-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan disabled:cursor-not-allowed disabled:opacity-50";

export function Checkbox({
  ref,
  label,
  hitArea,
  className = "",
  ...p
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { ref?: Ref<HTMLInputElement>; label?: ReactNode; hitArea?: boolean }) {
  return (
    <label className={`inline-flex items-center gap-2 text-[13.5px] text-text-2 ${hitArea ? "min-h-11 min-w-11 tab:min-h-0 tab:min-w-0" : ""} ${className}`}>
      <span className="relative inline-grid size-4 place-items-center">
        <input ref={ref} type="checkbox" className={`${ctl} rounded-5`} {...p} />
        <span className="pointer-events-none absolute inset-0 hidden place-items-center text-[#fff] peer-checked:grid">
          <Icon name="check" size={13} />
        </span>
      </span>
      {label}
    </label>
  );
}

export function RadioGroup({
  name,
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  name: string;
  label: string;
  value: string;
  options: { value: string; label: string; hint?: string }[];
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-col gap-2">
      {options.map((o) => (
        <label key={o.value} className="flex items-start gap-2 text-[13.5px] text-text-2">
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={value === o.value}
            disabled={disabled}
            onChange={() => onChange(o.value)}
            className={`${ctl} mt-0.5 rounded-full checked:shadow-[inset_0_0_0_3px_#232326]`}
          />
          <span>
            {o.label}
            {o.hint && <span className="block text-[12.5px] text-text-3">{o.hint}</span>}
          </span>
        </label>
      ))}
    </div>
  );
}
