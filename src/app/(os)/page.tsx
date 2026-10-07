import { checkHealth, type Health } from "@/server/health";
import { requireOwner } from "@/server/session";

const TZ = "Australia/Sydney";

function greeting(now: Date): string {
  const hour = Number(new Intl.DateTimeFormat("en-AU", { hour: "numeric", hourCycle: "h23", timeZone: TZ }).format(now));
  return hour < 5 ? "Good night" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

const tone: Record<string, string> = { ok: "bg-ok", stale: "bg-attention", degraded: "bg-attention", down: "bg-danger", unknown: "bg-fg-faint" };

function Status({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-6 py-2.5 text-sm">
      <span className="text-fg-muted">{label}</span>
      <span className="flex items-center gap-2 font-mono text-xs uppercase tracking-wider">
        <span aria-hidden className={`size-1.5 rounded-full ${tone[value] ?? "bg-fg-faint"}`} />
        {value}
      </span>
    </div>
  );
}

export default async function HomePage() {
  const { user } = await requireOwner();
  const now = new Date();
  const health: Health = await checkHealth(now.getTime());
  const firstName = user.name.split(" ")[0];

  return (
    <div className="mx-auto grid max-w-5xl gap-12 lg:grid-cols-[1fr_16rem]">
      <section>
        <p className="font-mono text-xs uppercase tracking-widest text-fg-faint">
          {new Intl.DateTimeFormat("en-AU", { weekday: "long", day: "numeric", month: "long", timeZone: TZ }).format(now)}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          {greeting(now)}, {firstName}.
        </h1>
        <p className="mt-3 max-w-prose text-fg-muted">
          The foundation is online. Priorities, calendar, activity and your agents will appear here as each domain is connected.
        </p>
      </section>

      <aside aria-labelledby="system-status" className="lg:border-l lg:border-line lg:pl-8">
        <h2 id="system-status" className="font-mono text-xs uppercase tracking-widest text-fg-faint">
          System
        </h2>
        <div className="mt-2 divide-y divide-line">
          <Status label="Overall" value={health.status} />
          <Status label="Database" value={health.db} />
          <Status label="Worker" value={health.worker} />
        </div>
        <p className="mt-3 font-mono text-[11px] text-fg-faint">build {health.version}</p>
      </aside>
    </div>
  );
}
