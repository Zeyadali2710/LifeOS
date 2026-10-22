import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { contributionDays, relativeTime, repoPath, weeklyCommits } from "@/features/career/model";
import { GithubLink, Readme } from "@/features/career/components";
import { loadCareerView, loadRepoView } from "@/server/career-view";
import type { DB } from "@/server/db/client";
import { readToken } from "@/server/github/connections";

vi.mock("@/server/github/connections", () => ({ readToken: vi.fn() }));

const now = "2026-10-22T09:00:00Z";
const contribution = (repoId: number, at: string) => ({ repoId, at });
const json = (data: unknown, headers?: HeadersInit) => new Response(JSON.stringify(data), { headers });
// DB fixture supports read queries only; GitHub is independently mocked below.
function emptyDb(results: unknown[][] = []) {
  let index = 0;
  return { select: () => {
    const rows = Promise.resolve(results[index++] ?? []);
    const chain = Object.assign(rows, { from: () => chain, where: () => chain, orderBy: () => chain, limit: () => chain });
    return chain;
  } } as unknown as DB;
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("Career view", () => {
  it("buckets commits by Sydney day and repo, preserving future empty cells", () => {
    const items = [contribution(1, "2026-10-21T14:00:00Z"), contribution(2, now), contribution(1, "2026-10-21T12:00:00Z")];
    const days = contributionDays(items, now, 1);
    expect(days).toHaveLength(371);
    expect(days.find((d) => d.date === "2026-10-22")).toMatchObject({ count: 1, future: false });
    expect(days.find((d) => d.date === "2026-10-21")?.count).toBe(1);
    expect(days.at(-1)).toMatchObject({ date: "2026-10-24", count: 0, future: true });
    expect(weeklyCommits(items, now, 1)).toEqual([...Array<number>(11).fill(0), 2]);
    expect(contributionDays(items, now).reduce((n, d) => n + d.count, 0)).toBe(3);
  });

  it("keeps relative ages and route URLs usable at boundaries", () => {
    expect(relativeTime(null, now)).toBe("never");
    expect(relativeTime("bad", now)).toBe("unknown");
    expect(relativeTime("2026-10-23T09:00:00Z", now)).toBe("0m ago");
    expect(relativeTime("2026-10-22T08:00:00Z", now)).toBe("1h ago");
    expect(relativeTime("2026-10-20T09:00:00Z", now)).toBe("2d ago");
    expect(repoPath("owner/repo name")).toBe("/career/owner/repo%20name");
  });

  it("renders README HTML and unsafe links as inert text", () => {
    const html = renderToStaticMarkup(createElement(Readme, { text: '# Repo\n\n<script>alert(1)</script>\n\n```sh\nnpm install\n```\n\n### Setup\n\n[bad](javascript:alert(1))' }));
    expect(html).toContain("<h2>Repo</h2>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("<pre><code>npm install");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("href=");
    expect(renderToStaticMarkup(GithubLink({ url: "https://github.com.evil.test", children: "Unsafe" }))).toBe("<span>Unsafe</span>");
    expect(renderToStaticMarkup(GithubLink({ url: "https://github.com/o/r", children: "Safe" }))).toContain('rel="noopener noreferrer"');
  });

  it("fails soft without a token or when GitHub rejects the request", async () => {
    vi.mocked(readToken).mockResolvedValueOnce(null);
    const fetch = vi.fn().mockRejectedValue(new Error("offline"));
    vi.stubGlobal("fetch", fetch);
    const disconnected = await loadRepoView(emptyDb(), 1, "o/r");
    expect(fetch).not.toHaveBeenCalled();
    expect(disconnected).toMatchObject({ files: [], filesUnavailable: true, readme: null, weeks: [], contributors: [] });
    vi.mocked(readToken).mockResolvedValue("offline-token");
    const unavailable = await loadRepoView(emptyDb(), 1, "o/r");
    expect(unavailable.filesUnavailable).toBe(true);
    expect(fetch.mock.calls.every(([, init]) => init.method === undefined)).toBe(true);
  });

  it("summarizes stored activity without inventing missing metadata", async () => {
    vi.mocked(readToken).mockResolvedValue(null);
    const data = await loadCareerView(emptyDb([
      [{ repoId: 1, at: new Date(now) }, { repoId: null, at: new Date(now) }, { repoId: 1, at: null }],
      [{ at: new Date(now) }],
      [{ conclusion: "success" }, { conclusion: "failure" }],
    ]), new Date(now));
    expect(data).toEqual({ contributions: [{ repoId: 1, at: now.replace("Z", ".000Z") }], merged30: 1, passRate: 50, stars: {} });
    expect((await loadCareerView(emptyDb(), new Date(now))).passRate).toBeNull();
  });

  it("only fetches Insights data on that tab and treats pending GitHub statistics as unavailable", async () => {
    vi.mocked(readToken).mockResolvedValue("insights-token");
    const fetch = vi.fn(async (input: string) => input.endsWith("/repos/o/r")
      ? json({ full_name: "o/r", stargazers_count: 1 })
      : new Response("{}", { status: 202 }));
    vi.stubGlobal("fetch", fetch);
    const data = await loadRepoView(emptyDb(), 1, "o/r", undefined, "insights");
    expect(data).toMatchObject({ weeks: [], frequency: [], contributors: [], readme: null });
    expect(fetch.mock.calls.map(([url]) => new URL(url).pathname)).toEqual([
      "/repos/o/r", "/repos/o/r/stats/commit_activity", "/repos/o/r/stats/code_frequency", "/repos/o/r/contributors",
    ]);
  });

  it("encodes branch and paths, decodes README, and revalidates cached bodies with ETags", async () => {
    vi.mocked(readToken).mockResolvedValue("etag-test-token");
    const clock = vi.spyOn(Date, "now").mockReturnValue(Date.parse(now));
    const seen: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string, init: RequestInit) => {
      seen.push({ url: input, init });
      if ((init.headers as Record<string, string>)["If-None-Match"]) return new Response(null, { status: 304 });
      const url = new URL(input);
      const data = url.pathname.endsWith("/contents") ? [{ name: "a b.ts", path: "a b.ts", type: "file", html_url: "https://github.com/o/r/blob/main/a%20b.ts" }]
        : url.pathname.endsWith("/readme") ? { content: Buffer.from("# README").toString("base64"), encoding: "base64" }
        : url.pathname.endsWith("/branches") ? [{ name: "feat/a&b" }]
        : url.pathname.endsWith("/commits") ? [{ commit: { message: "Change file\nbody", committer: { date: now } } }]
        : url.pathname.endsWith("/runs") ? { workflow_runs: [] }
        : url.pathname === "/repos/o/r" ? { full_name: "o/r", stargazers_count: 3, topics: ["example"] } : [];
      return json(data, { etag: '"view-etag"' });
    }));
    const first = await loadRepoView(emptyDb(), 1, "o/r", "feat/a&b");
    expect(first.readme).toBe("# README");
    expect(first.files[0]).toMatchObject({ message: "Change file", at: now });
    expect(seen.find((r) => r.url.includes("/contents"))?.url).toContain("ref=feat%2Fa%26b");
    expect(seen.find((r) => r.url.includes("/commits?"))?.url).toContain("path=a%20b.ts&sha=feat%2Fa%26b");
    const count = seen.length;
    expect(await loadRepoView(emptyDb(), 1, "o/r", "feat/a&b")).toEqual(first);
    expect(seen).toHaveLength(count);
    clock.mockReturnValue(Date.parse(now) + 61_000);
    expect(await loadRepoView(emptyDb(), 1, "o/r", "feat/a&b")).toEqual(first);
    expect(seen.slice(count).every((r) => (r.init.headers as Record<string, string>)["If-None-Match"] === '"view-etag"')).toBe(true);
    expect(seen.every((r) => r.init.method === undefined && r.init.signal instanceof AbortSignal)).toBe(true);
    vi.mocked(readToken).mockResolvedValue("different-owner-token");
    const previous = seen.length;
    await loadRepoView(emptyDb(), 1, "o/r", "feat/a&b");
    expect(seen.slice(previous).every((r) => !(r.init.headers as Record<string, string>)["If-None-Match"])).toBe(true);
  });
});
