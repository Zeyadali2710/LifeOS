# syntax=docker/dockerfile:1
FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY . .
ARG LIFEOS_VERSION=dev
ENV NEXT_TELEMETRY_DISABLED=1 LIFEOS_VERSION=${LIFEOS_VERSION}
RUN npm run build && npm run build:worker

FROM node:24-slim AS proddeps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

# Next.js standalone server
FROM node:24-slim AS web
WORKDIR /app
ARG LIFEOS_VERSION=dev
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 LIFEOS_VERSION=${LIFEOS_VERSION} LIFEOS_SERVICE=web
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "server.js"]

# Worker + one-off scripts (migrate, create-owner)
FROM node:24-slim AS worker
WORKDIR /app
ARG LIFEOS_VERSION=dev
ENV NODE_ENV=production LIFEOS_VERSION=${LIFEOS_VERSION} LIFEOS_SERVICE=worker
COPY --from=proddeps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle
COPY package.json ./
USER node
CMD ["node", "dist/worker/index.mjs"]
