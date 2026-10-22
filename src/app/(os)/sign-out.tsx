"use client";

import { useShell } from "@/features/shell/shell-provider";
import { Button } from "@/legacy-ui/button";
import { Icon } from "@/legacy-ui/icon";

export function SignOut() {
  const { signOut } = useShell();
  return (
    <Button variant="secondary" onClick={signOut}>
      <Icon name="logout" size={18} />
      Sign out
    </Button>
  );
}
