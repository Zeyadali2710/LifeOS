import { redirect } from "next/navigation";
import { approvalsHref } from "@/features/shell/nav";

// There is no Approvals route: the inbox lives in Agents → Approvals. Old links and notifications keep working.
export default async function ApprovalsRedirect({ searchParams }: { searchParams: Promise<{ id?: string | string[] }> }) {
  const sp = await searchParams;
  redirect(approvalsHref(typeof sp.id === "string" ? sp.id : null));
}
