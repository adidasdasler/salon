# SALON backend + worker image (multi-stage, pnpm monorepo)
# Build context = repo root:  docker build -f apps/backend/Dockerfile .
FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm PATH=$PNPM_HOME:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app

# ---------- deps ----------
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/backend/package.json apps/backend/
COPY packages/core/package.json packages/core/
COPY packages/ui/package.json packages/ui/
COPY packages/config/package.json packages/config/
RUN pnpm install --frozen-lockfile --filter @salon/backend...

# ---------- build ----------
FROM base AS build
COPY --from=deps /app ./
COPY apps/backend apps/backend
COPY packages packages
RUN pnpm --filter @salon/backend prisma generate \
 && pnpm --filter @salon/backend build

# ---------- runtime ----------
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
RUN apk add --no-cache tini postgresql-client
WORKDIR /app
COPY --chown=node:node package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY --chown=node:node --from=build /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/apps/backend/node_modules ./apps/backend/node_modules
COPY --chown=node:node --from=build /app/apps/backend/dist ./apps/backend/dist
COPY --chown=node:node --from=build /app/apps/backend/prisma ./apps/backend/prisma
COPY --chown=node:node --from=build /app/packages/core ./packages/core
USER node
EXPOSE 4000
# Prune dev-only packages to shrink the image
ENTRYPOINT ["/sbin/tini","--"]
CMD ["node","apps/backend/dist/main.js"]
