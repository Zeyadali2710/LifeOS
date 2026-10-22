import type { SocialMetrics, SocialPlatform } from "@/lib/social-types";
import { Tag } from "@/ui/display";
import { metricValue, stamp, type Variant } from "./model";
import { PLATFORM } from "./platform";
import type { SocialsData } from "./socials-view";
import s from "./socials.module.css";

const METRICS: (keyof SocialMetrics)[] = ["views", "reach", "impressions", "likes", "comments", "shares", "saves"];
export function PostsTable({ variants, posts, onOpen }: { variants: Variant[]; posts: SocialsData["board"]; onOpen(id: string): void }) {
  const metrics = METRICS.filter((key) => variants.some((v) => metricValue(v.metrics, key) !== null));
  if (!variants.length) return <p className={s.emptyRow}>No published posts in this range.</p>;
  return <div className={s.tableWrap}><table className={s.table} aria-label="Published posts"><caption className="sr-only">Metrics returned by each platform. Mock posts are labelled and excluded from totals.</caption><thead><tr>{["Platform", "Post", "Published", ...metrics].map((heading) => <th key={heading} scope="col">{heading}</th>)}</tr></thead><tbody>{variants.map((v) => <tr key={v.id}><td>{PLATFORM[v.platform as SocialPlatform].label} {v.isMock && <Tag>MOCK</Tag>}</td><td><button type="button" onClick={() => onOpen(v.postId)}>{posts.find((p) => p.id === v.postId)?.title ?? "Post"}</button></td><td>{v.publishedAt ? stamp(v.publishedAt) : "—"}</td>{metrics.map((key) => { const value = metricValue(v.metrics, key); return <td key={key}>{value === null ? <>—<span className="sr-only">not provided</span></> : value.toLocaleString("en-AU")}</td>; })}</tr>)}</tbody></table></div>;
}
