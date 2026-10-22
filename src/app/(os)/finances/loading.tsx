import { RouteLoading } from "@/features/shell/route-state";

export default function Loading() {
  return <RouteLoading route="finances" bars={[[40, '55%'], [150, '100%'], [300, '100%'], [130, '100%']]} />;
}
