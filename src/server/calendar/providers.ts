import type { CalendarConnectionId } from "../../lib/calendar-types";
import type { DB } from "../db/client";
import { icloudProviderFor, type realDav } from "./caldav/provider";
import { ProviderError } from "./errors";
import { createGoogle, googleTokenSource } from "./google/client";
import { createGoogleProvider } from "./google/provider";
import type { CalendarProvider } from "./types";

type Opts = { fetch?: typeof fetch; davFactory?: typeof realDav; key?: Buffer; now?: () => Date };

/** The one place a connection id becomes a real provider (ADR-010: no mocks here). */
export async function providerFor(id: CalendarConnectionId, h: DB, opts: Opts = {}): Promise<CalendarProvider> {
  if (id === "google_calendar") return createGoogleProvider({ google: createGoogle({ getToken: googleTokenSource(h, opts), fetch: opts.fetch }) });
  const p = await icloudProviderFor(h, opts);
  if (!p) throw new ProviderError("icloud", "auth", 401, "iCloud Calendar isn't connected.");
  return p;
}
