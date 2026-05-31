-- V1__initial_schema.sql — DealRadar initial schema (HANDOVER §6).
-- Applied on first Postgres init via /docker-entrypoint-initdb.d.
-- Future changes are additive and sequential (V2__, V3__) — never edit this file.

BEGIN;

-- Visibility of a user's tracking of a product. Defaults to private (HANDOVER §6).
CREATE TYPE visibility AS ENUM ('public', 'private');

-- ── users ───────────────────────────────────────────────────────────────────
-- One row per Google-authenticated user. Admin status is NOT stored; it is
-- derived at request time from the ADMIN_EMAILS allowlist (single source of truth).
CREATE TABLE users (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE CHECK (email = lower(email) AND length(email) <= 320),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);

-- ── products ─────────────────────────────────────────────────────────────────
-- One canonical row per URL (scraped once regardless of how many people track it).
CREATE TABLE products (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  url                 TEXT NOT NULL UNIQUE CHECK (length(url) <= 2048),
  retailer_domain     TEXT NOT NULL,
  name                TEXT,
  image_url           TEXT,
  currency            TEXT NOT NULL DEFAULT 'ZAR',
  poll_interval_hours INT  NOT NULL DEFAULT 4 CHECK (poll_interval_hours BETWEEN 2 AND 12),
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_checked_at     TIMESTAMPTZ
);

-- Partial index over products still being polled.
CREATE INDEX idx_products_active ON products (id) WHERE is_active;

-- ── tracked_items ────────────────────────────────────────────────────────────
-- One user's tracking of one product, carrying its own visibility.
CREATE TABLE tracked_items (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  visibility visibility NOT NULL DEFAULT 'private',
  added_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, product_id)
);

CREATE INDEX idx_tracked_items_user ON tracked_items (user_id);
-- Drives the public-site visibility filter (HANDOVER §6).
CREATE INDEX idx_tracked_items_public ON tracked_items (product_id) WHERE visibility = 'public';

-- ── price_history ────────────────────────────────────────────────────────────
-- Append-only observations keyed by product_id (shared across all trackers).
-- price is NULL when out of stock; positive when present.
CREATE TABLE price_history (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id    BIGINT NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  price         NUMERIC(12, 2) CHECK (price IS NULL OR price > 0),
  in_stock      BOOLEAN NOT NULL DEFAULT TRUE,
  scrape_source TEXT NOT NULL CHECK (scrape_source IN ('api', 'cheerio', 'puppeteer')),
  checked_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_price_history_product_checked ON price_history (product_id, checked_at DESC);

-- ── scrape_errors ────────────────────────────────────────────────────────────
-- Sanitised error log keyed by product_id (no stack traces). Typed error_type.
CREATE TABLE scrape_errors (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id  BIGINT NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  error_type  TEXT NOT NULL CHECK (error_type IN (
                'blocked', 'parse_error', 'timeout',
                'robots_disallowed', 'network_error', 'unknown')),
  message     TEXT NOT NULL CHECK (length(message) <= 1000),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_scrape_errors_product_occurred ON scrape_errors (product_id, occurred_at DESC);

-- ── settings ─────────────────────────────────────────────────────────────────
-- Single-row global config (admin-managed). id pinned to 1.
CREATE TABLE settings (
  id                  INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  poll_interval_hours INT NOT NULL DEFAULT 4 CHECK (poll_interval_hours BETWEEN 2 AND 12),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO settings (id, poll_interval_hours) VALUES (1, 4);

COMMIT;
