"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { Button, IconButton } from "./button";
import s from "./overlay.module.css";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

/** Keeps Tab inside an open modal: a native modal <dialog> otherwise lets focus leave to the browser chrome. */
export function trapTab(e: globalThis.KeyboardEvent, root: HTMLElement) {
  if (e.key !== "Tab") return;
  const els = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
  const first = els[0], last = els.at(-1);
  if (!first || !last) return;
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

/** Opens/closes a native <dialog> as modal and reports Esc/backdrop closes back through onClose. */
function useModal(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const cancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    const tab = (e: globalThis.KeyboardEvent) => trapTab(e, d);
    d.addEventListener("cancel", cancel);
    d.addEventListener("keydown", tab);
    return () => {
      d.removeEventListener("cancel", cancel);
      d.removeEventListener("keydown", tab);
    };
  }, [onClose]);
  const onBackdrop = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === e.currentTarget) onClose();
  };
  return { ref, onBackdrop };
}

export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children?: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const id = useId();
  const { ref, onBackdrop } = useModal(open, onClose);
  return (
    <dialog ref={ref} aria-labelledby={id} className={[s.dialog, wide && s.wide].filter(Boolean).join(" ")} onClick={onBackdrop}>
      {open && (
        <>
          <h2 id={id} className={s.dialogTitle}>
            {title}
          </h2>
          {children}
          {footer && <div className={s.dialogFoot}>{footer}</div>}
        </>
      )}
    </dialog>
  );
}

export function DialogText({ children }: { children: ReactNode }) {
  return <p className={s.dialogText}>{children}</p>;
}

/** Confirm dialog: Cancel + one filled action (danger for destructive). */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel,
  danger,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button size="lg" onClick={onClose}>
            Cancel
          </Button>
          <Button size="lg" variant={danger ? "danger" : "primary"} onClick={onConfirm} disabled={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <DialogText>{body}</DialogText>
    </Dialog>
  );
}

/** Right sheet, 440 px (full width on mobile). Esc closes, focus is trapped by the native modal dialog. */
export function Drawer({
  open,
  onClose,
  label,
  head,
  actions,
  children,
  dim,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  head: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  dim?: boolean;
}) {
  const { ref, onBackdrop } = useModal(open, onClose);
  return (
    <dialog ref={ref} aria-label={label} className={[s.drawer, dim && s.dim].filter(Boolean).join(" ")} onClick={onBackdrop}>
      {open && (
        <>
          <div className={s.drawerHead}>
            <div className={s.drawerTitle}>{head}</div>
            <div className={s.drawerActions}>
              {actions}
              <IconButton icon="close" label="Close" small onClick={onClose} />
            </div>
          </div>
          {children}
        </>
      )}
    </dialog>
  );
}

export type MenuItem =
  | { label: ReactNode; hint?: string; onSelect: () => void; danger?: boolean; current?: boolean }
  | { label: ReactNode; hint?: string; href: string; current?: boolean }
  | "separator";

/** Menu button + popover menu. Arrow keys move, Esc closes and returns focus to the trigger. */
export function Menu({
  trigger,
  items,
  label,
  align = "left",
  className,
}: {
  trigger: (props: { "aria-expanded": boolean; "aria-haspopup": "menu"; "aria-controls": string | undefined; onClick: () => void; ref: React.Ref<HTMLButtonElement> }) => ReactNode;
  items: MenuItem[];
  label: string;
  align?: "left" | "right";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const btn = useRef<HTMLButtonElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const close = useCallback((focus = true) => {
    setOpen(false);
    if (focus) btn.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const first = wrap.current?.querySelector<HTMLElement>("[role=menuitem]");
    first?.focus();
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, close]);

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const els = [...(wrap.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
    const i = els.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const n = e.key === "ArrowDown" ? (i + 1) % els.length : (i - 1 + els.length) % els.length;
      els[n]?.focus();
    } else if (e.key === "Tab") close(false);
  };

  return (
    <div ref={wrap} className={[s.menuWrap, className].filter(Boolean).join(" ")}>
      {trigger({ "aria-expanded": open, "aria-haspopup": "menu", "aria-controls": open ? id : undefined, onClick: () => setOpen((o) => !o), ref: btn })}
      {open && (
        <div id={id} role="menu" aria-label={label} className={[s.menu, align === "right" && s.right].filter(Boolean).join(" ")} onKeyDown={onKey}>
          {items.map((it, i) =>
            it === "separator" ? (
              <div key={i} role="separator" className={s.menuSep} />
            ) : "href" in it ? (
              <Link key={i} role="menuitem" href={it.href} className={s.menuItem} aria-current={it.current ? "page" : undefined} onClick={() => close(false)}>
                <span>{it.label}</span>
                {it.hint && <span className={s.menuHint}>{it.hint}</span>}
              </Link>
            ) : (
              <button
                key={i}
                type="button"
                role="menuitem"
                className={[s.menuItem, it.danger && s.danger].filter(Boolean).join(" ")}
                aria-current={it.current ? "true" : undefined}
                onClick={() => {
                  close(false);
                  it.onSelect();
                }}
              >
                <span>{it.label}</span>
                {it.hint && <span className={s.menuHint}>{it.hint}</span>}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

/** Polite live region that also positions the toast, so the region itself is what is visible. */
export function ToastRegion({ children }: { children: React.ReactNode }) {
  return <div role="status" aria-live="polite" className={s.toastRegion}>{children}</div>;
}

export function ToastView({ message, tone, action }: { message: string; tone: "success" | "error"; action?: { label: string; onClick: () => void } }) {
  return (
    <div className={[s.toast, tone === "error" && s.error].filter(Boolean).join(" ")}>
      {message}
      {action && (
        <button type="button" className={s.toastAction} onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}
