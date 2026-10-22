import { RouteLoading } from "@/features/shell/route-state";

export default function Loading() {
  return <RouteLoading route="automations" bars={[[18, "65%"], [68, "35%"], [68, "35%"], [160, "90%"], [120, "90%"]]} />;
}
