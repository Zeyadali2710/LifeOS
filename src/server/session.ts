import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "./auth";

// Authoritative session check for every server page/action under (os).
// cache(): layout and page share one lookup per request.
export const requireOwner = cache(async () => {
  const session = await auth().api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  return session;
});
