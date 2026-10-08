import type { NextConfig } from "next";

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const config: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // dev-only: reach `next dev` from other tailnet devices via `tailscale serve`
  allowedDevOrigins: ["*.tailf137cc.ts.net"],
  serverExternalPackages: ["pino", "pg-boss"],
  headers: async () => [{ source: "/:path*", headers: securityHeaders }],
};

export default config;
