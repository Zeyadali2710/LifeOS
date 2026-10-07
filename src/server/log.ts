import pino from "pino";

export const log = pino({
  level: process.env.LOG_LEVEL ?? "info",
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
