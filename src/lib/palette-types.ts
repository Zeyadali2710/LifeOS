export const PALETTE_SCOPES = ["all", "projects", "tasks", "events", "emails", "people", "notes", "github", "agents"] as const;
export type PaletteScope = (typeof PALETTE_SCOPES)[number];

export type PaletteHit = { id: string; title: string; subtitle: string; href: string };
export type PaletteData = {
  events: PaletteHit[];
  outreach: PaletteHit[];
  tasks: PaletteHit[];
  projects: PaletteHit[];
  posts: PaletteHit[];
  emails: PaletteHit[];
  people: PaletteHit[];
  notes: PaletteHit[];
  repos: PaletteHit[];
  agents: PaletteHit[];
};
