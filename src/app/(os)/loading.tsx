"use client";

import { usePathname } from "next/navigation";
import { RouteLoading } from "@/features/shell/route-state";

export default function Loading() {
  return <RouteLoading route={usePathname().split("/")[1] || "home"} />;
}
