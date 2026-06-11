# syntax=docker/dockerfile:1

# ---- Build stage: install deps + vite build (SPA + service worker) ----
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# Vite reads VITE_* at build time; pass them in via build args so the
# bundled URLs match wherever the container is deployed. Defaults work
# for local docker-compose; deploy targets (Vercel) override them.
ARG VITE_API_URL=http://localhost:4000
ARG VITE_SOCKET_URL=http://localhost:4000
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_SOCKET_URL=$VITE_SOCKET_URL

# Selective copies — a README or doc edit shouldn't invalidate the build
# layer. Mirrors what the backend Dockerfile already does.
COPY tsconfig*.json vite.config.ts index.html postcss.config.js tailwind.config.js ./
COPY public ./public
COPY src ./src
RUN npm run build

# ---- Runtime stage: nginx serving the static bundle ----
FROM nginx:alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80

# Liveness probe — confirms nginx is actually serving the SPA shell rather
# than just "the process started". wget is provided by busybox in nginx:alpine.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
