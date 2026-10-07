import { Skeleton } from "@/ui/skeleton";

export default function Loading() {
  return (
    <div aria-busy="true">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="mt-3 mb-8 h-5 w-96 max-w-full" />
      <Skeleton className="h-40 w-full rounded-14" />
    </div>
  );
}
