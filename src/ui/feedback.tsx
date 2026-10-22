import type { CSSProperties, ReactNode } from "react";
import { Button, ButtonLink } from "./button";
import { Icon } from "./icon";
import type { IconName } from "./icon-names";
import { PixelAvatar } from "./pixel-avatar";
import s from "./feedback.module.css";

export function Alert({
  children,
  tone = "error",
  icon,
  action,
  role,
  className,
}: {
  children: ReactNode;
  tone?: "error" | "warn" | "info";
  icon?: IconName;
  action?: ReactNode;
  role?: "alert" | "status" | "note";
  className?: string;
}) {
  return (
    <div role={role ?? (tone === "error" ? "alert" : "status")} className={[s.alert, tone !== "error" && s[tone], className].filter(Boolean).join(" ")}>
      <Icon name={icon ?? (tone === "error" ? "error" : tone === "warn" ? "warning" : "info")} size={18} />
      <div className={s.alertBody}>
        {children}
        {action && <span className={s.alertAction}>{action}</span>}
      </div>
    </div>
  );
}

export function EmptyState({ icon = "inbox", title, body, action }: { icon?: IconName; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className={s.empty}>
      <Icon name={icon} size={34} />
      <p className={s.emptyTitle}>{title}</p>
      {body && <p className={s.emptyBody}>{body}</p>}
      {action}
    </div>
  );
}

export function Skeleton({ h = 16, w = "100%", style }: { h?: number; w?: number | string; style?: CSSProperties }) {
  return <div className={s.skel} style={{ height: h, width: w, ...style }} aria-hidden="true" />;
}

const DEFAULT_SKEL: [number, string][] = [
  [34, "40%"],
  [16, "70%"],
  [64, "100%"],
  [64, "100%"],
  [64, "100%"],
  [64, "86%"],
];

/** Route skeleton: working avatar + "LOADING <TITLE>…" + bars shaped like the page. */
export function PageLoading({ title, agent = "orchestrator", bars = DEFAULT_SKEL }: { title: string; agent?: string; bars?: [number, string][] }) {
  return (
    <div role="status" aria-label={`Loading ${title}`} className={s.loading}>
      <div className={s.loadingHead}>
        <PixelAvatar agent={agent} state="working" size={42} bg="#ebe4d6" radius={6} />
        <span>LOADING {title.toUpperCase()}…</span>
      </div>
      {bars.map(([h, w], i) => (
        <Skeleton key={i} h={h} w={w} />
      ))}
    </div>
  );
}

export type PageStateKind = "empty" | "error" | "disconnected";

const LABEL: Record<PageStateKind, string> = { empty: "– EMPTY", error: "× ERROR", disconnected: "○ NOT CONNECTED" };

/** Empty / error / disconnected block: agent portrait, mono label, Newsreader line, one sentence, one action. */
export function PageState({
  kind,
  title,
  body,
  agent = "orchestrator",
  action,
  inline,
}: {
  kind: PageStateKind;
  title: string;
  body: ReactNode;
  agent?: string;
  action?: { label: string; href?: string; onClick?: () => void };
  inline?: boolean;
}) {
  const pose = kind === "error" ? "failed" : kind === "disconnected" ? "offline" : "idle";
  return (
    <div role={kind === "error" ? "alert" : "status"} className={[s.state, inline && s.inline].filter(Boolean).join(" ")}>
      <PixelAvatar agent={agent} state={pose} size={70} bg="#ebe4d6" radius={8} />
      <div className={s.stateBody}>
        <div className={[s.stateLabel, kind === "error" && s.failed].filter(Boolean).join(" ")}>{LABEL[kind]}</div>
        <p className={s.stateTitle}>{title}</p>
        <p className={s.stateText}>{body}</p>
        {action && (
          <div className={s.stateActions}>
            {action.href ? (
              <ButtonLink href={action.href} variant="primary" size="lg">
                {action.label}
              </ButtonLink>
            ) : (
              <Button variant="primary" size="lg" onClick={action.onClick}>
                {action.label}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
