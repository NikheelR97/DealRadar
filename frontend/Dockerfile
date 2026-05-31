# syntax=docker/dockerfile:1
# Frontend image — build the Vite SPA, serve via nginx (HANDOVER §8).
# Build context is the repo root (workspace install).

FROM node:20.11-alpine3.19 AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY frontend/package.json ./frontend/package.json
RUN npm ci
COPY frontend ./frontend
RUN npm run build -w @dealradar/frontend

FROM nginx:1.25-alpine AS runtime
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:80/ >/dev/null 2>&1 || exit 1
CMD ["nginx", "-g", "daemon off;"]
