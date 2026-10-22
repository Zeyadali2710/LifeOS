import { Skeleton } from "@/legacy-ui/skeleton";

export default function Loading() {
  return (
    <div aria-busy="true" className="mx-auto flex max-w-[1480px] flex-col gap-8">
      <div>
        <Skeleton className="h-10 w-64" />
        <Skeleton className="mt-3 h-5 w-96 max-w-full" />
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,340px),1fr))] gap-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-[260px] rounded-24" />
        ))}
      </div>
    </div>
  );
}
