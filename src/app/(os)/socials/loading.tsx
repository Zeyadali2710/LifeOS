import { RouteLoading } from "@/features/shell/route-state";

export default function Loading() {
  return <RouteLoading route="socials" bars={[[38, "100%"], [32, "80%"], [180, "100%"], [240, "100%"], [80, "100%"]]} />;
}
