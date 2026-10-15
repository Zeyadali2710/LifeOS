import type { SocialMetrics, SocialPlatform } from "@/lib/social-types";
import { metricValue, stamp, type Variant } from "./model";
import { PlatformChip } from "./platform-chip";
import type { SocialsData } from "./socials-view";
import { Badge } from "@/ui/badge";

const METRICS: (keyof SocialMetrics)[] = ["views", "reach", "impressions", "likes", "comments", "shares", "saves"];
export function PostsTable({ variants, posts, onOpen }: { variants: Variant[]; posts: SocialsData["board"]; onOpen(id: string): void }) {
  const metrics = METRICS.filter((key) => variants.some((v) => metricValue(v.metrics, key) !== null));
  return <div className="overflow-x-auto rounded-24 border border-white/[.06]">{!variants.length ? <p className="p-5 text-[13.5px] text-text-3">No published posts in this range.</p> : <table aria-label="Published posts" className="w-full text-left text-[12.5px]"><caption className="sr-only">Published posts and metrics returned by each platform. Mock posts are labelled and excluded from totals.</caption><thead><tr>{["Platform", "Post", "Published", ...metrics].map((h) => <th key={h} scope="col" className="whitespace-nowrap p-3 font-medium text-text-3 capitalize">{h}</th>)}</tr></thead><tbody>{variants.map((v) => <tr key={v.id} className="border-t border-white/[.06]"><td className="p-3"><PlatformChip platform={v.platform as SocialPlatform} />{v.isMock && <Badge kind="tag" tone="amber">MOCK</Badge>}</td><td className="min-w-[160px] p-3"><button type="button" className="text-left text-cyan" aria-label={`Open post ${posts.find((p) => p.id === v.postId)?.title ?? "Post"}`} onClick={() => onOpen(v.postId)}>{posts.find((p) => p.id === v.postId)?.title ?? "Post"}</button></td><td className="whitespace-nowrap p-3">{v.publishedAt ? stamp(v.publishedAt) : "—"}</td>{metrics.map((key) => { const value = metricValue(v.metrics, key); return <td key={key} className="p-3">{value === null ? <>—<span className="sr-only">not provided</span></> : value.toLocaleString("en-AU")}</td>; })}</tr>)}</tbody></table>}</div>;
}
