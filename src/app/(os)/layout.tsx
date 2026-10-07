import { requireOwner } from "@/server/session";
import { SignOut } from "./sign-out";

export default async function OsLayout({ children }: { children: React.ReactNode }) {
  await requireOwner();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-14 items-center justify-between border-b border-line px-4 sm:px-6">
        <span className="font-mono text-xs tracking-[0.3em] text-signal">LIFEOS</span>
        <SignOut />
      </header>
      <main className="flex-1 px-4 py-8 sm:px-8 lg:px-12">{children}</main>
    </div>
  );
}
