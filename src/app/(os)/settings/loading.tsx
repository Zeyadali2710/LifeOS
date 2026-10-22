import { RouteLoading } from "@/features/shell/route-state";
export default function Loading() {
  return <RouteLoading route="settings" bars={[[16, "20%"], [64, "85%"], [64, "85%"], [16, "20%"], [64, "85%"], [64, "85%"]]} />;
}
