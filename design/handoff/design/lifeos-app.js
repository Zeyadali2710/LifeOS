/* LifeOS Phase 2 app store + module sample data. Depends on lifeos-data.js (window.LOS). All data is illustrative. */
(function () {
  const boot = () => {
    if (!window.LOS) return setTimeout(boot, 20);
    const LOS = window.LOS;
    const fin = LOS.agents.find(a => a.id === "finance");
    fin.task = "Last: categorised 42 transactions and suggested 3 keyword rules"; fin.step = "Finished 3:40 · suggestions waiting in Finances";

    const listeners = new Set();
    const A = window.APP = {
      state: Object.assign({}, LOS.initState, { ready: true, taskDone: {}, resolvedLocal: [], mailSel: "m1", mailArchived: {}, stageOv: {}, autoOff: {}, readN: {}, kSel: "k1", kQuery: "", kMode: "keyword", kKind: "all",
        projSel: null, projFilter: "active", orgView: "week", eventSel: null, finTab: "overview", finRange: "Month", catOff: {}, txCat: {}, goalHorizon: "all", briefSel: null, autoSel: "a2", setSec: "connections", apprSel: null, apprTab: "pending", runSel: null, agentsView: "office", repoSel: null, outTab: "inbox", socTab: "feed" }),
      sub(fn) { listeners.add(fn); return () => listeners.delete(fn); },
      set(p) { const patch = typeof p === "function" ? p(A.state) : p; Object.assign(A.state, patch); listeners.forEach(f => f()); },
      toast(m) { A.set({ toast: m }); clearTimeout(A.__tt); A.__tt = setTimeout(() => A.set({ toast: null }), 2600); }
    };
    A.proxy = { get state() { return A.state; }, setState: p => A.set(p) };
    A.ctl = () => LOS.ctl(A.proxy);

    A.projects = [
      { id: "lifeos", name: "LifeOS", category: "Product", status: "active", health: "on_track", healthLabel: "On track", healthReason: "4 of 6 milestone tasks done; 0.9 due Fri 23 Oct.", priority: "P1", done: 4, total: 6, next: "Write the 0.9 release notes", target: "Fri 23 Oct", objective: "Ship LifeOS 1.0",
        repos: [["alex-morgan/lifeos", "CI passing · 2 open PRs"]], workspace: { path: "~/code/lifeos", machine: "homelab-vm", launch: "docker compose -f docker/compose.dev.yml up" },
        context: "Personal OS for one owner. 0.9 adds briefings and automations. Every outside write stays behind an approval.",
        milestones: [["0.8 Finances", "2 Oct", "done"], ["0.9 Briefings + automations", "23 Oct", "current"], ["1.0 Public write-up", "4 Dec", "next"]],
        tasks: [["t1", "Write the 0.9 release notes", "P1", "Today", ""], ["t2", "Fix briefing retry on Gmail 429", "P1", "Fri", ""], ["t3", "Record a 60-second office tour", "P2", "Fri", "Write the 0.9 release notes"], ["t4", "Automations run history", "P2", "", "done"], ["t5", "Weekly briefing kind", "P2", "", "done"], ["t6", "Migration 0015 activity time", "P3", "", "done"]],
        activity: [["9:23", "Social drafted a LinkedIn post from this project"], ["8:58", "Projects agent proposed issue “Briefings: retry failed sends”"], ["Wed", "Task done: Automations run history"]] },
      { id: "harbour", name: "Harbour Transit case study", category: "Career", status: "active", health: "at_risk", healthLabel: "At risk", healthReason: "No task completed in 9 days; target Sat 31 Oct.", priority: "P2", done: 3, total: 8, next: "Draft the “alerts nobody read” section", target: "Sat 31 Oct", objective: "Senior product role by March",
        repos: [["alex-morgan/harbour-prototype", "CI failed 2h ago"]], workspace: { path: "~/work/harbour", machine: "macbook", launch: "npm run dev" }, context: "Case study for portfolio and LinkedIn. Research, prototype, alerts redesign.",
        milestones: [["Research write-up", "9 Oct", "done"], ["Prototype section", "24 Oct", "current"], ["Publish", "31 Oct", "next"]],
        tasks: [["h1", "Draft the “alerts nobody read” section", "P1", "Sat", ""], ["h2", "Export prototype GIFs", "P2", "", "Draft the “alerts nobody read” section"], ["h3", "Research summary", "P2", "", "done"]],
        activity: [["13 Oct", "Task done: Research summary"]] },
      { id: "portfolio", name: "Portfolio refresh", category: "Career", status: "paused", health: "paused", healthLabel: "Paused", healthReason: "Paused by you on 26 Sep.", priority: "P3", done: 2, total: 5, next: "—", target: "—", objective: "Senior product role by March", repos: [], workspace: null, context: "", milestones: [], tasks: [], activity: [] },
      { id: "half", name: "Half marathon plan", category: "Health", status: "active", health: "on_track", healthLabel: "On track", healthReason: "3 runs this week.", priority: "P3", done: 9, total: 24, next: "Tempo run, 6 km", target: "17 May", objective: "Run a half marathon in May", repos: [], workspace: null, context: "", milestones: [], tasks: [], activity: [] },
      { id: "dumpling", name: "Dumpling map", category: "Side project", status: "done", health: "done", healthLabel: "Done", healthReason: "Shipped 30 Aug.", priority: "P3", done: 6, total: 6, next: "—", target: "30 Aug", objective: "", repos: [["alex-morgan/dumpling-map", "Archived"]], workspace: null, context: "", milestones: [], tasks: [], activity: [] }
    ];
    A.week = { days: ["Mon 19", "Tue 20", "Wed 21", "Thu 22", "Fri 23", "Sat 24", "Sun 25"], today: 3,
      events: [[0, "9:30", "10:00", "Weekly planning", "focus"], [0, "18:00", "19:00", "Run club", "health"], [1, "11:00", "12:00", "Harbour Transit sync", "work"], [2, "16:00", "18:00", "Startup Week day 2", "outreach"], [2, "18:00", "18:45", "Instagram post (failed)", "social"],
        [3, "10:00", "10:30", "Call with Priya Natarajan", "work"], [3, "11:30", "12:15", "Coffee with Sam Okafor", "people"], [3, "14:00", "16:00", "Deep work: 0.9 notes", "focus"], [3, "17:30", "18:30", "Gym", "health"], [3, "18:30", "21:00", "Startup Week mixer", "outreach"],
        [4, "8:30", "9:00", "LinkedIn: Shipping 0.9", "social"], [4, "13:00", "13:45", "Design review with Mia Chen", "work"], [5, "7:00", "8:30", "Long run, 14 km", "health"], [5, "10:00", "10:30", "Instagram: Behind the pixels", "social"], [6, "18:00", "18:30", "Weekly briefing", "focus"]] };
    A.tasks = [["o1", "Approve reply to Jordan Lee", "P1", "Today 12:00", "Outreach"], ["o2", "Write the 0.9 release notes", "P1", "Today", "LifeOS"], ["o3", "Pay strata levy", "P2", "Overdue · Tue", "—"], ["o4", "Fix briefing retry on Gmail 429", "P1", "Fri", "LifeOS"], ["o5", "Book physio", "P3", "Fri", "—"], ["o6", "Draft “alerts nobody read”", "P1", "Sat", "Harbour Transit"]];
    A.plan = [["9:45", "Approve the Jordan reply", "Due 12:00 · 2 min"], ["10:30", "Pay strata levy", "Overdue · 10 min"], ["12:15", "Fix briefing retry", "45 min free after coffee"], ["14:00", "Release notes", "Your focus block"]];
    A.conflicts = [["Gym 17:30–18:30 overlaps travel to the mixer (18:30, Glebe)", "Move gym to 7:00 tomorrow?"]];

    A.mail = [
      { id: "m1", from: "Jordan Lee", org: "Sydney Startup Week", subject: "Panel invite: Building with agents, 29 Oct", cat: "IMPORTANT", imp: "HIGH", time: "8:12", unread: true, summary: "Invites you to speak on the “Building with agents” panel on 29 Oct, 6 pm, at Fishburners. Needs a yes or no by noon today.", actions: ["Reply by 12:00", "Send a 2-line bio", "Confirm AV needs"], draft: "pending" },
      { id: "m2", from: "Priya Natarajan", org: "Lumen Health", subject: "Re: Senior Product Designer — call today", cat: "OPPORTUNITIES", imp: "HIGH", time: "7:40", unread: true, summary: "Confirms today's 10:00 call and shares the role brief. Asks for two portfolio links.", actions: ["Send 2 portfolio links", "Read the role brief"] },
      { id: "m3", from: "Mia Chen", org: "Harbour Transit", subject: "Design review times?", cat: "NETWORKING", imp: "MEDIUM", time: "Wed", unread: true, summary: "Asks for 45 minutes next week to review the case study draft.", actions: ["Offer two slots"] },
      { id: "m4", from: "Luma", org: "", subject: "You're going: Startup Week mixer", cat: "EVENTS", imp: "MEDIUM", time: "Wed", unread: false, summary: "Ticket for tonight, 18:30 at The Tramsheds, Glebe.", actions: [] },
      { id: "m5", from: "Sam Okafor", org: "", subject: "Coffee Thursday?", cat: "NETWORKING", imp: "LOW", time: "Tue", unread: false, summary: "Suggests Reuben Hills at 11:30. Already on your calendar.", actions: [] },
      { id: "m6", from: "Eventbrite", org: "", subject: "5 Sydney events for you this week", cat: "EVENTS", imp: "LOW", time: "Mon", unread: false, summary: "Promotional. Classified by rule; not sent to a model.", actions: [] },
      { id: "m7", from: "Everyday Bank", org: "", subject: "Your October statement is ready", cat: "OTHER", imp: "LOW", time: "Mon", unread: false, summary: "Statement notification.", actions: [] }
    ];
    A.mailAccounts = [
      { id: "personal", label: "Personal", email: "alex.morgan@gmail.com", color: "#b5502f", status: "ok", synced: "Synced 2 min ago" },
      { id: "studio", label: "Studio", email: "studio@alexmorgan.design", color: "#3b6fb6", status: "error", synced: "Signed out 9:12", error: "Google signed LifeOS out of this account at 9:12. Mail received before then is shown. New mail and replies are paused until you reconnect." },
      { id: "club", label: "Design Club", email: "hello@sydneydesignclub.org", color: "#2f6f55", status: "ok", synced: "Synced 5 min ago" }
    ];
    A.mailMax = 3;
    A.mail.push(
      { id: "m8", from: "Tom Reyes", org: "Harbour Transit", subject: "Invoice 0142 paid", cat: "OTHER", imp: "LOW", time: "Tue", unread: false, summary: "Confirms payment of invoice 0142.", actions: [] },
      { id: "m9", from: "Nadia Rahman", org: "Fishburners", subject: "Venue confirmed for the November meetup", cat: "IMPORTANT", imp: "MEDIUM", time: "8:40", unread: true, summary: "Confirms the main room for 12 Nov, 6–9 pm, for up to 80 people. Needs a final headcount by Monday.", actions: ["Confirm headcount by Mon 26 Oct", "Send AV requirements"] },
      { id: "m10", from: "Chris Lim", org: "", subject: "Speaker application: Accessible dashboards", cat: "OPPORTUNITIES", imp: "MEDIUM", time: "Wed", unread: true, summary: "Applies to give a 20-minute talk on accessible dashboards at the December meetup.", actions: ["Reply with the December slot or a decline"] },
      { id: "m11", from: "Ella Brooks", org: "Powerhouse Museum", subject: "New project enquiry: wayfinding prototype", cat: "OPPORTUNITIES", imp: "HIGH", time: "9:05", unread: true, summary: "Asks whether you can take on a 6-week wayfinding prototype from January, and for your day rate. Mia Chen referred you.", actions: ["Reply with availability and day rate", "Suggest a call next week"] }
    );
    const MX = { m1: ["personal", "jordan@sydneystartupweek.org", 3, "Hi Alex, we'd love you on the “Building with agents” panel on Thursday 29 October at 6 pm at Fishburners. Could you let me know by noon today so we can lock the run sheet?"],
      m2: ["personal", "priya@lumenhealth.com.au", 4, "Looking forward to our call at 10. I've attached the role brief. Could you send two portfolio links beforehand so the panel can take a look?"],
      m3: ["studio", "mia.chen@harbourtransit.com.au", 5, "Would you have 45 minutes next week to walk through the case study draft? Tuesday or Wednesday afternoon suits us best."],
      m4: ["personal", "tickets@luma.com", 7, "You're going to Startup Week mixer. Thursday 22 October, 6:30 pm, The Tramsheds, Glebe."],
      m5: ["personal", "sam.okafor@gmail.com", 8, "Reuben Hills at 11:30 still good? I'll grab a table near the window."],
      m6: ["club", "events@eventbrite.com.au", 10, "5 events near Sydney this week, picked for you."],
      m7: ["personal", "statements@everydaybank.com.au", 11, "Your October statement for Everyday is ready to view in the app."],
      m8: ["studio", "tom.reyes@harbourtransit.com.au", 9, "Hi Alex, invoice 0142 has been paid today. Thanks again for the quick turnaround on the alerts work."],
      m9: ["club", "nadia@fishburners.org", 2, "Hi team, the main room is yours on 12 November from 6 to 9 pm. Capacity is 80. Please confirm numbers and AV needs by Monday."],
      m10: ["club", "chris.lim@outlook.com", 6, "Hi Design Club, I'd like to propose a 20-minute talk on making dashboards usable with a screen reader, based on work at a Sydney health startup."],
      m11: ["studio", "ella.brooks@powerhouse.com.au", 1, "Hi Alex, Mia Chen recommended you. We're scoping a wayfinding prototype for the new Parramatta site and wondered if you'd be available from January, and what your day rate is."] };
    A.mail.forEach(m => { const x = MX[m.id]; m.acct = x[0]; m.addr = x[1]; m.ord = x[2]; m.snippet = x[3]; });
    A.mail.sort((a, b) => a.ord - b.ord);
    A.events = [
      { id: "e1", title: "Building with agents panel", when: "Thu 29 Oct, 18:00", where: "Fishburners, Ultimo", src: "Luma", score: 95, stage: "ATTENDING", why: "You're speaking. Matches “AI products”." },
      { id: "e2", title: "Startup Week mixer", when: "Tonight, 18:30", where: "The Tramsheds, Glebe", src: "Luma", score: 91, stage: "ATTENDING", why: "3 people you follow are going." },
      { id: "e3", title: "AI Product Night", when: "Wed 28 Oct, 18:00", where: "Stone & Chalk", src: "Eventbrite", score: 82, stage: "SAVED", why: "Keyword “product design” and “agents”." },
      { id: "e4", title: "UX Australia drinks", when: "Fri 30 Oct, 17:30", where: "The Rocks", src: "Meetup", score: 69, stage: "INTERESTED", why: "Past attendance at 2 UX events." },
      { id: "e5", title: "Design Systems Sydney", when: "15 Oct", where: "Surry Hills", src: "iCal", score: 77, stage: "ATTENDED", why: "" },
      { id: "e6", title: "Product Camp", when: "8 Oct", where: "Barangaroo", src: "Humanitix", score: 72, stage: "FOLLOW_UP", why: "Follow up with Lena Ho about mentoring." },
      { id: "e7", title: "Figma Sydney meetup", when: "Thu 5 Nov, 18:00", where: "Pyrmont", src: "Meetup", score: 74, stage: null, why: "New this week." }
    ];
    (function () {
      const X = { e1: [7, '18:00–20:30', 'Free', 'Fishburners', ['AI', 'Startups'], 84], e2: [0, '18:30–21:00', 'Free', 'Sydney Startup Week', ['Startups', 'Networking'], 210], e3: [6, '18:00–20:00', 'A$15', 'Stone & Chalk', ['AI', 'Design'], 96],
        e4: [8, '17:30–19:30', 'Free', 'UX Australia', ['Design', 'Networking'], 58], e5: [-7, '18:00–20:00', 'Free', 'Design Systems Sydney', ['Design'], 120], e6: [-14, '09:00–17:00', 'A$40', 'Product Camp', ['Design', 'Startups'], 300], e7: [14, '18:00–20:30', 'Free', 'Figma Community Sydney', ['Design'], 140] };
      A.events.forEach(e => { const x = X[e.id]; Object.assign(e, { d: x[0], time: x[1], price: x[2], org: x[3], cats: x[4], going: x[5] }); });
      [['e8', 'Fintech product night', 12, '18:00–20:00', 'Free', 'Tank Stream Labs, Sydney CBD', 'Fintech Builders', ['Fintech'], 'Eventbrite', 71, 'Keyword “payments”.', 64],
       ['e9', 'Intro to cybersecurity careers', 11, '18:30–20:00', 'Free', 'UTS Tower, Ultimo', 'SecTalks Sydney', ['Cybersecurity'], 'Eventbrite', 58, '', 45],
       ['e10', 'Sunday design walk: Barangaroo', 3, '09:00–11:00', 'A$10', 'Barangaroo Reserve', 'Design Walks', ['Design'], 'Humanitix', 63, 'Weekend, 2 km from home.', 22],
       ['e11', 'AI builders demo night', 5, '18:30–21:00', 'Free', 'Haymarket HQ', 'Builders Club', ['AI', 'Engineering'], 'Luma', 88, 'Matches “agents”. 5 people you follow are going.', 132],
       ['e12', 'Women in product breakfast', 15, '07:30–09:00', 'A$25', 'The Grounds, Alexandria', 'Product Women AU', ['Design', 'Networking'], 'Humanitix', 66, '', 70],
       ['e13', 'Open source evening', 20, '18:00–21:00', 'Free', 'Atlassian Hub, Sydney CBD', 'Sydney OSS', ['Engineering'], 'Meetup', 70, 'You maintain 2 public repositories.', 51],
       ['e14', 'Engineering leadership fireside', 21, '18:00–19:30', 'A$20', 'Paddington Town Hall', 'Lead Dev Sydney', ['Engineering'], 'Luma', 61, '', 88],
       ['e15', 'Startup founders mixer', 2, '16:00–19:00', 'Free', 'Young Henrys, Newtown', 'Founders Collective', ['Startups', 'Networking'], 'Eventbrite', 79, 'Weekend. 2 of your contacts are going.', 160],
       ['e16', 'Climate tech pitch night', 27, '18:00–21:00', 'A$12', 'Tramsheds, Glebe', 'Climate Founders Sydney', ['Startups'], 'Luma', 57, '', 95]
      ].forEach(r => A.events.push({ id: r[0], title: r[1], d: r[2], time: r[3], price: r[4], where: r[5], org: r[6], cats: r[7], src: r[8], score: r[9], why: r[10], going: r[11], stage: null }));
      const DN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      A.events.forEach(e => { const dt = new Date(2026, 9, 22 + e.d); e.wd = DN[dt.getDay()]; e.dn = dt.getDate(); e.mon = MN[dt.getMonth()]; e.weekend = dt.getDay() === 0 || dt.getDay() === 6; if (e.d >= 0) e.when = (e.d === 0 ? 'Tonight' : e.wd + ' ' + e.dn + ' ' + e.mon) + ', ' + e.time.split('–')[0]; });
    })();
    A.followUps = [["Lena Ho", "Mentoring chat after Product Camp", "Due today"], ["Daniel Park", "Send the Startup Week deck", "Due Mon 26 Oct"]];

    A.repos = [
      { id: "r1", name: "alex-morgan/lifeos", lang: [["TypeScript", 88, "#3b6fb6"], ["SQL", 7, "#b5502f"], ["Shell", 5, "#6a9a5c"]], push: "2h ago", prs: 2, ci: "passing", stars: 14, desc: "Personal operating system: agents, projects, organization, outreach." },
      { id: "r2", name: "alex-morgan/harbour-prototype", lang: [["TypeScript", 71, "#3b6fb6"], ["CSS", 29, "#8a5cc7"]], push: "2h ago", prs: 1, ci: "failed", stars: 3, desc: "Trip-planning prototype for the Harbour Transit case study." },
      { id: "r3", name: "alex-morgan/portfolio-site", lang: [["Astro", 64, "#d98a2b"], ["CSS", 36, "#8a5cc7"]], push: "26 Sep", prs: 0, ci: "passing", stars: 2, desc: "alexmorgan.design" },
      { id: "r4", name: "alex-morgan/dumpling-map", lang: [["JavaScript", 100, "#c9a227"]], push: "30 Aug", prs: 0, ci: "none", stars: 41, desc: "Map of Sydney dumpling spots. Archived.", archived: true },
      { id: "r5", name: "alex-morgan/dotfiles", lang: [["Shell", 100, "#6a9a5c"]], push: "12 Oct", prs: 0, ci: "none", stars: 0, desc: "" }
    ];
    A.careerActivity = [["2h", "Pushed 3 commits to lifeos/main"], ["2h", "CI failed on harbour-prototype: test “alerts banner”"], ["Wed", "Opened PR #212 “Automations: run history”"], ["Tue", "Merged PR #209 “Weekly briefing”"]];

    A.fin = {
      totals: [["Income", "$7,450", ""], ["Spending", "$4,912", ""], ["Net cash flow", "+$2,538", "pos"], ["Savings contributions", "$1,500", ""]],
      cats: [["Rent", 2300, null], ["Dining", 612, 520], ["Groceries", 486, 560], ["Shopping", 340, 400], ["Transport", 214, 260], ["Utilities", 188, 220], ["Health & fitness", 120, 150], ["Subscriptions", 96, 110], ["Gifts", 64, null]],
      net: [1210, 980, 1640, -320, 1420, 1880, 960, 2100, 1350, 1720, 2310, 2538], months: ["Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct"],
      tx: [["21 Oct", "Uber *Trip", -18.4, "Transport", "Everyday"], ["21 Oct", "Harris Farm Markets", -72.15, "Groceries", "Everyday"], ["20 Oct", "Spotify", -13.99, "Subscriptions", "Credit card"], ["20 Oct", "Chat Thai Haymarket", -46.0, "Dining", "Credit card"], ["19 Oct", "PAYPAL *STEAMGAMES", -24.95, null, "Credit card"], ["18 Oct", "Transfer to Savings", -750.0, "Savings", "Everyday"], ["17 Oct", "Bourke St Bakery", -14.5, "Dining", "Everyday"], ["16 Oct", "Salary LUMEN? no — ACME PTY LTD", 3600.0, "Salary", "Everyday"], ["15 Oct", "Origin Energy", -188.0, "Utilities", "Everyday"], ["14 Oct", "SQ *MARRICKVILLE FARMERS", -38.0, null, "Everyday"], ["14 Oct", "Anytime Fitness", -60.0, "Health & fitness", "Credit card"], ["12 Oct", "Refund JB HI-FI", 89.0, "Shopping", "Credit card"]],
      suggestions: [["“STEAMGAMES” → Entertainment", "matches 4 transactions"], ["“FARMERS” → Groceries", "matches 6 transactions"], ["“CHAT THAI” → Dining", "matches 3 transactions"]],
      accounts: ["All accounts", "Everyday", "Savings", "Credit card"], uncategorised: 12, imports: [["Everyday", "CSV · 214 rows · 18 Oct"], ["Credit card", "CSV · 96 rows · 18 Oct"]]
    };
    A.fin.tx[7][1] = "ACME PTY LTD SALARY";

    A.knowledge = [
      { id: "k1", title: "Pricing page decision (Sep)", kind: "note", tags: ["lifeos", "pricing"], project: "LifeOS", updated: "28 Sep", body: "Decided: no pricing page for 1.0. LifeOS stays single-owner and self-hosted. Revisit if three people ask to run it themselves. Write-up goes in the public post instead." },
      { id: "k2", title: "Harbour Transit interview synthesis", kind: "research", tags: ["harbour", "research"], project: "Harbour Transit case study", updated: "9 Oct", body: "12 interviews. People plan multi-leg trips in their heads first, then check the app. Service alerts were read by 2 of 12. Most wanted alerts where they look at departure time." },
      { id: "k3", title: "Agent approval patterns", kind: "document", tags: ["agents", "lifeos"], project: "LifeOS", updated: "2 Oct", body: "Tiers: READ, PREPARE, APPROVE, EXECUTE, HIGH_RISK. HIGH_RISK cannot be lowered. Approvals expire after 7 days and cancel the run." },
      { id: "k4", title: "How to talk about routing in the panel", kind: "idea", tags: ["talk", "agents"], project: "", updated: "Wed", body: "Lead with the $20 cap story. Show the fallback chip. One slide on what never goes to a free model." },
      { id: "k5", title: "Isometric pixel art references", kind: "bookmark", tags: ["design", "pixel"], project: "LifeOS", updated: "Tue", body: "https://example.com/iso-references", link: "https://example.com/iso-references" },
      { id: "k6", title: "Senior PD interview prep", kind: "note", tags: ["career"], project: "", updated: "Mon", body: "Stories: Harbour alerts, LifeOS approvals, dumpling map launch. Questions for Lumen: team size, design ops, research budget." },
      { id: "k7", title: "Half marathon plan v2", kind: "document", tags: ["running"], project: "Half marathon plan", updated: "12 Oct", body: "Three runs a week. Long run builds 1 km every fortnight. Taper from 3 May." }
    ];

    A.goals = { vision: "Do work I'm proud of, with time left for the people I like.", items: [
      { id: "g1", title: "Senior product role by March", progress: 41, momentum: "slowing", objectives: [
        { title: "Finish the Harbour Transit case study", progress: 38, momentum: "slowing", horizon: "month", projects: ["Harbour Transit case study"], neglected: false, target: "31 Oct" },
        { title: "Speak at two events", progress: 50, momentum: "rising", horizon: "month", projects: [], neglected: false, target: "30 Nov", manual: true },
        { title: "Refresh the portfolio", progress: 40, momentum: "none", horizon: "year", projects: ["Portfolio refresh"], neglected: true, target: "Dec" } ] },
      { id: "g2", title: "Ship LifeOS 1.0", progress: 67, momentum: "rising", objectives: [
        { title: "0.9: briefings and automations", progress: 67, momentum: "rising", horizon: "week", projects: ["LifeOS"], neglected: false, target: "23 Oct" },
        { title: "1.0 public write-up", progress: null, momentum: "none", horizon: "long", projects: [], neglected: false, target: "4 Dec" } ] },
      { id: "g3", title: "Run a half marathon in May", progress: 38, momentum: "steady", objectives: [
        { title: "Run three times a week", progress: 38, momentum: "steady", horizon: "long", projects: ["Half marathon plan"], neglected: false, target: "17 May" } ] } ] };

    A.briefings = [
      { id: "b1", kind: "Morning", period: "Thu 22 Oct", at: "7:00", counts: "5 events · 3 approvals · 2 important emails", sections: [["Today", ["10:00 Call with Priya Natarajan", "11:30 Coffee with Sam Okafor", "14:00 Deep work: 0.9 notes", "18:30 Startup Week mixer"]], ["Waiting on you", ["Send reply to Jordan Lee (Outreach)", "Create issue in alex-morgan/lifeos (Projects)", "Publish “Shipping LifeOS 0.9” on LinkedIn"]], ["Important mail", ["Jordan Lee · Panel invite: Building with agents", "Priya Natarajan · Re: Senior Product Designer"]], ["Conflicts", ["Gym 17:30 overlaps travel to the mixer"]], ["Goals", ["Harbour Transit case study is slowing", "Refresh the portfolio: no activity in 26 days"]], ["Budgets", ["Dining $612 of $520"]], ["CI", ["harbour-prototype failed 2h ago"]]] },
      { id: "b2", kind: "Evening", period: "Wed 21 Oct", at: "18:00", counts: "4 done · 6 open · 5 tomorrow", sections: [["Done today", ["Automations run history", "Triage: 14 emails"]], ["Still open", ["Write the 0.9 release notes"]]] },
      { id: "b3", kind: "Morning", period: "Wed 21 Oct", at: "7:00", counts: "3 events · 1 approval", sections: [] },
      { id: "b4", kind: "Weekly", period: "Sun 18 Oct", at: "18:00", counts: "2 goals rising · 1 budget over", sections: [] },
      { id: "b5", kind: "Morning", period: "Tue 20 Oct", at: "Failed", failed: true, counts: "Gmail returned 429. Retried on the next tick at 7:15.", sections: [] }
    ];
    A.briefingSchedule = [["Morning", "07:00", true], ["Midday", "12:30", false], ["Evening", "18:00", true], ["Weekly", "Sunday 18:00", true]];

    A.automations = [
      { id: "a1", name: "Morning inbox digest", trigger: "Schedule · 09:00 Mon–Fri", conditions: [], actions: ["Send notification: “{{event.title}}”"], last: "9:00 · done", runs24: 1, status: "done" },
      { id: "a2", name: "Receipts → Finance task", trigger: "Event · Important email", conditions: ["title contains “receipt”"], actions: ["Create task “Categorise {{event.title}}” · due in 2 days · P3"], last: "Running now · 2 of 3", runs24: 3, status: "running" },
      { id: "a3", name: "CI failed → ask LifeOS", trigger: "Event · CI failed", conditions: ["source equals “github”"], actions: ["Ask LifeOS: “Summarise the failure and draft an issue”"], last: "2h ago · waiting on approval", runs24: 1, status: "approval" },
      { id: "a4", name: "Calendar conflict alert", trigger: "Event · Calendar conflict", conditions: [], actions: ["Send notification: “Conflict: {{event.detail}}”"], last: "8:10 · done", runs24: 1, status: "done" },
      { id: "a5", name: "Gym reminder", trigger: "Schedule · 06:15 Mon, Wed, Fri", conditions: [], actions: ["Send notification: “Gym today”"], last: "6:15 · done", runs24: 1, status: "done" },
      { id: "a6", name: "Weekend reading list", trigger: "Schedule · 09:00 Sat", conditions: [], actions: ["Ask LifeOS: “Pick 3 saved bookmarks to read”"], last: "Off since 4 Oct", runs24: 0, status: "off" }
    ];
    A.autoRuns = [["9:41", "Receipts → Finance task", "running", "automation.create_task ×2"], ["9:00", "Morning inbox digest", "done", "automation.notify"], ["8:10", "Calendar conflict alert", "done", "automation.notify"], ["7:38", "CI failed → ask LifeOS", "approval", "automation.ask_agent → github.create_issue (APPROVE)"], ["6:15", "Gym reminder", "done", "automation.notify"], ["Wed 22:02", "Receipts → Finance task", "skipped", "Rate limit: 20 runs per 24 h"]];

    A.connections = [
      { group: "Calendar", items: [["Google Calendar", "alex.morgan@gmail.com · 2 calendars · default: Personal", "ok"], ["iCloud Calendar", "Not connected", "off"]] },
      { group: "Mail · 3 of 3 accounts", items: [["Gmail · Personal", "alex.morgan@gmail.com · synced 2 min ago", "ok"], ["Gmail · Studio", "studio@alexmorgan.design · signed out by Google at 9:12", "error"], ["Gmail · Design Club", "hello@sydneydesignclub.org · synced 5 min ago", "ok"]] },
      { group: "Code", items: [["GitHub", "Read-only token · 5 repos · synced 6 min ago", "ok"]] },
      { group: "AI providers", items: [["Anthropic", "Key ending 7Q2c · Opus, Sonnet, Haiku", "ok"], ["OpenRouter", "Key ending x91A · free routing + embeddings", "ok"]] },
      { group: "Socials", items: [["LinkedIn", "Alex Morgan · posting enabled", "ok"], ["Instagram", "alexmakes · business account", "ok"], ["TikTok", "@alexmakes · sandbox (mock publishing)", "warn"], ["Portfolio", "Manual · mark as posted", "manual"]] },
      { group: "Event sources", items: [["Luma", "Following 6 calendars", "ok"], ["Eventbrite", "Sydney · 25 km", "ok"], ["iCal feeds", "2 feeds", "ok"]] }
    ];
    A.spend = { cap: 20, mtd: 4.12, byModel: [["Opus", 1.9, 41], ["Sonnet", 2.22, 188], ["Haiku (triage)", 0.0, 96], ["Free (OpenRouter)", 0, 312]] };

    A.notifications = [
      { id: "n1", group: "Now", cat: "APPROVAL", title: "Outreach wants to send a reply to Jordan Lee", detail: "mail.send_reply · expires Thu 29 Oct", action: "Review", important: true, unread: true, route: ["approvals"] },
      { id: "n2", group: "Now", cat: "AGENT", title: "Knowledge stopped at the 60k token limit", detail: "Pricing page decision search", action: "Retry", important: false, unread: true, route: ["agents", "knowledge"] },
      { id: "n3", group: "Today", cat: "REMINDER", title: "Call with Priya Natarajan at 10:00", detail: "Lumen Health · in 19 min", action: "Prep", important: true, unread: true, route: ["organization"] },
      { id: "n4", group: "Today", cat: "IMPORTANT", title: "CI failed on harbour-prototype", detail: "test “alerts banner”", action: "Open", important: false, unread: true, route: ["career"] },
      { id: "n5", group: "Today", cat: "FYI", title: "Thursday briefing is ready", detail: "5 events · 3 approvals · 2 important emails", action: "Read", important: false, unread: true, route: ["briefings"] },
      { id: "n6", group: "Earlier", cat: "URGENT", title: "Studio mail needs reconnecting", detail: "studio@alexmorgan.design · Google signed LifeOS out at 9:12. New mail and replies are paused.", action: "Reconnect", important: true, unread: false, route: ["settings"] }
    ];

    A.states = {
      home: { empty: ["Nothing needs you today", "No priorities, approvals or events. Briefings will start filling this in after your first sync."], error: ["Home couldn't load the digest", "Each source fails soft; this happens only when the database is unreachable."], disconnected: ["Connect a calendar and mail to fill Home", "Priorities and Today are built from your calendar, tasks and mail."] },
      agents: { empty: ["No agents are enabled", "Enable agents in Settings → AI and spend."], error: ["Agent status is unavailable", "Live status stopped responding. Runs continue; this view will reconnect."], disconnected: ["Add an Anthropic key to start agents", "Agents need a model provider. The Automations agent works without one."] },
      approvals: { empty: ["Nothing is waiting on you", "When an agent proposes something that writes to the outside world, it appears here."], error: ["Approvals couldn't load", "Nothing has been sent. Try again."], disconnected: ["Approvals are local", "This view has no external connection."] },
      projects: { empty: ["No projects yet", "A project groups tasks, milestones and repositories toward one outcome. Create your first one to start tracking progress."], error: ["Projects couldn't load", "Try again."], disconnected: ["Connect GitHub to link repositories", "Projects work without it."] },
      organization: { empty: ["A clear week", "No events or tasks. Add a task or connect a calendar."], error: ["Calendar sync failed", "Google returned an error at 9:32. Showing events from the last good sync."], disconnected: ["Connect a calendar", "Connect Google Calendar or iCloud to see your events here and let LifeOS plan around them. Tasks work without a calendar."] },
      outreach: { empty: ["Inbox zero", "No new mail and no saved events."], error: ["Mail sync failed", "Gmail returned 429. LifeOS retries automatically."], disconnected: ["Connect mail to use Outreach", "Connect Gmail to triage mail and draft replies. Events work without it."] },
      socials: { empty: ["No posts yet", "Write an idea or let the Social agent draft from a project."], error: ["Socials couldn't load", "Try again."], disconnected: ["Connect a platform to publish", "You can still draft and mark posts as posted manually."] },
      career: { empty: ["No repositories synced yet", "Your first sync may still be running. Use Sync now, or check that your token can see the repositories you expect."], error: ["GitHub sync failed", "Token rejected. Check it in Settings → Connections."], disconnected: ["Connect GitHub", "Connect GitHub to see your repositories, pull requests and CI here. LifeOS only reads; it never changes anything on GitHub."] },
      finances: { empty: ["Import your first CSV", "Export a UTF-8 CSV from your bank. Nothing leaves LifeOS unless you ask Finance."], error: ["Import failed", "Row 214: invalid date “31/02/2026”. Invalid rows block the whole import."], disconnected: ["No bank connection needed", "Finances works from CSV imports only."] },
      knowledge: { empty: ["Nothing saved yet", "Add a note, upload a .md file or save a bookmark."], error: ["Search failed", "Keyword search is local; try again."], disconnected: ["Semantic search is off", "Turn it on to send titles and text to OpenRouter embeddings. Keyword search stays local."] },
      goals: { empty: ["Write one sentence of vision", "Then add a goal and link a project to measure progress."], error: ["Goals couldn't load", "Try again."], disconnected: ["Goals are local", "No connection needed."] },
      briefings: { empty: ["No briefings yet", "The first morning briefing builds at 7:00, or build one now."], error: ["The last briefing failed", "Gmail returned 429. It retries on the next tick."], disconnected: ["Briefings need at least one source", "Connect a calendar or mail."] },
      automations: { empty: ["No automations", "Turn a signal into a task, notification or a question for LifeOS."], error: ["The automation engine is paused", "The Automations agent is paused, so no rules run."], disconnected: ["Automations are local", "Actions run through the same approval gateway as agents."] },
      settings: { empty: ["", ""], error: ["Couldn't save", "Try again."], disconnected: ["", ""] }
    };
    A.ready = true;
    listeners.forEach(f => f());
  };
  boot();
})();
