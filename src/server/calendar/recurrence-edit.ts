// Pure recurring-edit transformations (D-08). ICS is edited through ical.js setters only: values are escaped by the
// library (no CRLF injection) and unknown properties (X-APPLE-*, VALARM, ...) survive untouched.
import ICAL from "ical.js";
import { icsSeries, isIanaZone, lineKeys, loadZones, zonedParts } from "./expand";
import type { EventWrite, WriteScope } from "./types";

const SYDNEY = "Australia/Sydney";
const Q = "?sendUpdates=none";

export const SYDNEY_VTIMEZONE = `BEGIN:VTIMEZONE
TZID:Australia/Sydney
BEGIN:DAYLIGHT
TZOFFSETFROM:+1000
TZOFFSETTO:+1100
TZNAME:AEDT
DTSTART:19701004T020000
RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=1SU
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:+1100
TZOFFSETTO:+1000
TZNAME:AEST
DTSTART:19700405T030000
RRULE:FREQ=YEARLY;BYMONTH=4;BYDAY=1SU
END:STANDARD
END:VTIMEZONE`;

const pad = (n: number) => String(n).padStart(2, "0");
const clean = (s: string) => s.replace(/\r\n?/g, "\n"); // ical.js escapes \n; a bare \r must not reach the output
const wall = (tz: string, d: Date) => {
  const p = zonedParts(tz, d);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}T${pad(p.h)}:${pad(p.min)}:${pad(p.s)}`;
};
const basicUtc = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const prevDay = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);

function ensureZone(root: ICAL.Component, tz: string): boolean {
  if (loadZones(root).has(tz)) return true;
  if (tz !== SYDNEY) return false; // ponytail: only Sydney VTIMEZONE is bundled, other zones are written as UTC
  root.addSubcomponent(new ICAL.Component(ICAL.parse(SYDNEY_VTIMEZONE)));
  return true;
}

/** DTSTART/DTEND/RECURRENCE-ID/EXDATE property for an instant (timed) or date (all-day) in tz. */
function timeProp(root: ICAL.Component, name: string, value: string, allDay: boolean, tz: string): ICAL.Property {
  const p = new ICAL.Property(name);
  if (allDay) p.setValue(ICAL.Time.fromDateString(value.slice(0, 10)));
  else if (isIanaZone(tz) && ensureZone(root, tz)) {
    p.setValue(ICAL.Time.fromDateTimeString(wall(tz, new Date(value))));
    p.setParameter("tzid", tz);
  } else p.setValue(ICAL.Time.fromJSDate(new Date(value), true));
  return p;
}

function setText(v: ICAL.Component, name: string, value: string) {
  if (value) v.updatePropertyWithValue(name, clean(value));
  else v.removeAllProperties(name);
}

export function ruleFor(repeat: EventWrite["repeat"], start: string, allDay: boolean, tz: string): string | null {
  const p = zonedParts(tz, new Date(start));
  const day = allDay ? new Date(`${start.slice(0, 10)}T00:00:00Z`) : new Date(Date.UTC(p.y, p.m - 1, p.d));
  const by = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"][day.getUTCDay()];
  switch (repeat) {
    case "daily": return "FREQ=DAILY";
    case "weekly": return `FREQ=WEEKLY;BYDAY=${by}`;
    case "monthly": return `FREQ=MONTHLY;BYMONTHDAY=${day.getUTCDate()}`;
    case "yearly": return "FREQ=YEARLY";
    default: return null;
  }
}

function applyFields(root: ICAL.Component, v: ICAL.Component, input: EventWrite) {
  setText(v, "summary", input.title);
  setText(v, "description", input.description);
  setText(v, "location", input.location);
  v.removeAllProperties("dtstart");
  v.removeAllProperties("dtend");
  v.removeAllProperties("duration");
  v.addProperty(timeProp(root, "dtstart", input.start, input.allDay, input.timeZone));
  v.addProperty(timeProp(root, "dtend", input.end, input.allDay, input.timeZone));
  v.updatePropertyWithValue("transp", input.showAs === "free" ? "TRANSPARENT" : "OPAQUE");
  v.updatePropertyWithValue("dtstamp", ICAL.Time.fromJSDate(new Date(), true));
  if (input.marker) v.updatePropertyWithValue("x-lifeos-approval", clean(input.marker));
  if (input.repeat === "keep") return;
  v.removeAllProperties("rrule");
  const rule = ruleFor(input.repeat, input.start, input.allDay, input.timeZone);
  if (rule) v.updatePropertyWithValue("rrule", ICAL.Recur.fromString(rule));
}

export function icsCreate(uid: string, input: EventWrite, marker: string | null): string {
  const root = new ICAL.Component(["vcalendar", [], []]);
  root.updatePropertyWithValue("prodid", "-//LifeOS//EN");
  root.updatePropertyWithValue("version", "2.0");
  const v = new ICAL.Component("vevent");
  v.updatePropertyWithValue("uid", clean(uid));
  root.addSubcomponent(v);
  applyFields(root, v, { ...input, marker });
  return root.toString();
}

// ---- icsApply ----
type Edit = { kind: "update" | "delete"; scope: WriteScope; instanceStart: string | null; input?: EventWrite; newUid?: string };

const keyOf = (s: string) => (/^\d{4}-\d\d-\d\d$/.test(s) ? s : String(Date.parse(s)));
const isLater = (a: string, b: string) => (/^\d{4}-\d\d-\d\d$/.test(b) ? a >= b : Number(a) >= Number(b));

function stripEnding(rule: string) {
  return rule.replace(/;?(COUNT|UNTIL)=[^;]*/g, "").replace(/^;/, "");
}

export function icsApply(ics: string, edit: Edit): { updated: string | null; created: string | null } {
  const root = new ICAL.Component(ICAL.parse(ics));
  const zones = loadZones(root);
  const vs = root.getAllSubcomponents("vevent");
  const master = vs.find((v) => !v.hasProperty("recurrence-id"));
  if (!master) throw new Error("no master event");
  const s = icsSeries(master, zones);
  const recurring = !!s.rrule; // ponytail: RDATE-only series are treated as single events
  const inst = edit.instanceStart;
  const dsRaw = String(master.getFirstProperty("dtstart")!.jCal[3]);
  const utc = dsRaw.endsWith("Z");
  const ridTz = utc ? "UTC" : isIanaZone(s.zoneId) ? s.zoneId : "UTC";
  const refProp = (name: string) => timeProp(root, name, inst!, s.allDay, ridTz);
  const overrideKey = (v: ICAL.Component) => lineKeys(String(v.getFirstProperty("recurrence-id")!.toICALString()).replace(/\r?\n[ \t]/g, ""), s.zoneId, zones)[0];
  const findOverrides = (pred: (k: string) => boolean) => vs.filter((v) => v !== master && v.hasProperty("recurrence-id") && pred(overrideKey(v) ?? ""));

  let scope: WriteScope = recurring && inst ? edit.scope : "all";
  if (scope === "following" && keyOf(inst!) === (s.allDay ? dsRaw.slice(0, 10) : String(s.conv(s.start).getTime()))) scope = "all";

  if (scope === "all") {
    if (edit.kind === "delete") return { updated: null, created: null };
    applyFields(root, master, edit.input!);
    return { updated: root.toString(), created: null };
  }

  const key = keyOf(inst!);
  if (scope === "this") {
    for (const o of findOverrides((k) => k === key)) {
      if (edit.kind === "delete") root.removeSubcomponent(o);
    }
    if (edit.kind === "delete") {
      master.addProperty(refProp("exdate"));
    } else {
      let ov = findOverrides((k) => k === key)[0];
      if (!ov) {
        ov = new ICAL.Component("vevent");
        ov.updatePropertyWithValue("uid", master.getFirstPropertyValue("uid") as string);
        ov.addProperty(refProp("recurrence-id"));
        root.addSubcomponent(ov);
      }
      applyFields(root, ov, { ...edit.input!, repeat: "none" });
    }
    return { updated: root.toString(), created: null };
  }

  // following: master ends just before the instance, a new series starts at it
  let before = 0;
  const rule = master.getFirstPropertyValue("rrule") as ICAL.Recur;
  const it = rule.iterator(s.start);
  for (let t = it.next(); t && before < 2000; t = it.next()) {
    const k = s.allDay ? `${t.year}-${pad(t.month)}-${pad(t.day)}` : String(s.conv(t).getTime());
    if (isLater(k, key)) break;
    before++;
  }
  const until = s.allDay ? prevDay(key).replaceAll("-", "") : basicUtc(new Date(Number(key) - 1000));
  const ruleText = rule.toString();
  const rebuilt = (extra: string) => ICAL.Recur.fromString(`${stripEnding(ruleText)}${extra}`);
  master.updatePropertyWithValue("rrule", rebuilt(`;UNTIL=${until}`));
  for (const o of findOverrides((k) => isLater(k, key))) root.removeSubcomponent(o);
  const updated = root.toString();
  if (edit.kind === "delete") return { updated, created: null };

  const fresh = new ICAL.Component(ICAL.parse(ics));
  const fv = fresh.getAllSubcomponents("vevent");
  for (const v of fv) if (v.hasProperty("recurrence-id")) fresh.removeSubcomponent(v);
  const nm = fv.find((v) => !v.hasProperty("recurrence-id"))!;
  nm.updatePropertyWithValue("uid", edit.newUid ?? `${crypto.randomUUID()}@lifeos`);
  nm.removeAllProperties("exdate");
  const countMatch = /COUNT=(\d+)/.exec(ruleText);
  nm.updatePropertyWithValue("rrule", ICAL.Recur.fromString(countMatch ? `${stripEnding(ruleText)};COUNT=${Math.max(1, Number(countMatch[1]) - before)}` : ruleText));
  applyFields(fresh, nm, edit.input!);
  return { updated, created: fresh.toString() };
}

// ---- googlePlan ----
type GEdit = {
  kind: "update" | "delete";
  scope: WriteScope;
  calendarRemoteId: string;
  master: { remoteId: string; recurrence: string[]; allDay: boolean; occurrencesBefore?: number; first?: boolean };
  instanceStart: string | null;
  body?: Record<string, unknown>;
  /** Deterministic id for the "following" continuation, so a retry adopts it instead of duplicating (CR-A02). */
  newId?: string;
};
type Op = { method: "PATCH" | "POST" | "DELETE"; path: string; body?: Record<string, unknown> };

export function googlePlan(e: GEdit): Op[] {
  const base = `/calendars/${encodeURIComponent(e.calendarRemoteId)}/events`;
  const ev = (id: string) => `${base}/${encodeURIComponent(id)}${Q}`;
  const m = e.master;
  const inst = e.instanceStart;
  const scope = e.scope === "following" && m.first ? "all" : e.scope;
  if (scope === "all" || !inst) return e.kind === "delete" ? [{ method: "DELETE", path: ev(m.remoteId) }] : [{ method: "PATCH", path: ev(m.remoteId), body: e.body }];
  const suffix = m.allDay ? inst.replaceAll("-", "") : basicUtc(new Date(inst));
  if (scope === "this") {
    const id = `${m.remoteId}_${suffix}`;
    return e.kind === "delete" ? [{ method: "DELETE", path: ev(id) }] : [{ method: "PATCH", path: ev(id), body: e.body }];
  }
  const until = m.allDay ? prevDay(inst).replaceAll("-", "") : basicUtc(new Date(Date.parse(inst) - 1000));
  const rrule = m.recurrence.find((l) => /^RRULE:/i.test(l))?.slice(6) ?? "";
  const lines = m.recurrence.map((l) => (/^RRULE:/i.test(l) ? `RRULE:${stripEnding(rrule)};UNTIL=${until}` : l));
  const truncate: Op = { method: "PATCH", path: ev(m.remoteId), body: { recurrence: lines } };
  if (e.kind === "delete") return [truncate];
  const count = /COUNT=(\d+)/.exec(rrule);
  // ponytail: without occurrencesBefore a COUNT series continues without its COUNT, callers pass it from expand()
  const next = count && m.occurrencesBefore != null ? `${stripEnding(rrule)};COUNT=${Math.max(1, Number(count[1]) - m.occurrencesBefore)}` : stripEnding(rrule);
  // Create the continuation before truncating the master: a failure in between leaves a duplicated tail, never a lost one (CR-A02).
  return [{ method: "POST", path: `${base}${Q}`, body: { ...e.body, ...(e.newId ? { id: e.newId } : {}), recurrence: [`RRULE:${next}`] } }, truncate];
}
