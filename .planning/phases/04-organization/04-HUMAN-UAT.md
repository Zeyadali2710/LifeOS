---
status: passed
phase: 04-organization
source: [04-VERIFICATION.md]
started: 2026-10-12T00:00:00Z
updated: 2026-10-12T00:00:00Z
---

## Current Test

[complete — owner approved 2026-10-12]

## Tests

### 1. iCloud shared calendar shows as read-only (CR-A03)
expected: In Settings → Connections, a calendar shared to you read-only shows "Read only", can't be the default, and isn't offered in the event dialog's Calendar select. A refused write never pauses the iCloud connection.
result: passed

### 2. Recurring "All events" edit from an occurrence (CR-A01, CR-B01)
expected: Open a later occurrence of a weekly event on Google and on iCloud, change its time, choose "All events". Every occurrence shifts by the same amount; earlier occurrences stay; the Repeat select shows the series rule.
result: passed

### 3. Recurring "This and following" edit (CR-A02, WR-A04)
expected: Edit a middle occurrence with "This and following". Earlier occurrences are unchanged, later ones move, previously deleted occurrences stay deleted, on both providers.
result: passed

### 4. Reload one occurrence then save "This event" (CR-B02)
expected: Open an occurrence, trigger "Reload event" (or edit after a remote change), save with "This event". Only that occurrence changes and it stays on its own date.
result: passed

### 5. Agent write with time validation (CR-A04)
expected: "Add gym on Thursday at 6pm" — the approval card time matches the event created after approving (18:00 Sydney).
result: passed

### 6. Grid keyboard focus (WR-B11, lower priority)
expected: On /organization, PageUp/PageDown and [ / ] change the range and keyboard focus stays on the grid.
result: passed

## Summary

total: 6
passed: 6
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
