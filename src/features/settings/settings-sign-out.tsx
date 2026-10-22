"use client";
import { useShell } from "@/features/shell/shell-provider";
import { Button } from "@/ui/button";
export function SettingsSignOut() {
  const { signOut } = useShell();
  return <Button icon="logout" onClick={signOut}>Sign out</Button>;
}
