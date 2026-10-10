import type { Tool } from "../types";
import { calendarTools } from "./calendar";
import { delegateTool } from "./delegate";
import { githubTools } from "./github";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous tool map; each tool validates its own I/O via zod
export const TOOLS: Record<string, Tool<any, any>> = { ...githubTools, ...calendarTools, [delegateTool.name]: delegateTool };

export const toolLabel = (name: string) => TOOLS[name]?.label ?? name;
