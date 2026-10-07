import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { count, sql } from "drizzle-orm";
import { audit } from "@/server/audit";
import { db } from "@/server/db/client";
import { accounts, users } from "@/server/db/schema";

// Creates the single LifeOS owner. Refuses if any user already exists.
// Usage: OWNER_EMAIL=… OWNER_PASSWORD=… [OWNER_NAME=…] npm run create-owner
async function main() {
  const email = process.env.OWNER_EMAIL?.trim().toLowerCase();
  const password = process.env.OWNER_PASSWORD;
  const name = process.env.OWNER_NAME?.trim() || "Owner";
  if (!email || !email.includes("@")) throw new Error("OWNER_EMAIL is required");
  if (!password || password.length < 12) throw new Error("OWNER_PASSWORD must be at least 12 characters");

  const userId = randomUUID();
  const hash = await hashPassword(password);
  await db().transaction(async (tx) => {
    // Advisory lock makes check-then-insert atomic across concurrent runs.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('lifeos.create-owner'))`);
    const [existing] = await tx.select({ n: count() }).from(users);
    if (existing && existing.n > 0) throw new Error("An owner already exists; LifeOS is single-user.");
    await tx.insert(users).values({ id: userId, email, name, emailVerified: true });
    await tx.insert(accounts).values({ id: randomUUID(), userId, accountId: userId, providerId: "credential", password: hash });
  });
  await audit({ actor: "system", action: "auth.owner_created", target: userId });
  console.log(`Owner created: ${email}`);
}

main()
  .then(() => process.exit(0))
  .catch((err: Error) => {
    console.error(err.message);
    process.exit(1);
  });
