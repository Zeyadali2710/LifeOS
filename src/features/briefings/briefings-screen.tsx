import { notFound } from "next/navigation";
import { z } from "zod";
import { getBriefing, getSchedule, listBriefings } from "@/server/briefings";
import { db } from "@/server/db/client";
import { BriefingsView } from "./briefings-view";

export async function BriefingsScreen({ selectedId }: { selectedId?: string }) {
  const h = db();
  const [rows, schedule] = await Promise.all([listBriefings(h), getSchedule(h)]);
  const id = selectedId ?? rows[0]?.id;
  const selected = id && z.uuid().safeParse(id).success ? await getBriefing(h, id) : null;
  if (selectedId !== undefined && !selected) notFound();
  const list = selected && !rows.some((r) => r.id === selected.id) ? [selected, ...rows] : rows;
  return <BriefingsView rows={list.map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), readAt: r.readAt?.toISOString() ?? null }))} selected={selected ? { ...selected, createdAt: selected.createdAt.toISOString(), readAt: selected.readAt?.toISOString() ?? null } : null} schedule={schedule} />;
}
