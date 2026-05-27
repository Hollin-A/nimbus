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
CMD ["node", "dist/index.js"]
