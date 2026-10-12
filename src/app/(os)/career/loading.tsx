import { Skeleton } from "@/ui/skeleton";

export default function Loading() {
  return (
    <div aria-busy="true" className="mx-auto flex max-w-[1480px] flex-col gap-8">
      <div>
        <Skeleton className="h-10 w-64" />
        <Skeleton className="mt-3 h-5 w-96 max-w-full" />
      </div>
      <div className="flex flex-wrap gap-3">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-[132px] rounded-24" />
        ))}
      </div>
      <div className="grid gap-6 desk:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,320px),1fr))] gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-48 rounded-24" />
          ))}
        </div>
        <div className="flex flex-col gap-2">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-12 w-full rounded-16" />
          ))}
        </div>
      </div>
    </div>
  );
}
