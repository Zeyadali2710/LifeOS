import type { ReactNode } from "react";

export default function Template({ children }: { children: ReactNode }) {
  return <div className="animate-[lo-fade_150ms_ease]">{children}</div>;
}
