import { db } from "@/server/db/client";
import { parseKey, rotateMasterKey } from "@/server/key-rotation";

// Rotates LIFEOS_MASTER_KEY. Stop web + worker first so nothing decrypts with the old key mid-rotation.
// Usage (VM): see docs/security.md "Key rotation". DRY_RUN=1 only checks that every secret decrypts.
async function main() {
  const oldKey = parseKey(process.env.LIFEOS_MASTER_KEY, "LIFEOS_MASTER_KEY");
  const newKey = parseKey(process.env.LIFEOS_MASTER_KEY_NEW, "LIFEOS_MASTER_KEY_NEW");
  const dryRun = process.env.DRY_RUN === "1";
  const r = await rotateMasterKey(db(), oldKey, newKey, { dryRun });
  console.log(`${dryRun ? "Dry run OK" : "Rotated"}: ${r.connections} connection secret(s), ${r.eventSources} feed URL(s).${dryRun ? "" : " Now set LIFEOS_MASTER_KEY to the new key in .env and start web + worker."}`);
}

main().then(() => process.exit(0), (err) => { console.error(err instanceof Error ? err.message : err); process.exit(1); });
