import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Icon } from "./icon";
import type { IconName } from "./icon-names";
import s from "./button.module.css";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost" | "text";

type Common = {
  variant?: ButtonVariant;
  size?: "md" | "sm" | "lg";
  icon?: IconName;
  iconRight?: IconName;
  /** Shortcut hint shown after the label (decorative; pass aria-keyshortcuts for the accessible form). */
  hint?: string;
  raised?: boolean;
  destructive?: boolean;
  block?: boolean;
  className?: string;
  children?: ReactNode;
};

export function buttonClass({
  variant = "secondary",
  size = "md",
  raised,
  destructive,
  block,
  className,
}: Pick<Common, "variant" | "size" | "raised" | "destructive" | "block" | "className">): string {
  return [s.btn, s[variant], size !== "md" && s[size], raised && s.raised, destructive && s.destructive, block && s.block, className]
    .filter(Boolean)
    .join(" ");
}

function Inner({ icon, iconRight, hint, children, size }: Pick<Common, "icon" | "iconRight" | "hint" | "children" | "size">) {
  const px = size === "sm" ? 16 : 17;
  return (
    <>
      {icon && <Icon name={icon} size={px} />}
      {children}
      {hint && <span className={`${s.hint} kbd-hint`} data-hint={hint} aria-hidden="true" />}
      {iconRight && <Icon name={iconRight} size={px} />}
    </>
  );
}

export function Button({
  variant,
  size,
  icon,
  iconRight,
  hint,
  raised,
  destructive,
  block,
  className,
  children,
  type = "button",
  ...rest
}: Common & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type={type} className={buttonClass({ variant, size, raised, destructive, block, className })} {...rest}>
      <Inner icon={icon} iconRight={iconRight} hint={hint} size={size}>
        {children}
      </Inner>
    </button>
  );
}

export function ButtonLink({
  href,
  variant,
  size,
  icon,
  iconRight,
  hint,
  raised,
  block,
  className,
  children,
  external,
  ...rest
}: Common & { href: string; external?: boolean; "aria-label"?: string; title?: string; "aria-current"?: "page" | undefined }) {
  const cls = buttonClass({ variant, size, raised, block, className });
  const inner = (
    <Inner icon={icon} iconRight={iconRight} hint={hint} size={size}>
      {children}
    </Inner>
  );
  if (external)
    return (
      <a href={href} className={cls} target="_blank" rel="noopener noreferrer" {...rest}>
        {inner}
      </a>
    );
  return (
    <Link href={href} className={cls} {...rest}>
      {inner}
    </Link>
  );
}

export function IconButton({
  icon,
  label,
  size = 20,
  small,
  fill,
  className,
  type = "button",
  ...rest
}: { icon: IconName; label: string; size?: number; small?: boolean; fill?: boolean } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label">) {
  return (
    <button type={type} aria-label={label} title={rest.title ?? label} className={[s.icon, small && s.small, className].filter(Boolean).join(" ")} {...rest}>
      <Icon name={icon} size={size} fill={fill} />
    </button>
  );
}
