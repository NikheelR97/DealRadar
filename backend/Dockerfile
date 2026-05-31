# syntax=docker/dockerfile:1
# Backend image — multi-stage, non-root, pinned bases (HANDOVER §8).
# Build context is the repo root (workspace install).

FROM node:20.11-alpine3.19 AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY backend/package.json ./backend/package.json
RUN npm ci
COPY backend ./backend
RUN npm run build -w @dealradar/backend

FROM node:20.11-alpine3.19 AS runtime
ENV NODE_ENV=production
# Chromium for the Takealot CSR scraper (puppeteer-core; HANDOVER §8 risk register).
# Pulled from the Alpine 3.19 branch repos, so the pinned base image fixes the major.
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
WORKDIR /app
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont
RUN addgroup -g 1001 dealradar && adduser -u 1001 -G dealradar -S dealradar
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
RUN npm ci --omit=dev --workspace @dealradar/backend --include-workspace-root \
    && npm cache clean --force
COPY --from=build /app/backend/dist ./backend/dist
USER dealradar
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:3001/api/ready || exit 1
CMD ["node", "backend/dist/index.js"]
