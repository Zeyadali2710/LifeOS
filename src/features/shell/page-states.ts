// Route state copy (design/handoff/design/lifeos-app.js → APP.states). [title, body]
type Copy = { empty?: [string, string]; error: [string, string]; disconnected?: [string, string] };

export const PAGE_STATES: Record<string, Copy> = {
  home: { empty: ["Nothing needs you today", "No priorities, approvals or events. Briefings will start filling this in after your first sync."], error: ["Home couldn't load the digest", "Each source fails soft; this happens only when the database is unreachable."], disconnected: ["Connect a calendar and mail to fill Home", "Priorities and Today are built from your calendar, tasks and mail."] },
  agents: { empty: ["No agents are enabled", "Enable agents in Settings → AI and spend."], error: ["Agent status is unavailable", "Live status stopped responding. Runs continue; this view will reconnect."], disconnected: ["Add an Anthropic key to start agents", "Agents need a model provider. The Automations agent works without one."] },
  approvals: { empty: ["Nothing is waiting on you", "When an agent proposes something that writes to the outside world, it appears here."], error: ["Approvals couldn't load", "Nothing has been sent. Try again."] },
  projects: { empty: ["No projects yet", "A project groups tasks, milestones and repositories toward one outcome. Create your first one to start tracking progress."], error: ["Projects couldn't load", "Try again."], disconnected: ["Connect GitHub to link repositories", "Projects work without it."] },
  organization: { empty: ["A clear week", "No events or tasks. Add a task or connect a calendar."], error: ["Calendar sync failed", "Showing events from the last good sync."], disconnected: ["Connect a calendar", "Connect Google Calendar or iCloud to see your events here and let LifeOS plan around them. Tasks work without a calendar."] },
  outreach: { empty: ["Inbox zero", "No new mail and no saved events."], error: ["Mail sync failed", "LifeOS retries automatically."], disconnected: ["Connect mail to use Outreach", "Connect Gmail to triage mail and draft replies. Events work without it."] },
  socials: { empty: ["No posts yet", "Write an idea or let the Social agent draft from a project."], error: ["Socials couldn't load", "Try again."], disconnected: ["Connect a platform to publish", "You can still draft and mark posts as posted manually."] },
  career: { empty: ["No repositories synced yet", "Your first sync may still be running. Use Sync now, or check that your token can see the repositories you expect."], error: ["GitHub sync failed", "Check the token in Settings → Connections."], disconnected: ["Connect GitHub", "Connect GitHub to see your repositories, pull requests and CI here. LifeOS only reads; it never changes anything on GitHub."] },
  finances: { empty: ["Import your first CSV", "Export a UTF-8 CSV from your bank. Nothing leaves LifeOS unless you ask Finance."], error: ["Finances couldn't load", "Try again."] },
  knowledge: { empty: ["Nothing saved yet", "Add a note, upload a .md file or save a bookmark."], error: ["Search failed", "Keyword search is local; try again."], disconnected: ["Semantic search is off", "Turn it on to send titles and text to OpenRouter embeddings. Keyword search stays local."] },
  goals: { empty: ["Write one sentence of vision", "Then add a goal and link a project to measure progress."], error: ["Goals couldn't load", "Try again."] },
  briefings: { empty: ["No briefings yet", "The first morning briefing builds at 7:00, or build one now."], error: ["The last briefing failed", "It retries on the next tick."], disconnected: ["Briefings need at least one source", "Connect a calendar or mail."] },
  automations: { empty: ["No automations", "Turn a signal into a task, notification or a question for LifeOS."], error: ["The automation engine is paused", "The Automations agent is paused, so no rules run."] },
  settings: { error: ["Couldn't save", "Try again."] },
};

/** Which agent's portrait stands in for each route's states. */
export const STATE_AGENT: Record<string, string> = {
  home: "orchestrator", agents: "orchestrator", approvals: "orchestrator", projects: "projects", organization: "organization", outreach: "outreach", socials: "social",
  career: "projects", finances: "finance", knowledge: "knowledge", goals: "goals", briefings: "automations", automations: "automations", settings: "orchestrator",
};

export const ROUTE_TITLE: Record<string, string> = {
  home: "Home", agents: "Agents", approvals: "Approvals", projects: "Projects", organization: "Organization", outreach: "Outreach", socials: "Socials",
  career: "Career", finances: "Finances", knowledge: "Knowledge", goals: "Goals", briefings: "Briefings", automations: "Automations", settings: "Settings",
};
