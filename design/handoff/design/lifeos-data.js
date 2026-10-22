/* LifeOS sample data + shared prototype controller. All names, numbers and metrics are illustrative. */
(function () {
  const agents = [
    { id: "orchestrator", name: "Orchestrator", purpose: "Answers you, reads across domains and delegates to the others.", model: "Opus", state: "working",
      task: "Planning next week around the 0.9 release milestones", step: "Delegated slot search to Organization · 4 of 12 tool calls", since: "2m 14s", runs: 6, cost: "$0.84",
      recent: [["Thursday briefing assembled", "7:00", "Done", "41s"], ["Answered: what's left for 0.9?", "Wed 22:10", "Done", "18s"], ["Drafted Startup Week reply via Outreach", "9:22", "Done", "33s"]],
      look: { hair: "#2a1d16", skin: "#e9b98f", shirt: "#5b5fc7", dark: "#3e41a0", style: "short" } },
    { id: "projects", name: "Projects", purpose: "Reads repos and LifeOS projects; drafts issues and project updates.", model: "Auto · Sonnet", state: "approval",
      task: "Create a GitHub issue in alex-morgan/lifeos", step: "Waiting on you · github.create_issue", since: "41 min", runs: 2, cost: "$0.19",
      approval: { tool: "github.create_issue", tier: "APPROVE", title: "Create issue “Briefings: retry failed sends with backoff”", target: "alex-morgan/lifeos · labels: bug, briefings", body: "The 7:00 briefing failed twice this week when Gmail returned 429. Retry with exponential backoff (3 attempts), then show a FAILED state on /briefings with the provider error.", expires: "Expires Thu 29 Oct", done: "Issue #214 created" },
      recent: [["Summarised open PRs on lifeos", "Wed 18:02", "Done", "26s"], ["Drafted Harbour Transit project update", "Tue 11:40", "Done", "52s"], ["Read tree: src/briefings", "8:57", "Done", "9s"]],
      look: { hair: "#a0522d", skin: "#f1c7a0", shirt: "#d98a2b", dark: "#a8641a", style: "curly" } },
    { id: "organization", name: "Organization", purpose: "Calendar and tasks: free slots, conflicts, event changes.", model: "Sonnet", state: "working",
      task: "Finding a 45-minute slot for the design review with Mia Chen", step: "calendar.find_free_slots · 2 tool calls", since: "48s", runs: 4, cost: "$0.12",
      recent: [["Flagged clash: gym vs mixer prep", "8:10", "Done", "12s"], ["Moved deep work to 14:00", "Wed 17:30", "Done", "20s"], ["Listed tasks due this week", "Wed 09:02", "Done", "6s"]],
      look: { hair: "#1c1a1a", skin: "#c68a5e", shirt: "#3d9a6b", dark: "#2a7350", style: "long" } },
    { id: "outreach", name: "Outreach", purpose: "Mail triage, replies and Sydney events. Never uses free models.", model: "Sonnet", state: "approval",
      task: "Reply to Jordan Lee about the Startup Week panel", step: "Waiting on you · mail.send_reply", since: "18 min", runs: 3, cost: "$0.21",
      approval: { tool: "mail.send_reply", tier: "APPROVE", title: "Send reply to Jordan Lee", target: "jordan@sydneystartupweek.org · Re: Panel invite, 29 Oct", body: "Hi Jordan, thanks for the invite. I'm in for the “Building with agents” panel on 29 October. Could you send the run sheet and the other panellists' names? Happy to do a 15-minute prep call this week. Alex", expires: "Expires Thu 29 Oct", done: "Reply sent to Jordan Lee" },
      recent: [["Triage: 14 new emails, 2 flagged", "9:00", "Done", "38s"], ["Summarised Startup Week schedule", "Wed 16:20", "Done", "22s"], ["Draft reply to Priya Natarajan", "Tue 10:05", "Sent", "29s"]],
      look: { hair: "#e0b84f", skin: "#f3cfae", shirt: "#3b82c4", dark: "#2b5f91", style: "cap" } },
    { id: "social", name: "Social", purpose: "Drafts platform variants from projects and events. Publishing always needs you.", model: "Sonnet", state: "idle",
      task: "Last: drafted LinkedIn and Instagram variants for “Shipping LifeOS 0.9”", step: "Finished 8:31 · LinkedIn variant awaits your approval in Socials", since: "1h 10m ago", runs: 1, cost: "$0.09",
      recent: [["Drafted 2 variants: Shipping LifeOS 0.9", "8:31", "Done", "44s"], ["Pulled metrics for 4 posts", "6:00", "Done", "15s"], ["Drafted Harbour Transit LinkedIn post", "Mon 19:12", "Done", "39s"]],
      look: { hair: "#3a2a4a", skin: "#8d5a3b", shirt: "#d6538f", dark: "#a63a6c", style: "long" } },
    { id: "finance", name: "Finance", purpose: "Categories, rules and budgets. Has no tools that move money.", model: "Sonnet", state: "idle",
      task: "Last: categorised 42 transactions and proposed 3 rules", step: "Finished 3:40 · rules waiting in Finances", since: "6h ago", runs: 1, cost: "$0.31",
      recent: [["Categorised 42 transactions", "3:40", "Done", "1m 02s"], ["October budget check", "Mon 07:00", "Done", "21s"], ["Merchant cleanup: Uber variants", "Sun 20:15", "Done", "34s"]],
      look: { hair: "#6b6b6b", skin: "#e3b48b", shirt: "#2f6f73", dark: "#1f5053", style: "glasses" } },
    { id: "knowledge", name: "Knowledge", purpose: "Answers from your notes and saved items. Read-only.", model: "Sonnet", state: "failed",
      task: "Answering: what did I decide about the pricing page in September?", step: "Stopped at run limit: 60k tokens", since: "25 min ago", runs: 2, cost: "$0.47",
      error: "Run limit reached (60k tokens) after 9 searches. Narrowing the question to September notes usually fits.",
      recent: [["Pricing page decision search", "9:16", "Failed", "1m 48s"], ["Found 3 notes on onboarding", "Wed 21:30", "Done", "14s"], ["Linked article to Career goal", "Tue 08:12", "Done", "8s"]],
      look: { hair: "#1e2a3a", skin: "#d7a27a", shirt: "#8a5cc7", dark: "#6740a0", style: "glasses" } },
    { id: "goals", name: "Goals", purpose: "Explains progress, momentum and neglected objectives.", model: "Sonnet", state: "paused",
      task: "Paused by you on 14 Oct", step: "New runs are rejected until you resume", since: "8 days", runs: 0, cost: "$0.00",
      recent: [["Weekly momentum summary", "13 Oct", "Done", "25s"], ["Explained stalled objective: portfolio", "10 Oct", "Done", "17s"]],
      look: { hair: "#b5442c", skin: "#f0c8a8", shirt: "#c9a227", dark: "#9a7a14", style: "curly" } },
    { id: "automations", name: "Automations", purpose: "System agent with no model. Runs your automation rules; pausing it pauses all rules.", model: "No model", state: "working",
      task: "Rule “Receipts → Finance task” on 3 new emails", step: "automation.create_task · 2 of 3", since: "6s", runs: 11, cost: "$0.00",
      recent: [["Morning inbox digest", "9:00", "Done", "4s"], ["Thursday briefing delivered", "7:00", "Done", "2s"], ["Gym reminder", "6:15", "Done", "1s"]],
      look: { kind: "robot", body: "#9aa6b8", shirt: "#6e7a8c", dark: "#4f596a" } },
    { id: "career", name: "Career", purpose: "GitHub profile and role insights.", model: "—", state: "offline", task: "Not connected", step: "Arrives in a later phase", since: "", runs: 0, cost: "—", recent: [],
      look: { hair: "#3b2b20", skin: "#c99772", shirt: "#7d8a3a", dark: "#5e6a26", style: "short" } },
    { id: "agentops", name: "AgentOps", purpose: "Monitors runs, limits and spend.", model: "—", state: "offline", task: "Not connected", step: "Arrives in a later phase", since: "", runs: 0, cost: "—", recent: [],
      look: { hair: "#222222", skin: "#e5bf98", shirt: "#5d6470", dark: "#444a55", style: "short" } }
  ];
  const STATE = {
    working: { label: "Working", short: "Working", rank: 2 }, approval: { label: "Needs approval", short: "Needs you", rank: 0 }, failed: { label: "Failed", short: "Failed", rank: 1 },
    idle: { label: "Idle", short: "Idle", rank: 3 }, paused: { label: "Paused", short: "Paused", rank: 4 }, offline: { label: "Not connected", short: "Offline", rank: 5 }
  };
  const platforms = {
    linkedin: { name: "LinkedIn", short: "in", followers: "2,318", delta: "+41", handle: "Alex Morgan", sub: "Product designer · Sydney", limit: 3000, aspect: "1.91 / 1", mediaW: "100%" },
    instagram: { name: "Instagram", short: "IG", followers: "1,204", delta: "+12", handle: "alexmakes", sub: "Sydney, Australia", limit: 2200, aspect: "4 / 5", mediaW: "100%" },
    tiktok: { name: "TikTok", short: "TT", followers: "386", delta: "+57", handle: "@alexmakes", sub: "Original sound", limit: 2200, aspect: "9 / 16", mediaW: "240px" },
    portfolio: { name: "Portfolio", short: "PF", followers: "—", delta: "", handle: "alexmorgan.design", sub: "Writing", limit: 10000, aspect: "16 / 9", mediaW: "100%" }
  };
  const posts = [
    { id: "p1", title: "Shipping LifeOS 0.9", source: "From project · LifeOS", by: "Social agent", variants: [
      { platform: "linkedin", status: "pending_approval", when: "Fri 23 Oct, 8:30", media: "Release screenshot · 1200×627",
        text: "LifeOS 0.9 is out. It's the personal operating system I've been building in the evenings: one place for projects, calendar, mail and the agents that help with them.\n\nThis release adds briefings and automations: a 7:00 summary of what matters today, and rules that turn signals into tasks. Anything that writes to the outside world still waits for my approval.\n\nNotes and screenshots in the comments." },
      { platform: "instagram", status: "draft", when: "Not scheduled", media: "Carousel · 3 slides · 1080×1350", text: "LifeOS 0.9: briefings, automations, and an agent office that finally has a night shift. Swipe for the before and after. Link in bio." } ] },
    { id: "p5", title: "Startup Week recap", source: "From event · Sydney Startup Week", by: "You", variants: [
      { platform: "instagram", status: "failed", when: "Tried Wed 21 Oct, 18:00", media: "Photo · 1080×1350", error: "Instagram expired the media container before publishing. Retry uploads the photo again.", text: "Three days, forty conversations, one very good dumpling stall. Notes from Sydney Startup Week." } ] },
    { id: "p2", title: "Harbour Transit case study", source: "From project · Harbour Transit", by: "You", variants: [
      { platform: "linkedin", status: "scheduled", when: "Fri 23 Oct, 12:30", media: "Cover · 1200×627", text: "New case study: redesigning trip planning for Harbour Transit. We cut the steps to plan a multi-leg trip from 7 to 3 and moved service alerts to where people actually look. Full write-up on my site." },
      { platform: "portfolio", status: "published", when: "Mon 19 Oct", media: "Hero · 1600×900", text: "Harbour Transit: planning a trip in three steps. A case study on research, prototyping and the alerts nobody read.", metrics: [["Views", "1,240"], ["Avg. read", "3m 10s"], ["Contact clicks", "14"]] } ] },
    { id: "p3", title: "Behind the pixels: the agent office", source: "Idea · You", by: "You", variants: [
      { platform: "instagram", status: "scheduled", when: "Sat 24 Oct, 10:00", media: "Carousel · 5 slides · 1080×1350", text: "Every agent in LifeOS gets a desk. Here's how the office shows who's working, who's stuck and who needs me." },
      { platform: "tiktok", status: "draft", when: "Not scheduled", media: null, text: "60-second tour of my agent office. Who's working, who's waiting, and what happens when I say yes." } ] },
    { id: "p4", title: "Running agents on a $20 monthly cap", source: "Idea · You", by: "You", variants: [
      { platform: "linkedin", status: "published", when: "Mon 12 Oct", media: null, text: "I run nine agents on a US$20 monthly cap. The trick isn't a cheaper model, it's routing: simple turns go to a free model, anything that needs judgement goes to Sonnet, and the orchestrator decides which is which.\n\nThree things I learned after a month.", metrics: [["Impressions", "4,812"], ["Reactions", "162"], ["Comments", "31"], ["Reposts", "9"]] } ] }
  ];
  const VS = {
    draft: { label: "Draft", group: "draft" }, pending_approval: { label: "Awaiting your approval", group: "review" }, scheduled: { label: "Scheduled", group: "scheduled" },
    publishing: { label: "Publishing", group: "scheduled" }, published: { label: "Published", group: "published" }, failed: { label: "Failed", group: "review" }, posted_manually: { label: "Posted manually", group: "published" }
  };
  const GORDER = { review: 0, scheduled: 1, draft: 2, published: 3 };
  const priorities = [
    { id: "pr1", title: "Confirm the Startup Week panel", why: "Jordan needs an answer by 12:00 today. Outreach has drafted the reply.", where: "Outreach · Jordan Lee", action: "Review reply", agent: "outreach" },
    { id: "pr2", title: "Ship the 0.9 release notes", why: "Milestone due Fri 23 Oct. 4 of 6 tasks done; the LinkedIn post is waiting on you.", where: "Projects · LifeOS", action: "Open project" },
    { id: "pr3", title: "Finish the Harbour Transit case study", why: "Stalled 9 days. Linked to the goal “Senior product role by March”.", where: "Goals · Career", action: "Plan a session" },
    { id: "pr4", title: "Review October dining spend", why: "$612 of a $520 budget. Finance proposed 3 category rules.", where: "Finances · October", action: "Review rules" }
  ];
  const today = [
    { t: "10:00", end: "10:30", title: "Call with Priya Natarajan", where: "Lumen Health · recruiter screen", kind: "event", next: true },
    { t: "11:30", end: "12:15", title: "Coffee with Sam Okafor", where: "Reuben Hills, Surry Hills", kind: "event" },
    { t: "12:00", end: "", title: "Reply due: Jordan Lee", where: "Startup Week panel", kind: "deadline" },
    { t: "14:00", end: "16:00", title: "Deep work: 0.9 release notes", where: "Focus block", kind: "focus" },
    { t: "18:30", end: "21:00", title: "Startup Week mixer", where: "The Tramsheds, Glebe", kind: "event" }
  ];
  const activity = [
    { t: "9:39", who: "orchestrator", text: "Orchestrator delegated “find a review slot” to Organization" },
    { t: "9:23", who: "outreach", text: "Outreach asked to send a reply to Jordan Lee" },
    { t: "9:16", who: "knowledge", text: "Knowledge stopped at the 60k token run limit" },
    { t: "9:00", who: "automations", text: "Morning inbox digest ran: 14 emails, 2 tasks created" },
    { t: "8:58", who: "projects", text: "Projects asked to create an issue in alex-morgan/lifeos" },
    { t: "8:31", who: "social", text: "Social drafted 2 variants for “Shipping LifeOS 0.9”" },
    { t: "7:00", who: "automations", text: "Thursday briefing delivered" }
  ];
  const L = window.LOS = { owner: "Alex", agents, STATE, platforms, posts, VS, priorities, today, activity,
    now: { day: "Thursday", date: "22 October", time: "9:41", tz: "AEDT", city: "Sydney" } };

  L.initState = { ready: false, page: "home", agentSel: "outreach", agentHover: null, varSel: "p1-linkedin", filter: "all", plat: "all", view: "office", agentOv: {}, varOv: {}, done: {}, toast: null, compose: false, draft: { title: "", text: "", plats: { linkedin: true } }, extra: [], reduced: false, sheet: true, roster: false };

  L.ctl = function (c, opt) {
    opt = opt || {};
    const st = c.state, set = s => c.setState(s);
    const toast = m => { set({ toast: m }); clearTimeout(c.__tt); c.__tt = setTimeout(() => c.setState({ toast: null }), 2600); };
    const A = agents.map(a => {
      const o = Object.assign({}, a, st.agentOv[a.id] || {}), S = STATE[o.state];
      return Object.assign(o, { stateLabel: S.label, stateShort: S.short, isWorking: o.state === "working", isApproval: o.state === "approval" && !!o.approval, isFailed: o.state === "failed", isPaused: o.state === "paused", isIdle: o.state === "idle", isOffline: o.state === "offline",
        selected: st.agentSel === o.id, canPause: o.state !== "offline" && o.state !== "paused", recentRows: (o.recent || []).map(r => ({ what: r[0], when: r[1], result: r[2], dur: r[3], failed: r[2] === "Failed" })),
        pick: () => set({ agentSel: o.id }), open: () => set({ agentSel: o.id, page: "agents" }) });
    });
    const connected = A.filter(a => a.state !== "offline" || a.id === "__"), inOffice = A.filter(a => !["career", "agentops"].includes(a.id));
    const sorted = A.slice().sort((x, y) => STATE[x.state].rank - STATE[y.state].rank);
    const count = k => A.filter(a => a.state === k).length;
    const sel = A.find(a => a.id === st.agentSel) || A[0];
    const resolve = (id, ok) => {
      const a = agents.find(x => x.id === id);
      set({ agentOv: Object.assign({}, st.agentOv, { [id]: { state: ok ? "working" : "idle", step: ok ? "Approved by you · resuming run" : "Rejected by you · run cancelled", approval: ok ? a.approval : null } }) });
      toast(ok ? "Approved. " + a.name + " is resuming." : "Rejected. Nothing was sent.");
      if (ok) setTimeout(() => {
        c.setState(s => ({ agentOv: Object.assign({}, s.agentOv, { [id]: { state: "idle", approval: null, task: "Last: " + a.approval.done, step: "Completed 9:42 · approved by you", since: "just now" } }) }));
        toast(a.approval.done + ".");
      }, 1800);
    };
    const pauseToggle = id => {
      const a = A.find(x => x.id === id);
      set({ agentOv: Object.assign({}, st.agentOv, { [id]: a.isPaused ? { state: "idle", task: "Resumed by you", step: "Ready for new runs" } : { state: "paused", task: "Paused by you just now", step: "New runs are rejected until you resume" } }) });
      toast(a.isPaused ? a.name + " resumed." : a.name + " paused. Running work finishes first.");
    };
    const retry = id => {
      set({ agentOv: Object.assign({}, st.agentOv, { [id]: { state: "working", step: "Retrying with a narrower search · run 2", since: "0s", error: null } }) });
      toast("Retry started.");
    };
    // socials
    const allPosts = st.extra.concat(posts);
    let V = [];
    allPosts.forEach(p => p.variants.forEach(v => {
      const id = p.id + "-" + v.platform, o = Object.assign({}, v, st.varOv[id] || {}), pl = platforms[o.platform], S = VS[o.status];
      const text = o.text || "";
      V.push(Object.assign(o, { id, postId: p.id, title: p.title, source: p.source, by: p.by, plat: pl, platName: pl.name, platShort: pl.short, handle: pl.handle, sub: pl.sub,
        statusLabel: S.label, group: S.group, isPending: o.status === "pending_approval", isDraft: o.status === "draft", isScheduled: o.status === "scheduled", isPublished: o.status === "published" || o.status === "posted_manually", isFailed: o.status === "failed", isPublishing: o.status === "publishing",
        hasMedia: !!o.media, noMedia: !o.media, needsMedia: !o.media && (o.platform === "tiktok" || o.platform === "instagram"), hasMetrics: !!o.metrics, metricRows: (o.metrics || []).map(m => ({ k: m[0], v: m[1] })),
        count: text.length.toLocaleString() + " / " + pl.limit.toLocaleString(), byAgent: p.by === "Social agent", selected: st.varSel === id, aspect: pl.aspect, mediaW: pl.mediaW,
        siblings: p.variants.map(s => { const sid = p.id + "-" + s.platform, so = Object.assign({}, s, st.varOv[sid] || {}); return { id: sid, short: platforms[s.platform].short, name: platforms[s.platform].name, status: VS[so.status].label, on: sid === st.varSel, pick: () => set({ varSel: sid, compose: false }) }; }),
        pick: () => set({ varSel: id, compose: false, sheet: true }) }));
    }));
    V.sort((a, b) => GORDER[a.group] - GORDER[b.group]);
    const vcount = g => V.filter(v => v.group === g).length;
    const feed = V.filter(v => (st.filter === "all" || v.group === st.filter) && (st.plat === "all" || v.platform === st.plat));
    const sv = V.find(v => v.id === st.varSel) || V[0];
    const setV = (id, patch, msg) => { set({ varOv: Object.assign({}, st.varOv, { [id]: Object.assign({}, st.varOv[id] || {}, patch) }) }); if (msg) toast(msg); };
    const approvals = A.filter(a => a.isApproval).map(a => ({ id: a.id, kind: "agent", agentId: a.id, who: a.name, title: a.approval.title, target: a.approval.target, body: a.approval.body, tool: a.approval.tool, since: a.since, expires: a.approval.expires,
      approve: () => resolve(a.id, true), reject: () => resolve(a.id, false), open: () => set({ page: "agents", agentSel: a.id }) }))
      .concat(V.filter(v => v.isPending).map(v => ({ id: v.id, kind: "post", agentId: "social", who: "Social", title: "Publish “" + v.title + "” on " + v.platName, target: v.when, body: v.text.split("\n")[0], tool: "social.publish", since: "1h 10m", expires: "Scheduled " + v.when,
        approve: () => setV(v.id, { status: "scheduled" }, "Approved. Scheduled for " + v.when + "."), reject: () => setV(v.id, { status: "draft" }, "Sent back to drafts."), open: () => set({ page: "socials", varSel: v.id, sheet: true }) })));
    const officeAgents = inOffice.map(a => ({ id: a.id, look: a.look, state: a.state }));
    const officeOpts = (cfg, palette, bg) => ({ cfg, palette, bg, agents: officeAgents, selected: st.agentSel, hover: st.agentHover, reduced: st.reduced || PixelKit.reducedSystem(), sig: officeAgents.map(a => a.state).join(",") + st.agentSel + st.agentHover + st.reduced });
    const spots = (cfg, scale, ox, oy) => {
      const Lo = PixelKit.layout(cfg);
      return inOffice.map((a, k) => { const s = Lo.stations[k]; return Object.assign({}, a, { left: Math.round(ox + (s.fx - 9) * scale), top: Math.round(oy + (s.fy - 30) * scale), w: 18 * scale, h: 26 * scale,
        enter: () => set({ agentHover: a.id }), leave: () => set({ agentHover: null }), aria: a.name + ", " + a.stateLabel + ". " + a.task }); });
    };
    const navKey = e => {
      const ids = inOffice.map(a => a.id), i = ids.indexOf(st.agentSel);
      let n = null;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") n = ids[(i + 1) % ids.length];
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") n = ids[(i - 1 + ids.length) % ids.length];
      if (n) { e.preventDefault(); set({ agentSel: n }); setTimeout(() => { const b = document.querySelector('[data-agent-spot="' + n + '"]'); if (b) b.focus(); }, 0); }
    };
    const saveDraft = () => {
      const d = st.draft, id = "n" + (st.extra.length + 1), title = d.title.trim() || "Untitled post";
      const plats = Object.keys(d.plats).filter(k => d.plats[k]);
      if (!d.text.trim()) { toast("Add some text before saving."); return; }
      const post = { id, title, source: "Idea · You", by: "You", variants: (plats.length ? plats : ["linkedin"]).map(p => ({ platform: p, status: "draft", when: "Not scheduled", media: null, text: d.text })) };
      set({ extra: [post].concat(st.extra), compose: false, varSel: id + "-" + post.variants[0].platform, draft: { title: "", text: "", plats: { linkedin: true } }, filter: "all" });
      toast("Draft saved. Nothing is scheduled until you send it for approval.");
    };
    return {
      ready: st.ready, page: st.page, isHome: st.page === "home", isAgents: st.page === "agents", isSocials: st.page === "socials", toast: st.toast, hasToast: !!st.toast,
      goHome: () => set({ page: "home" }), goAgents: () => set({ page: "agents" }), goSocials: () => set({ page: "socials" }),
      navHomeOn: st.page === "home", navAgentsOn: st.page === "agents", navSocialsOn: st.page === "socials",
      now: L.now, owner: L.owner, agents: A, sorted, inOffice, offline: A.filter(a => a.isOffline), sel, count: { working: count("working"), approval: count("approval"), failed: count("failed"), idle: count("idle"), paused: count("paused"), offline: count("offline"), connected: 11 - count("offline") },
      approvals, approvalCount: approvals.length, hasApprovals: approvals.length > 0, noApprovals: approvals.length === 0,
      priorities: priorities.map((p, i) => Object.assign({ n: i + 1, go: () => p.agent ? set({ page: "agents", agentSel: p.agent }) : toast("Opens " + p.where.split(" · ")[0] + " (Phase 2)") }, p)),
      today, activity: activity.map(a => Object.assign({ agentId: a.who }, a)),
      approveSel: () => resolve(sel.id, true), rejectSel: () => resolve(sel.id, false), pauseSel: () => pauseToggle(sel.id), retrySel: () => retry(sel.id),
      editSel: () => toast("Edit opens the proposal inline; changes are re-validated before approval."), chatSel: () => toast("Opens a thread with " + sel.name + " (⌘J)."), pauseLabel: sel.isPaused ? "Resume" : "Pause",
      officeOpts, spots, navKey, setView: v => set({ view: v }), viewOffice: st.view === "office", viewList: st.view === "list",
      toggleReduced: () => { PixelKit.reduced = !st.reduced; set({ reduced: !st.reduced }); }, reduced: st.reduced, reducedLabel: st.reduced ? "Motion off" : "Motion on",
      variants: V, feed, feedEmpty: feed.length === 0, sv, filter: st.filter, plat: st.plat,
      filters: [["all", "All", V.length], ["review", "Needs you", vcount("review")], ["scheduled", "Scheduled", vcount("scheduled")], ["draft", "Drafts", vcount("draft")], ["published", "Published", vcount("published")]].map(f => ({ key: f[0], label: f[1], n: f[2], on: st.filter === f[0], pick: () => set({ filter: f[0] }) })),
      platFilters: [["all", "All", "·"]].concat(Object.keys(platforms).map(k => [k, platforms[k].name, platforms[k].short])).map(f => ({ key: f[0], label: f[1], short: f[2], on: st.plat === f[0], pick: () => set({ plat: f[0] }) })),
      platStats: Object.keys(platforms).map(k => Object.assign({ key: k }, platforms[k])),
      approveV: () => setV(sv.id, { status: "scheduled" }, "Approved. Scheduled for " + sv.when + "."),
      sendV: () => sv.needsMedia ? toast(sv.platName + " needs media before it can be sent for approval.") : setV(sv.id, { status: "pending_approval", when: sv.when === "Not scheduled" ? "Sat 24 Oct, 9:00" : sv.when }, "Sent for approval. It appears in Approvals."),
      backToDraft: () => setV(sv.id, { status: "draft" }, "Moved back to drafts."),
      retryV: () => { setV(sv.id, { status: "publishing", error: null }); setTimeout(() => { c.setState(s => ({ varOv: Object.assign({}, s.varOv, { [sv.id]: Object.assign({}, s.varOv[sv.id] || {}, { status: "published", when: "Thu 22 Oct, 9:42", metrics: [["Likes", "—"], ["Reach", "—"]] }) }) })); toast("Published to Instagram."); }, 1600); },
      manualV: () => setV(sv.id, { status: "posted_manually", when: "Thu 22 Oct" }, "Marked as posted manually."),
      editText: e => setV(sv.id, { text: e.target.value }), unschedule: () => setV(sv.id, { status: "draft", when: "Not scheduled" }, "Unscheduled. Back in drafts."),
      compose: st.compose, notCompose: !st.compose, newPost: () => set({ compose: true, sheet: true }), cancelCompose: () => set({ compose: false }), draft: st.draft,
      draftTitle: e => set({ draft: Object.assign({}, st.draft, { title: e.target.value }) }), draftText: e => set({ draft: Object.assign({}, st.draft, { text: e.target.value }) }),
      draftPlats: Object.keys(platforms).map(k => ({ key: k, name: platforms[k].name, short: platforms[k].short, on: !!st.draft.plats[k], toggle: () => set({ draft: Object.assign({}, st.draft, { plats: Object.assign({}, st.draft.plats, { [k]: !st.draft.plats[k] }) }) }) })),
      draftCount: st.draft.text.length + " characters", saveDraft, sheet: st.sheet, closeSheet: () => set({ sheet: false, compose: false }),
      roster: st.roster, toggleRoster: () => set({ roster: !st.roster }), toastFn: toast
    };
  };
})();
