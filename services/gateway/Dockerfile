FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-bookworm-slim AS runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates git \
    && find /var/lib/apt/lists -mindepth 1 -delete
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY scripts/git-askpass.sh ./scripts/git-askpass.sh
RUN chmod 0555 ./scripts/git-askpass.sh \
    && chown -R node:node /app
USER node
EXPOSE 8080
CMD ["node", "dist/src/server.js"]
