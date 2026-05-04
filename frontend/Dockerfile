# --- deps stage: install node_modules
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
# package-lock may not exist on first build; fall back to install
RUN if [ -f package-lock.json ]; then npm ci --legacy-peer-deps; else npm install --legacy-peer-deps; fi

# --- builder stage: bake the production bundle
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* must be present at build time — they're inlined into the client bundle.
# Default API URL is empty so the client falls back to the relative "/api"
# prefix (next.config rewrite forwards to the api container). Override with
# a build arg only if you need to call an absolute, cross-origin API.
ARG NEXT_PUBLIC_API_URL=
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_APP_TIMEZONE=Asia/Colombo
ENV NEXT_PUBLIC_APP_TIMEZONE=$NEXT_PUBLIC_APP_TIMEZONE
ARG NEXT_PUBLIC_LIVEKIT_URL=
ENV NEXT_PUBLIC_LIVEKIT_URL=$NEXT_PUBLIC_LIVEKIT_URL
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# --- runtime stage: minimal image with the standalone server
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
