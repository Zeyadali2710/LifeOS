import { RouteLoading } from "@/features/shell/route-state";

export default function Loading() {
  return <RouteLoading route="organization" bars={[[34, "70%"], [600, "100%"]]} />;
}
