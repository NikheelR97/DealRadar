#!/bin/bash
# scripts/sprint-verify.sh — run from repo root (SPRINT_PLAN gate).
set -e
npx tsc --noEmit -p backend/tsconfig.json   || { echo "FAIL: Backend TS"; exit 1; }
npx tsc --noEmit -p frontend/tsconfig.json  || { echo "FAIL: Frontend TS"; exit 1; }
npm run lint                                || { echo "FAIL: ESLint"; exit 1; }
npm run test                                || { echo "FAIL: Tests"; exit 1; }
npm run test:coverage                       || { echo "FAIL: Coverage"; exit 1; }
npm run build                               || { echo "FAIL: Build"; exit 1; }
node scripts/check-no-secrets-in-build.js   || { echo "FAIL: Secret scan"; exit 1; }
docker compose build                        || { echo "FAIL: Docker build"; exit 1; }
docker compose up -d
sleep 15
wget -qO- http://localhost:8080            || { echo "FAIL: Frontend health"; docker compose down; exit 1; }
# Backend port 3001 is not published to the host; it is reachable only via the nginx proxy.
wget -qO- http://localhost:8080/api/health || { echo "FAIL: Backend health"; docker compose down; exit 1; }
docker compose down
echo "=== ALL GATES PASSED ==="
