import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseRoster } from "@/server/roster/parse";

const html = (f: string) => readFileSync(`tests/fixtures/roster/${f}`, "utf8");
const NEW = "Aro Pty Ltd: Roster for 21/09/2026 - 27/09/2026 (ID126_10035)";
const UPD = "Aro Pty Ltd: UPDATED ROSTER for 21/09/2026 - 27/09/2026 (ID126_10042)";

describe("parseRoster", () => {
  it("reads the new roster: three shifts, empty days skipped, Sydney instants", () => {
    const r = parseRoster(NEW, html("new.html"));
    expect(r).toEqual({
      ok: true,
      roster: {
        weekStart: "2026-09-21",
        weekEnd: "2026-09-27",
        updated: false,
        rosterId: "ID126_10035",
        shifts: [
          // September is AEST (+10); 4 Oct is the DST switch
          { date: "2026-09-22", branch: "TG Warring", start: "2026-09-22T02:30:00.000Z", end: "2026-09-22T08:00:00.000Z", time: "12:30–18:00", break: "14:30–15:00" },
          { date: "2026-09-26", branch: "TG Warring", start: "2026-09-26T00:00:00.000Z", end: "2026-09-26T07:30:00.000Z", time: "10:00–17:30", break: "14:00–14:30" },
          { date: "2026-09-27", branch: "TG Macquar", start: "2026-09-27T02:00:00.000Z", end: "2026-09-27T08:00:00.000Z", time: "12:00–18:00", break: "15:00–15:30" },
        ],
      },
    });
  });

  it("reads the updated roster (empty cells not merged) with the changed Tuesday", () => {
    const r = parseRoster(UPD, html("updated.html"));
    if (!r.ok) throw new Error(r.error);
    expect(r.roster.updated).toBe(true);
    expect(r.roster.rosterId).toBe("ID126_10042");
    expect(r.roster.shifts.map((s) => [s.date, s.branch, s.time, s.break])).toEqual([
      ["2026-09-22", "TG Warring", "10:30–18:00", "13:30–14:00"],
      ["2026-09-26", "TG Warring", "10:00–17:30", "14:00–14:30"],
      ["2026-09-27", "TG Macquar", "12:00–18:00", "15:00–15:30"],
    ]);
  });

  it("takes the year from the week range across New Year", () => {
    const body = `<p>Your roster for 28/12/2026 - 03/01/2027 is as follows:</p><table>
      <tr><td></td><td>TG A</td></tr>
      <tr><td>Mon 28-Dec</td><td></td></tr><tr><td>Tue 29-Dec</td><td></td></tr><tr><td>Wed 30-Dec</td><td></td></tr>
      <tr><td>Thu 31-Dec</td><td>09:00 - 17:00</td></tr>
      <tr><td>Fri 01-Jan</td><td>09:00 - 17:00 Brk (12:00-12:30)</td></tr>
      <tr><td>Sat 02-Jan</td><td></td></tr><tr><td>Sun 03-Jan</td><td></td></tr></table>`;
    const r = parseRoster("Roster", body);
    if (!r.ok) throw new Error(r.error);
    expect(r.roster.shifts.map((s) => [s.date, s.start, s.break])).toEqual([
      ["2026-12-31", "2026-12-30T22:00:00.000Z", null], // AEDT (+11)
      ["2027-01-01", "2026-12-31T22:00:00.000Z", "12:00–12:30"],
    ]);
  });

  it("skips a spacer row between the branch header and the days", () => {
    const r = parseRoster(NEW, html("new.html").replace("<tr><td><b>Mon", `<tr><td colspan="5">&nbsp;</td></tr><tr><td><b>Mon`));
    expect(r.ok && r.roster.shifts.length).toBe(3);
  });

  it("refuses to guess", () => {
    const t = (rows: string) => parseRoster(NEW, `<table><tr><td></td><td colspan="2">TG A</td><td colspan="2">TG B</td></tr>${rows}</table>`);
    expect(t(`<tr><td>Tue 22-Sep</td><td>09:00 - 17:00</td><td></td><td></td></tr>`)).toEqual({ ok: false, error: "Row Tue 22-Sep doesn't line up with the branch columns." });
    expect(t(`<tr><td>Tue 29-Sep</td><td>09:00 - 17:00</td><td></td><td colspan="2"></td></tr>`)).toEqual({ ok: false, error: "Tue 29-Sep is outside the roster week." });
    expect(t(`<tr><td>Wed 22-Sep</td><td>09:00 - 17:00</td><td></td><td colspan="2"></td></tr>`)).toEqual({ ok: false, error: "Wed 22-Sep is outside the roster week." });
    expect(t(`<tr><td>Tue 22-Sep</td><td>see AV</td><td></td><td colspan="2"></td></tr>`)).toEqual({ ok: false, error: "Couldn't read the TG A shift on Tue 22-Sep." });
    expect(t(`<tr><td>Tue 22-Sep</td><td>09:00 - 17:00</td><td></td><td colspan="2"></td></tr>`)).toEqual({ ok: false, error: "The roster table doesn't list every day of the week." });
    expect(t(`<tr><td>Tue 22-Sep</td><td>09:00 - 12:00</td><td>13:00 - 17:00</td><td colspan="2"></td></tr>`)).toEqual({ ok: false, error: "Couldn't read the TG A shift on Tue 22-Sep." });
    expect(t(`<tr><td>Tue 22-Sep</td><td>112:30 - 18:00</td><td></td><td colspan="2"></td></tr>`)).toEqual({ ok: false, error: "Couldn't read the TG A shift on Tue 22-Sep." });
    expect(t(`<tr><td>Tue 22-Sep</td><td></td><td></td><td colspan="2"></td></tr><tr><td>Tue 22-Sep</td><td></td><td></td><td colspan="2"></td></tr>`)).toEqual({ ok: false, error: "Tue 22-Sep is listed twice." });
    expect(parseRoster("Roster for 21/09/2026 - 21/09/2026", "<table><tr><td></td><td>A</td></tr><tr><td>Mon 21-Sep</td><td></td></tr></table>")).toEqual({ ok: false, error: "No roster week found." });
    expect(parseRoster("Roster for 28/09/2026 - 04/10/2026", "")).toEqual({ ok: false, error: "No roster table found." });
    expect(parseRoster("Roster for 31/09/2026 - 06/10/2026", "")).toEqual({ ok: false, error: "No roster week found." });
    expect(parseRoster("Roster", "<p>no dates</p>")).toEqual({ ok: false, error: "No roster week found." });
    expect(parseRoster(NEW, "<p>no table</p>")).toEqual({ ok: false, error: "No roster table found." });
  });
});
