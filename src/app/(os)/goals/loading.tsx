import { RouteLoading } from "@/features/shell/route-state";

export default function Loading() {
  return <RouteLoading route="goals" bars={[[56, "100%"], [32, "48%"], [64, "100%"], [64, "100%"], [64, "100%"], [64, "100%"]]} />;
}
