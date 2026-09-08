FROM node:22-bookworm-slim AS web-build
WORKDIR /source/apps/web
COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci
COPY apps/web/index.html apps/web/tsconfig.json apps/web/tsconfig.node.json apps/web/vite.config.ts ./
COPY apps/web/public ./public
COPY apps/web/src ./src
RUN npm run build

FROM node:22-bookworm-slim AS gateway-build
WORKDIR /source/services/gateway
COPY services/gateway/package.json services/gateway/package-lock.json ./
RUN npm ci
COPY services/gateway/tsconfig.json ./
COPY services/gateway/src ./src
RUN npm run build

FROM node:22-bookworm-slim AS runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates git \
    && find /var/lib/apt/lists -mindepth 1 -delete
WORKDIR /app
ENV NODE_ENV=production
COPY services/gateway/package.json services/gateway/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=gateway-build /source/services/gateway/dist ./dist
COPY --from=web-build /source/apps/web/dist ./public
COPY services/gateway/scripts/git-askpass.sh ./scripts/git-askpass.sh
RUN chmod 0555 ./scripts/git-askpass.sh \
    && chown -R node:node /app
USER node
EXPOSE 8080
CMD ["node", "--enable-source-maps", "--import", "./dist/src/instrumentation.js", "dist/src/server.js"]
