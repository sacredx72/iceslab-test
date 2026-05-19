# syntax=docker/dockerfile:1.7

# Multi-stage Dockerfile for the Iceslab admin frontend.
# Build context MUST be the monorepo root (so pnpm-workspace.yaml is accessible).
#
#   docker build -f apps/panel-frontend/Dockerfile -t iceslab-frontend .
#
# The runtime image is nginx serving the Vite-built static bundle. The
# nginx config also reverse-proxies `/api`, `/sub`, and `/health` to the
# backend service (compose service name `backend` on port 3000).

ARG NODE_VERSION=22-alpine
ARG NGINX_VERSION=1.27-alpine

# ───── Build stage ─────
FROM node:${NODE_VERSION} AS builder
ENV CI=true
RUN corepack enable
WORKDIR /repo

# Vite bakes env vars into the bundle at build time. Empty default makes the
# frontend issue same-origin requests, which the nginx layer below proxies
# through to the backend service.
ARG VITE_API_BASE_URL=
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

# Manifest layer for cacheable dep install.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/panel-frontend/package.json apps/panel-frontend/
COPY packages/shared/package.json packages/shared/

RUN --mount=type=cache,id=pnpm,target=/root/.pnpm-store \
    pnpm install --frozen-lockfile --filter "@iceslab/panel-frontend..."

COPY apps/panel-frontend apps/panel-frontend
COPY packages/shared packages/shared

WORKDIR /repo/apps/panel-frontend
RUN pnpm build

# ───── Runtime stage: nginx static + API proxy ─────
FROM nginx:${NGINX_VERSION} AS runtime
COPY --from=builder /repo/apps/panel-frontend/dist /usr/share/nginx/html
COPY apps/panel-frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80

HEALTHCHECK --interval=15s --timeout=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ > /dev/null 2>&1 || exit 1
