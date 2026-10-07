"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/ui/button";
import { Icon } from "@/ui/icon";

export function SignOut() {
  const router = useRouter();
  return (
    <Button
      variant="secondary"
      onClick={async () => {
        await authClient.signOut();
        router.replace("/login");
        router.refresh();
      }}
    >
      <Icon name="logout" size={18} />
      Sign out
    </Button>
  );
}
