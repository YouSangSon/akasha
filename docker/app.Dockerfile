FROM node:22-bookworm-slim AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN ONNXRUNTIME_NODE_INSTALL_CUDA=skip npm ci

COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runner

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates libgomp1 \
  && rm -rf /var/lib/apt/lists/*

RUN groupadd --gid 10001 akasha \
  && useradd --uid 10001 --gid 10001 --no-create-home --shell /usr/sbin/nologin akasha \
  && mkdir -p /var/lib/developer-memory-os/backups

COPY package.json package-lock.json* ./
RUN ONNXRUNTIME_NODE_INSTALL_CUDA=skip npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/db/migrations ./dist/src/db/migrations
COPY --from=builder /app/scripts ./scripts

RUN chown -R akasha:akasha /app /var/lib/developer-memory-os

USER akasha

CMD ["node", "dist/src/app/server.js"]
