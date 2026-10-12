import pino from "pino";

// Drizzle query errors carry the bound values (event titles, task text) in `.params` and in the
// message/stack ("params: ..."); keep the SQL, drop the values (T-04-41).
const PARAMS = /\nparams: [\s\S]*?(?=\n {4}at |$)/;
export function errSerializer(e: unknown) {
  const o = pino.stdSerializers.err(e as Error) as Record<string, unknown>;
  if (!o || typeof o !== "object") return o;
  delete o.params;
  for (const k of ["message", "stack"]) if (typeof o[k] === "string") o[k] = (o[k] as string).replace(PARAMS, "\nparams: [redacted]");
  return o;
}

export const log = pino({
  serializers: { err: errSerializer },
  level: process.env.LOG_LEVEL || "info", // blank `LOG_LEVEL=` means unset
  // Explicit per container (Dockerfile/compose); in dev, Next sets NEXT_RUNTIME and everything else is the worker.
  base: { service: process.env.LIFEOS_SERVICE ?? (process.env.NEXT_RUNTIME ? "web" : "worker") },
  redact: {
    paths: [
      "password",
      "*.password",
      "token",
      "*.token",
      "*.accessToken",
      "*.refreshToken",
      "headers.authorization",
      "headers.cookie",
      "*.headers.authorization",
      "*.headers.cookie",
    ],
    censor: "[redacted]",
  },
});
