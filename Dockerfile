# ─── Stage 1: client builder ──────────────────────────────────────────
# Builds the React client to /app/client/dist via Vite.
FROM node:20-alpine AS client-builder
WORKDIR /app/client

# Copy lockfile + manifest first so docker can cache the install layer.
COPY client/package.json client/package-lock.json* ./
RUN npm ci

# Shared types used by both runtimes (client imports `../../shared/types`).
COPY shared/ /app/shared/

COPY client/ /app/client/
RUN npm run build


# ─── Stage 2: server builder ──────────────────────────────────────────
# Compiles the TypeScript server to /app/server/dist via tsc.
FROM node:20-alpine AS server-builder
WORKDIR /app/server

COPY server/package.json server/package-lock.json* ./
RUN npm ci

COPY shared/ /app/shared/
COPY server/ /app/server/
RUN npm run build


# ─── Stage 3: runtime ─────────────────────────────────────────────────
# Slim Alpine runtime serving both API and client static files from a
# single Fastify process. Runs as non-root.
FROM node:20-alpine AS runtime
WORKDIR /app

# Production-only dependencies for the server. tsc and vitest stay out.
COPY server/package.json server/package-lock.json* ./
RUN npm ci --omit=dev

# Compiled artefacts.
COPY --from=server-builder /app/server/dist ./dist
COPY --from=client-builder /app/client/dist ./client/dist

# Volume mount target. /data is owned by `node` so DB writes succeed.
RUN mkdir -p /data && chown node:node /data
VOLUME ["/data"]

ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/data/todos.db \
    STATIC_ROOT=/app/client/dist

EXPOSE 3000

USER node

# busybox `wget` is already in the base image — no extra package needed.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/healthz || exit 1

# `npm start` (vs raw `node`) so npm_package_version gets injected and the
# /healthz response carries the actual server version.
CMD ["npm", "start"]
