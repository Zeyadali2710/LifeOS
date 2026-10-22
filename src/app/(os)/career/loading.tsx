import { RouteLoading } from "@/features/shell/route-state";

export default function Loading() {
  return <RouteLoading route="career" bars={[[100, "100%"], [230, "100%"], [280, "100%"]]} />;
}
