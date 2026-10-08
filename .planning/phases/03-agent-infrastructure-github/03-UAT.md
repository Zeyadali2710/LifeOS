---
status: complete
phase: 03-agent-infrastructure-github
source: [03-01-SUMMARY.md, 03-02-SUMMARY.md, 03-03-SUMMARY.md, 03-04-SUMMARY.md, 03-05-SUMMARY.md, 03-06-SUMMARY.md, 03-07-SUMMARY.md, 03-08-SUMMARY.md, 03-09-SUMMARY.md, 03-10-SUMMARY.md, 03-11-SUMMARY.md, 03-12-SUMMARY.md, 03-13-SUMMARY.md, 03-14-SUMMARY.md, 03-15-SUMMARY.md, 03-16-SUMMARY.md, 03-17-SUMMARY.md, 03-18-SUMMARY.md, 03-19-SUMMARY.md, 03-REVIEW-FIX.md]
started: 2026-10-09T00:00:00Z
updated: 2026-10-09T13:00:00Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

[testing complete]

## Tests

### 1. Cold Start Smoke Test (homelab redeploy)
expected: On the VM `git pull && lc up -d --build`; `lc ps` shows db/web/worker/backup/tailscale running and migrate exited (0); worker logs clean; health returns status ok, db ok, worker ok.
result: pass

### 2. Signed-out redirect goes to login and back
expected: In a private window open https://lifeos.<tailnet>.ts.net/agents. You land on /login on the same https address (not http, not :3000). After signing in you return to /agents.
result: pass

### 3. Settings → Connections
expected: Anthropic row shows CONNECTED. GitHub read row shows @login, ····last4, repo count, an expiry date (~90 days out) and "Last synced". GitHub create-issues row shows its own last4 and expiry. No full token is visible anywhere.
result: pass

### 4. Live status in the shell
expected: Sidebar AI row shows READY (WORKING while a chat runs). Approvals badge matches the number waiting. Home AGENTS and APPROVALS tiles show real counts; agent activity lists recent agent events.
result: pass

### 5. Chat streams a real answer with a visible trace
expected: Ctrl+J, ask "What's happening in my repos?". The trace shows LIFEOS → PROJECTS AGENT with github.* steps and timings; the answer streams in; citation chips open the right repos/PRs on github.com in a new tab.
result: pass

### 6. Saved threads
expected: Close and reopen the AI panel. The chat from test 5 appears under recent threads; opening it shows the full conversation and you can continue it.
result: pass

### 7. Command Centre and run detail
expected: /agents shows the agent cards and the run from test 5 in RECENT RUNS with tokens, US$ cost, latency and tool count. Opening the run shows the timeline; expanding a tool call's INPUT/OUTPUT shows data with no token values. Settings → AI and spend shows month-to-date above US$0.
result: pass

### 8. Approve flow creates exactly one issue
expected: Ask "Create an issue in <test repo> titled UAT approve with body hello". Inline approval card + notification appear; item is in /approvals; nothing on GitHub yet. Edit the title, DONE (EDITED badge), CREATE ISSUE → "Issue created: owner/repo#n" and exactly one issue on GitHub with the edited title. Clicking again does nothing.
result: pass

### 9. Reject flow
expected: Ask for another issue, then REJECT it in /approvals. The run shows cancelled and nothing is created on GitHub.
result: pass

### 10. Cancelling a waiting run cancels its approval
expected: Ask for a third issue. While it is waiting for approval, open the run in /agents and CANCEL it. The approval leaves the queue (shown as cancelled), the badge count drops, and no issue is ever created on GitHub.
result: pass

### 11. Pause all agents
expected: In /agents press PAUSE ALL. The sidebar AI row shows PAUSED and sending a chat shows the paused error with OPEN AGENTS. RESUME ALL restores READY and chat works again.
result: pass

### 12. Command palette entries
expected: Ctrl+K shows "Open approvals" with a "{n} waiting" hint and "View agent activity"; both navigate to the right pages.
result: pass

### 13. Phone over Tailscale
expected: On your phone, /approvals shows the list then detail with approve/reject usable; the AI panel opens and a chat streams; /agents cards are readable without horizontal scrolling.
result: pass

## Summary

total: 13
passed: 13
issues: 0
pending: 0
skipped: 0

## Gaps

[none yet]
