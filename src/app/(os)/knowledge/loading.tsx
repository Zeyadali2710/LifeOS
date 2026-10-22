import { RouteLoading } from "@/features/shell/route-state";

export default function Loading() {
  return <RouteLoading route="knowledge" bars={[[40, "65%"], [32, "45%"], [76, "35%"], [76, "35%"], [300, "100%"]]} />;
}
