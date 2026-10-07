import { runMigrations } from "@/server/db/migrate";
import { env } from "@/server/env";
import { log } from "@/server/log";

runMigrations(env().DATABASE_URL)
  .then(() => log.info("migrations applied"))
  .catch((err) => {
    log.fatal({ err }, "migration failed");
    process.exit(1);
  });
