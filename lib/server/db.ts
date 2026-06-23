import { Pool } from "pg";
import type { QueryResultRow } from "pg";

// ---- Connection ----

const pool = new Pool({
  host: process.env.PGHOST || "localhost",
  port: Number(process.env.PGPORT) || 5432,
  database: process.env.PGDATABASE || "mapofus",
  user: process.env.PGUSER || "postgres",
  password: process.env.PGPASSWORD || "",
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on("error", (err) => console.error("[DB] pool error:", err));

// ---- Schema init (idempotent) ----

export async function ensureSchema(): Promise<void> {
  await pool.query(`CREATE EXTENSION IF NOT EXISTS postgis`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      city_id TEXT NOT NULL,
      city_name TEXT NOT NULL DEFAULT '',
      city_en TEXT NOT NULL DEFAULT '',
      date DATE NOT NULL,
      text TEXT NOT NULL DEFAULT '',
      image TEXT NOT NULL DEFAULT '',
      photos JSONB DEFAULT '[]'::jsonb,
      draft BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_memories_city_id ON memories(city_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_memories_date ON memories(date DESC)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS checkins (
      id TEXT PRIMARY KEY,
      city_id TEXT NOT NULL,
      location GEOGRAPHY(Point, 4326) NOT NULL,
      name TEXT NOT NULL,
      date DATE NOT NULL,
      text TEXT DEFAULT '',
      photos JSONB DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_checkins_city_id ON checkins(city_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_checkins_location ON checkins USING GIST(location)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_store (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`);
}

// ---- Generic query ----

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  const result = await pool.query<T>(text, params);
  return result.rows;
}

// ---- Key-value store (for city-assets, login-photos, settings) ----

export async function readJsonValue<T>(key: string, fallback: T): Promise<T> {
  try {
    const { rows } = await pool.query("SELECT value FROM app_store WHERE key = $1", [key]);
    return (rows[0]?.value as T) ?? fallback;
  } catch (error) {
    console.error("[DB] readJsonValue error for key=", key, error);
    return fallback;
  }
}

export async function writeJsonValue<T>(key: string, value: T): Promise<T> {
  await pool.query(
    `INSERT INTO app_store (key, value, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $2::jsonb, updated_at = NOW()`,
    [key, JSON.stringify(value)],
  );
  return value;
}

export async function uploadDataImage(
  value: string,
  _pathPrefix: string,
  _fallbackFileName: string,
): Promise<string> {
  if (!value.startsWith("data:image/")) return value;
  return value;
}

export const isDbConfigured = true;
export const shouldRequirePersistentStorage = process.env.NODE_ENV === "production";
