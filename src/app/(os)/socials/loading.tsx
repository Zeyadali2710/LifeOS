import { Skeleton } from "@/ui/skeleton";

export default function Loading() {
  return <div aria-busy="true" aria-label="Loading Socials" className="mx-auto flex max-w-[1480px] flex-col gap-8">
    <div><Skeleton className="h-10 w-64" /><Skeleton className="mt-3 h-5 w-96 max-w-full" /></div>
    <div className="grid grid-cols-1 gap-3 tab:grid-cols-2 min-[1100px]:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[320px] rounded-24" />)}</div>
  </div>;
}
