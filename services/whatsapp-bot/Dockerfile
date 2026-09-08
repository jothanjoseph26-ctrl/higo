# ── WhatsApp Bot Service (standalone) ──────────────────────────────────────────
# Lightweight NestJS service for WhatsApp webhook handling
# Shares the same PostgreSQL database as the main API

FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate
WORKDIR /app

# Copy only package files first for caching
COPY services/whatsapp-bot/package.json ./
COPY apps/api/prisma ./prisma/
COPY packages/shared-types/package.json ./packages/shared-types/

RUN pnpm install --frozen-lockfile

# ── Stage 2: Build ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate
RUN apk add --no-cache python3 make g++
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma
COPY --from=deps /app/packages ./packages

# Copy source files
COPY services/whatsapp-bot/ ./
COPY apps/api/prisma/schema.prisma ./prisma/

ENV CI=true

# Generate Prisma client
RUN cd prisma && npx prisma generate

# Build TypeScript
RUN npx tsc

# ── Stage 3: Production ────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
RUN apk add --no-cache libc6-compat
WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./

EXPOSE 3001

CMD ["node", "dist/main.js"]
