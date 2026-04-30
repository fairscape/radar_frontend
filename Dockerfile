# syntax=docker/dockerfile:1.6
#
# Multi-stage build for the RADAR React SPA.
#
# - builder uses node:20-alpine to run `vite build`; build args bake the
#   real-API base URL and the mock toggle into the bundle.
# - final stage is nginx:alpine serving the static dist/ on port 5173.
#
# The browser talks to the backend directly via the published host port
# (:8000), so nginx does NOT proxy /api/* — backend CORS already allows
# http://localhost:5173.

# ---------- builder ----------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /src

# Build args become Vite env vars at build time so they end up in the
# bundle. Defaults match docker-compose.yml; override with `--build-arg`.
ARG VITE_API_BASE_URL=http://localhost:8000
ARG VITE_USE_MOCK=0
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL} \
    VITE_USE_MOCK=${VITE_USE_MOCK}

# Install with the lockfile for reproducible builds.
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src

RUN npm run build

# ---------- runtime ----------------------------------------------------
FROM nginx:alpine AS runtime

# Replace the default nginx config with our SPA-fallback one (listens on
# 5173, no /api proxy).
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Static bundle.
COPY --from=builder /src/dist /usr/share/nginx/html

EXPOSE 5173

# nginx:alpine's default CMD already runs nginx in the foreground.
