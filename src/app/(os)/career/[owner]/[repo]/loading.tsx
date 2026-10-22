import { RouteLoading } from "@/features/shell/route-state";

export default function Loading() {
  return <RouteLoading route="career" bars={[[50, "70%"], [38, "100%"], [320, "100%"], [240, "70%"]]} />;
}
