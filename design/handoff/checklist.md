# Page × state × flow checklist

Every route needs these states: **L**oading, **E**mpty, **X** error, **D**isconnected (where a connection applies). Preview any state with `LifeOS.dc.html?route=<route>&state=<state>`.

## Shell
- [ ] New shell built from scratch; old `src/shell/*` deleted in the same PR
- [ ] Masthead: 8 routes (Home, Agents, Projects, Organization, Outreach, Socials, Finances, Career) + More (Knowledge, Goals, Briefings, Automations, Settings); active route underline in accent; Agents carries the pending-approvals badge
- [ ] No Approvals route: `/approvals` redirects to `/agents?view=approvals`; every "open in Approvals" link lands there with the item selected
- [ ] Tablet: Home, Agents, Projects, Outreach, Socials + More holding the rest
- [ ] Mobile: tab bar Home / Agents (count) / Outreach / Socials / More sheet; 44 px targets
- [ ] Content container max 1680 px on every page; ratio-based columns; nothing wraps inside buttons, pills, tabs or badges
- [ ] ⌘K palette: scopes All, Projects, Tasks, Events, Emails, People, Notes, GitHub, Agents; ↑↓ ↵, Tab cycles scope; "Ask LifeOS: …" row when there is a query
- [ ] ⌘J Ask LifeOS drawer: run trace (route, tools, duration), answer with entity list, follow-up chips, "proposes, then waits in Approvals" note
- [ ] Notifications drawer: Now / Today / Earlier; categories URGENT, IMPORTANT, APPROVAL, AGENT, REMINDER, FYI; mark read/unread, snooze, dismiss, mark all read
- [ ] Toasts: role=status, 2.6 s, bottom centre (above the tab bar on mobile)
- [ ] Alt+1…8 route shortcuts, ⌘, settings, Esc closes overlays

## Home
- [ ] Date line + briefing link; one-sentence headline from the digest; counts line
- [ ] What matters (ranked, reason, source, action)
- [ ] Today agenda with now line; deadlines in accent
- [ ] Needs you inbox: approvals + failed runs; expand in place; ↑↓ ↵ A R
- [ ] Office roll call (9 agents, glyph) + activity
- [ ] Across LifeOS cards: **Finances** (spent, net, over-budget category, uncategorised), **Projects** (active with health + progress + next), **Outreach** (important unread, tonight's event, follow-ups)
- [ ] States L E X D

## Agents
- [ ] View switcher: Office · Approvals (count) · Table · Runs; `?view=` in the URL
- [ ] Status line: "n need you" links to the Approvals tab; n is the same count as the nav and tab badges
- [ ] Office view: full-bleed scene, camera zoom on enter (320 ms), integer scale 2×/3×, labels for selected/hover/needs-you/failed
- [ ] Table view: all 11 including not-connected; state, task, model, runs, cost, time
- [ ] Runs view: filters (Running, Waiting approval, Failed, Succeeded); row opens trace
- [ ] Inspector: Now, proposal with Approve/Edit/Reject, failure with Retry narrower, recent runs, Settings (model routing only for Projects; tools with tiers), Chat, Pause/Resume
- [ ] Run trace: route steps, tool calls with tier and outcome, escalation, limits note
- [ ] Reduced motion toggle + system preference; keyboard ← → between desks
- [ ] Pause all (confirm); spend line
- [ ] States L E X D (D = no Anthropic key)

## Agents → Approvals tab
- [ ] Embedded with no page title; inspector hidden so the inbox uses the full width
- [ ] Inspector "Review in Approvals" opens the tab with that item selected
- [ ] Pending / Resolved tabs, label and count on one line; list ↑↓ A R E
- [ ] Detail: requester, tool, tier, target, expiry; editable content; "Approve with edits" when changed (re-validated)
- [ ] Resolved: approved / rejected / expired with outcome line
- [ ] States L E X

## Projects
- [ ] List: Active / Paused / Done / Archived / All; health, progress, next task, target
- [ ] Detail: tasks with blocked-by (disabled checkbox + reason), milestones timeline, activity, health reason, linked repos, workspace (owner only, copy launch), context brief
- [ ] New project dialog with validation; delete confirmation lists consequences
- [ ] States L E X D

## Organization
- [ ] Day / Week / Month (D W M keys); now line; event categories legend
- [ ] Event detail: edit, delete (confirm)
- [ ] Today's plan (suggested), conflicts with proposed fix → approval
- [ ] Tasks with priority and due; overdue in failed colour
- [ ] States L E X D

## Outreach
- [ ] Three-pane mail layout (desktop): mailbox sidebar 248 · message list 320–400 · reading pane. Tablet: sidebar becomes an overlay behind a menu button. Mobile: list → message drill-down with back, mailboxes as a chip row
- [ ] Up to 3 linked accounts, each with a colour dot. Sidebar: All inboxes + one inbox per account (unread counts), Flagged, Needs reply, Archive, Sorted by Outreach (Important, Opportunities, Networking, Event mail, Other), Events, Follow-ups; footer “n of 3 accounts linked · Manage”
- [ ] Unified rows show which account each message came to; account views show email + sync time in the header
- [ ] Signed-out account: × in the sidebar, banner in its list, alert in the message, replies disabled until Reconnect
- [ ] List: search scoped to the mailbox, All / Unread, unread dot + weight, flag, category, draft tag; keys ↑↓/J K, E archive, S flag, U unread, R reply
- [ ] Message: toolbar (archive, flag, unread, follow up, add to calendar for event mail), position + prev/next, header with “to <account>”, AI summary + action items, body, drafted-reply state (awaiting / sent / rejected)
- [ ] Reply bar: reply from the receiving account (From chip), save to that account’s Gmail drafts, or ask Outreach to draft (goes to Approvals)
- [ ] New message: choose From account
- [ ] Discover events: toolbar (search, When segmented, Free only, Sort), category chips with live counts, source strip with "Add a feed", auto-fill grid (min 290 px), event cards per `components.md`
- [ ] Event card actions Save → Interested → Attend → Calendar, in order, undo by clicking a reached step, tooltips on locked steps; staging moves the event into the pipeline
- [ ] Discover empty state with Clear filters; filters persisted in the URL
- [ ] Events pipeline: Discovered → Saved → Interested → Attending → Attended → Follow up; one step at a time with ← →
- [ ] Follow-ups: draft with agent, done
- [ ] Import event URL
- [ ] States L E X D

## Socials
- [ ] Feed with status filter and platform filter; platform-accurate previews (aspect ratios); missing media warning
- [ ] Review: variant tabs, editable text with live preview and character count, media, time, account, lifecycle
- [ ] Actions per status: draft → send for approval / mark posted manually; pending → approve & schedule / back to draft; scheduled → unschedule; failed → retry / manual; publishing state
- [ ] Compose: title, platforms, text, save draft, ask Social for variants
- [ ] Performance: followers trend per platform, top posts
- [ ] States L E X D

## Finances
- [ ] Overview: range, totals, savings / net / cumulative charts with aria descriptions, category breakdown with toggles, show/hide all, rule suggestions, recent imports (remove)
- [ ] Transactions: uncategorised filter, inline category select, "remember for future imports"
- [ ] Budgets: inline limit, over / near / left states
- [ ] CSV import: file + account label → preview (new, duplicates, possible duplicates) → result
- [ ] States L E X (D = n/a)

## Career, Knowledge, Goals, Briefings, Automations, Settings
- [ ] Career list: profile + heatmap (filter by repo), repo list with All / Failing CI / Open PRs, search, archived toggle, sync; latest activity grouped by day (one heading per day)
- [ ] Career repo page `/career/[repo]`: breadcrumb back, header (name, visibility, CI, description, topics, Link to project, Open on GitHub), tabs Code / Pull requests / Issues / Actions / Insights with counts
- [ ] Repo Code tab: branch, clone pill (one line, ellipsis, copy), file table, README card; sidebar About (stats, languages), CI strip + failure alert → ask Projects, recent commits
- [ ] Repo PRs (open + merged, checks), Issues (labels, draft-issue link), Actions table (scrolls under 640 px), Insights (weekly commits chart, code frequency, contributors)
- [ ] Knowledge: keyword / semantic (privacy note), kind filters, list + editor (title, tags, linked project, bookmark note, text, char count), delete
- [ ] Goals: editable vision, horizon filter, goals → objectives with progress, momentum, neglected, link project
- [ ] Briefings: list (failed state), sections, build now, privacy note
- [ ] Automations: rules with switch, WHEN / IF / THEN, limits note, recent runs (running, done, approval, skipped)
- [ ] Settings: Connections (ok / off / error → Reconnect / warn / manual), AI and spend (cap, by model, free-model privacy), Outreach, Briefings schedule
