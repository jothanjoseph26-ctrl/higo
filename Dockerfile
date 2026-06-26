# ── Stage 1: Install dependencies (cache layer) ────────────────────────────────
FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/api-client/package.json ./packages/api-client/
COPY packages/brand-tokens/package.json ./packages/brand-tokens/
RUN pnpm install --frozen-lockfile

# ── Stage 2: Build ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate
RUN apk add --no-cache python3 make g++
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY . .

ENV CI=true
ENV NX_DAEMON=false

# Re-link workspace packages now that full package sources are present
RUN pnpm install --frozen-lockfile

RUN cd apps/api && pnpm exec prisma generate
RUN pnpm nx sync
RUN cd packages/shared-types && pnpm exec tsc --build tsconfig.lib.json
RUN test -f packages/shared-types/dist/index.js
RUN pnpm nx build @higo/api --skip-nx-cache --parallel=1

# ── Stage 3: Production ────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
RUN apk add --no-cache libc6-compat
WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /app/apps/api/package.json ./apps/api/
COPY --from=builder /app/packages/shared-types ./packages/shared-types
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

EXPOSE 3000

CMD ["node", "apps/api/dist/main.js"]