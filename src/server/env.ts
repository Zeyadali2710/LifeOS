import { z } from "zod";

// env_file turns a blank `KEY=` line into ""; treat that as unset for optional/defaulted keys.
const blank = <T extends z.ZodType>(t: T) => z.preprocess((v) => (v === "" ? undefined : v), t);

const schema = z.object({
  NODE_ENV: blank(z.enum(["development", "test", "production"]).default("development")),
  LOG_LEVEL: blank(z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info")),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
  ANTHROPIC_API_KEY: blank(z.string().min(1).optional()),
  OPENROUTER_FREE_MODEL: blank(z.string().regex(/^[\w.-]+\/[\w.-]+:free$/).optional()),
  GOOGLE_CLIENT_ID: blank(z.string().min(1).optional()),
  GOOGLE_CLIENT_SECRET: blank(z.string().min(1).optional()),
  LIFEOS_MASTER_KEY: z
    .string()
    .refine((v) => Buffer.from(v, "base64").length === 32, "must be 32 bytes, base64-encoded"),
});

export type Env = z.infer<typeof schema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = schema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment:\n${issues}`);
  }
  return result.data;
}

let cached: Env | undefined;

// Lazy so `next build` can import server modules without runtime secrets.
export function env(): Env {
  return (cached ??= parseEnv(process.env));
}
