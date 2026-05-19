# ─── Base ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /repo

# ─── Stage 1: deps（仅 manifest 进缓存层）────────────────────────────
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc turbo.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/providers/package.json packages/providers/
RUN pnpm install --frozen-lockfile

# ─── Stage 2: build ────────────────────────────────────────────────────
FROM base AS builder
COPY --from=deps /repo /repo
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @fau/web build

# ─── Stage 3: migrate（drizzle-kit + 源 schema/ migrations） ────────────
FROM base AS migrate
COPY --from=deps /repo /repo
COPY packages/db ./packages/db
COPY packages/core ./packages/core
COPY tsconfig.base.json ./tsconfig.base.json
WORKDIR /repo/packages/db
ENTRYPOINT ["pnpm", "exec", "drizzle-kit", "migrate"]

# ─── Stage 4: runtime（极简，仅 standalone + static） ──────────────────
FROM node:20-alpine AS runner
RUN apk add --no-cache libc6-compat \
    && addgroup -S app -g 10001 \
    && adduser -S app -G app -u 10001
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Next standalone: server.js + 内嵌 node_modules
COPY --from=builder --chown=app:app /repo/apps/web/.next/standalone ./
COPY --from=builder --chown=app:app /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=app:app /repo/apps/web/public ./apps/web/public

USER app
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
