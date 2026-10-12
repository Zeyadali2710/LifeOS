"use server";

import { z } from "zod";
import type { TaskDialogOptions } from "@/lib/project-types";
import { db } from "./db/client";
import { log } from "./log";
import {
  addLink,
  addProjectDependency,
  addTaskDependency,
  createMilestone,
  createProject,
  deleteMilestone,
  deleteProject,
  removeLink,
  removeProjectDependency,
  removeTaskDependency,
  setMilestoneDone,
  setProjectArchived,
  taskDialogOptions,
  updateMilestone,
  updateProject,
} from "./projects";
import { requireOwner } from "./session";

const uuid = z.uuid();
const NOT_FOUND = { ok: false, error: "not_found" } as const;
const FAILED = { ok: false, error: "failed" } as const;

async function run<T>(fn: () => Promise<T>): Promise<T | typeof FAILED> {
  try {
    return await fn();
  } catch (err) {
    log.error({ err }, "project action failed"); // never log contents
    return FAILED;
  }
}

/** Validate ids (uuid) before any query; invalid -> not_found. */
function withIds<A extends [string] | [string, string], T>(raw: A, fn: (ids: A) => Promise<T>): Promise<T | typeof FAILED | typeof NOT_FOUND> {
  const ids = raw.map((r) => uuid.safeParse(r));
  if (ids.some((i) => !i.success)) return Promise.resolve(NOT_FOUND);
  return run(() => fn(ids.map((i) => i.data!) as A));
}

export async function createProjectAction(raw: unknown) {
  await requireOwner();
  return run(() => createProject(db(), raw, new Date()));
}

export async function updateProjectAction(id: string, raw: unknown) {
  await requireOwner();
  return withIds([id], ([i]) => updateProject(db(), i, raw, new Date()));
}

export async function setProjectArchivedAction(id: string, archived: boolean) {
  await requireOwner();
  return withIds([id], ([i]) => setProjectArchived(db(), i, archived === true, new Date()));
}

export async function deleteProjectAction(id: string, confirmUnlink: boolean) {
  await requireOwner();
  return withIds([id], ([i]) => deleteProject(db(), i, confirmUnlink === true));
}

export async function createMilestoneAction(projectId: string, raw: unknown) {
  await requireOwner();
  return withIds([projectId], ([i]) => createMilestone(db(), i, raw, new Date()));
}

export async function updateMilestoneAction(id: string, raw: unknown) {
  await requireOwner();
  return withIds([id], ([i]) => updateMilestone(db(), i, raw, new Date()));
}

export async function setMilestoneDoneAction(id: string, done: boolean) {
  await requireOwner();
  return withIds([id], ([i]) => setMilestoneDone(db(), i, done === true, new Date()));
}

export async function deleteMilestoneAction(id: string) {
  await requireOwner();
  return withIds([id], ([i]) => deleteMilestone(db(), i));
}

export async function addLinkAction(projectId: string, raw: unknown) {
  await requireOwner();
  return withIds([projectId], ([i]) => addLink(db(), i, raw, new Date())); // repoId is validated (positive int) by linkInput
}

export async function removeLinkAction(id: string) {
  await requireOwner();
  return withIds([id], ([i]) => removeLink(db(), i));
}

export async function addTaskDependencyAction(taskId: string, blockedById: string) {
  await requireOwner();
  return withIds([taskId, blockedById], ([a, b]) => addTaskDependency(db(), a, b, new Date()));
}

export async function removeTaskDependencyAction(taskId: string, blockedById: string) {
  await requireOwner();
  return withIds([taskId, blockedById], ([a, b]) => removeTaskDependency(db(), a, b, new Date()));
}

export async function addProjectDependencyAction(projectId: string, blockedById: string) {
  await requireOwner();
  return withIds([projectId, blockedById], ([a, b]) => addProjectDependency(db(), a, b, new Date()));
}

export async function removeProjectDependencyAction(projectId: string, blockedById: string) {
  await requireOwner();
  return withIds([projectId, blockedById], ([a, b]) => removeProjectDependency(db(), a, b, new Date()));
}

export async function taskDialogOptionsAction(taskId: string | null): Promise<{ ok: true; options: TaskDialogOptions } | { ok: false; error: "failed" | "not_found" }> {
  await requireOwner();
  if (taskId !== null && !uuid.safeParse(taskId).success) return NOT_FOUND;
  const r = await run(() => taskDialogOptions(db(), taskId));
  return "projects" in r ? { ok: true, options: r } : FAILED;
}
