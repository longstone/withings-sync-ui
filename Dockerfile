ARG WITHINGS_SYNC_VERSION=5.3.0
ARG NODE_VERSION=lts
ARG PYTHON_VERSION=3.13

# Node.js base for runtime copy
FROM node:${NODE_VERSION}-bookworm-slim AS node-base
RUN apt-get update && apt-get install -y openssl
############################
# Backend build
############################
FROM node-base AS backend-build
WORKDIR /app
COPY backend/package*.json backend/
COPY backend/tsconfig.json backend/
COPY backend/src backend/src
COPY backend/prisma backend/prisma
COPY backend/prisma.config.ts backend/

RUN cd backend && npm ci && npm run prisma:generate && npm run backend:build

############################
# Frontend build
############################
FROM node-base AS frontend-build
WORKDIR /app
COPY frontend/package*.json frontend/
COPY frontend/public frontend/public/
COPY frontend/src frontend/src
COPY frontend/angular.json frontend/
COPY frontend/tsconfig*.json frontend/
RUN cd frontend && npm ci && npm run frontend:build

############################
# Runtime: single image with backend + frontend + withings-sync CLI
############################
FROM ubuntu:rolling

ARG PYTHON_VERSION
ARG WITHINGS_SYNC_VERSION

# Install system packages
RUN apt-get update \
  && apt-get install -y ca-certificates curl python${PYTHON_VERSION} python${PYTHON_VERSION}-venv python3-pip gosu \
  && rm -rf /var/lib/apt/lists/*

# Copy Node.js from official image instead of using nvm
COPY --from=node-base /usr/local /usr/local

ENV PATH=/usr/local/bin:$PATH

# Install withings-sync
RUN PIP_BREAK_SYSTEM_PACKAGES=1 \
    python${PYTHON_VERSION} -m pip install --no-cache-dir --root-user-action=ignore withings-sync==${WITHINGS_SYNC_VERSION}

ENV NODE_ENV=production \
    PORT=3333 \
    DATABASE_URL=file:/app/data/db/app.db \
    DATA_DIR=/app/data \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Backend deps (Prisma CLI for migrate deploy)
COPY backend/package*.json backend/
COPY backend/prisma.config.ts backend/
RUN cd backend && npm ci --omit=dev

# Copy built backend + prisma artifacts
COPY --from=backend-build /app/backend/dist /app/backend/dist
COPY --from=backend-build /app/backend/prisma /app/backend/prisma
COPY --from=backend-build /app/backend/node_modules/@prisma /app/backend/node_modules/@prisma

# Frontend assets
COPY --from=frontend-build /app/frontend/dist/frontend/browser /app/frontend/dist/frontend/browser

# Data dirs
RUN mkdir -p "$DATA_DIR"/db "$DATA_DIR"/logs "$DATA_DIR"/withings-config

COPY docker/entrypoint.sh /entrypoint.sh
COPY docker/healthcheck.sh /healthcheck.sh
RUN chmod +x /entrypoint.sh
RUN chmod +x /healthcheck.sh

EXPOSE 3333
HEALTHCHECK --interval=30s --timeout=10s --retries=3 CMD ["/healthcheck.sh"]
CMD ["/entrypoint.sh"]
