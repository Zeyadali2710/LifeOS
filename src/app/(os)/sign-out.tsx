"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/ui/button";

export function SignOut() {
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      className="h-8 px-3"
      onClick={async () => {
        await authClient.signOut();
        router.replace("/login");
        router.refresh();
      }}
    >
      Sign out
    </Button>
  );
}
