# syntax=docker/dockerfile:1
ARG NODE_IMAGE=node:24-bookworm-slim
FROM ${NODE_IMAGE} AS dependencies
WORKDIR /app
RUN npm install --global pnpm@10.33.3
COPY backend/package.json backend/pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production PORT=3108
WORKDIR /app
RUN npm install --global pnpm@10.33.3 \
    && mkdir -p /app/logs && chown node:node /app/logs
COPY --from=dependencies /app/node_modules ./node_modules
COPY backend/package.json backend/pnpm-lock.yaml backend/knexfile.js ./
COPY backend/src ./src
COPY backend/scripts ./scripts
USER node
EXPOSE 3108
CMD ["node", "src/server.js"]
