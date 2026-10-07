"use client";

import { useShell } from "@/shell/shell-provider";
import { Button } from "@/ui/button";
import { Icon } from "@/ui/icon";

export function SignOut() {
  const { signOut } = useShell();
  return (
    <Button variant="secondary" onClick={signOut}>
      <Icon name="logout" size={18} />
      Sign out
    </Button>
  );
}
