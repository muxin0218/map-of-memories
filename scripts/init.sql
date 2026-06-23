-- ============================================================
-- Map of Us — Database Schema (PostgreSQL + PostGIS)
-- ============================================================
-- Run this script once to set up the database:
--   psql -U postgres -d mapofus -f scripts/init.sql
-- ============================================================

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS memories (
  id         TEXT PRIMARY KEY,
  city_id    TEXT NOT NULL,
  city_name  TEXT NOT NULL DEFAULT '',
  city_en    TEXT NOT NULL DEFAULT '',
  date       DATE NOT NULL,
  text       TEXT NOT NULL DEFAULT '',
  image      TEXT NOT NULL DEFAULT '',
  photos     JSONB DEFAULT '[]'::jsonb,
  draft      BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_memories_city_id ON memories(city_id);
CREATE INDEX IF NOT EXISTS idx_memories_date   ON memories(date DESC);

CREATE TABLE IF NOT EXISTS checkins (
  id         TEXT PRIMARY KEY,
  city_id    TEXT NOT NULL,
  location   GEOGRAPHY(Point, 4326) NOT NULL,
  name       TEXT NOT NULL,
  date       DATE NOT NULL,
  text       TEXT DEFAULT '',
  photos     JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_checkins_city_id   ON checkins(city_id);
CREATE INDEX IF NOT EXISTS idx_checkins_location  ON checkins USING GIST(location);

CREATE TABLE IF NOT EXISTS app_store (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
