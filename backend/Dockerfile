# syntax=docker/dockerfile:1

# ---- Build stage: install all deps + compile TypeScript ----
FROM node:20-alpine AS build
WORKDIR /app

# Install deps first so the layer is cached on source-only changes.
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# ---- Runtime stage: prod deps only + compiled JS ----
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Drop dev deps for a smaller image.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

EXPOSE 4000

# Liveness probe — orchestrators (Docker, Compose, K8s, Render) gate readiness
# on this instead of "process started". wget is provided by busybox in
# node:alpine.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/api/health || exit 1

# Drop root before exec — node:alpine ships a `node` user but doesn't switch
# to it by default. A code-execution vuln in the app shouldn't equal root in
# the container.
USER node

CMD ["node", "dist/index.js"]
