import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [...nextVitals, ...nextTs, { ignores: [".next/**", "dist/**", "drizzle/**", "next-env.d.ts", "design/**", ".claude/**"] }];
export default config;
