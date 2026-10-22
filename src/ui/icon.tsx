import type { CSSProperties } from "react";
import type { IconName } from "./icon-names";

/** Material Symbols Outlined. Decorative by default; the glyph name is CSS content so it never becomes accessible text. */
export function Icon({
  name,
  size = 20,
  fill = false,
  className,
  style,
  label,
}: {
  name: IconName;
  size?: number;
  fill?: boolean;
  className?: string;
  style?: CSSProperties;
  label?: string;
}) {
  return (
    <span
      className={className ? `ms ${className}` : "ms"}
      data-icon={name}
      data-fill={fill ? "1" : undefined}
      style={{ fontSize: size, ...style }}
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
    />
  );
}
