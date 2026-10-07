import type { CSSProperties } from "react";
import type { IconName } from "./icon-names";

export function Icon({
  name,
  size = 18,
  fill = false,
  className = "",
  style,
}: {
  name: IconName;
  size?: number;
  fill?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span aria-hidden="true" className={`msym ${fill ? "msym-fill" : ""} ${className}`} style={{ fontSize: size, ...style }}>
      {name}
    </span>
  );
}
