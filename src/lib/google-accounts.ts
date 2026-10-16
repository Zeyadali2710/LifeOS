import { z } from "zod";

export const googleConnectionId = z.union([z.literal("google_calendar"), z.string().regex(/^google_mail:[a-f0-9]{64}$/)]);
export type GoogleConnectionId = z.infer<typeof googleConnectionId>;
export const isGoogleConnection = (id: string): boolean => googleConnectionId.safeParse(id).success;
export const mailSyncKey = (id = "google_calendar") => id === "google_calendar" ? "mail.sync" : `mail.sync:${id}`;
