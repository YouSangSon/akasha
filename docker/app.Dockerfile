FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-alpine AS runner

WORKDIR /app

RUN addgroup -S -g 10001 akasha \
  && adduser -S -D -H -u 10001 -G akasha akasha \
  && mkdir -p /var/lib/developer-memory-os/backups

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/db/migrations ./dist/src/db/migrations
COPY --from=builder /app/scripts ./scripts

RUN chown -R akasha:akasha /app /var/lib/developer-memory-os

USER akasha

CMD ["node", "dist/src/app/server.js"]
