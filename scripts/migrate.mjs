/**
 * scripts/migrate.mjs
 * Migrate existing data from JSON files to PostgreSQL.
 * Run: node scripts/migrate.mjs
 */
import { readFileSync, existsSync } from "fs";
import pg from "pg";
const { Pool } = pg;

const pool = new Pool({
  host: process.env.PGHOST || "localhost",
  port: Number(process.env.PGPORT) || 5432,
  database: process.env.PGDATABASE || "mapofus",
  user: process.env.PGUSER || "postgres",
  password: process.env.PGPASSWORD || "",
});

async function migrate() {
  // Ensure schema
  await pool.query(`CREATE EXTENSION IF NOT EXISTS postgis`);
  for (const sql of [
    `CREATE TABLE IF NOT EXISTS memories (id TEXT PRIMARY KEY, city_id TEXT NOT NULL, city_name TEXT NOT NULL DEFAULT '', city_en TEXT NOT NULL DEFAULT '', date DATE NOT NULL, text TEXT NOT NULL DEFAULT '', image TEXT NOT NULL DEFAULT '', photos JSONB DEFAULT '[]'::jsonb, draft BOOLEAN DEFAULT FALSE, created_at TIMESTAMPTZ DEFAULT NOW())`,
    `CREATE TABLE IF NOT EXISTS checkins (id TEXT PRIMARY KEY, city_id TEXT NOT NULL, location GEOGRAPHY(Point,4326) NOT NULL, name TEXT NOT NULL, date DATE NOT NULL, text TEXT DEFAULT '', photos JSONB DEFAULT '[]'::jsonb, created_at TIMESTAMPTZ DEFAULT NOW())`,
    `CREATE TABLE IF NOT EXISTS app_store (key TEXT PRIMARY KEY, value JSONB NOT NULL, updated_at TIMESTAMPTZ DEFAULT NOW())`,
  ]) { await pool.query(sql); }

  // Migrate memories.json
  const memPath = "data/memories.json";
  if (existsSync(memPath)) {
    const raw = JSON.parse(readFileSync(memPath, "utf8"));
    let count = 0;
    for (const [cityId, entries] of Object.entries(raw)) {
      const mems = Array.isArray(entries) ? entries : [entries];
      for (const m of mems) {
        const dateStr = (m.date || "").replace(/\./g, "-");
        await pool.query(
          `INSERT INTO memories (id,city_id,city_name,city_en,date,text,image,photos,draft,created_at)
           VALUES ($1,$2,$3,$4,$5::date,$6,$7,$8::jsonb,$9,$10)
           ON CONFLICT (id) DO NOTHING`,
          [m.id, cityId, m.city || "", m.cityEn || "", dateStr, m.text || "", m.image || "",
           JSON.stringify(m.photos || []), m.draft || false, m.createdAt || new Date().toISOString()],
        );
        count++;
      }
    }
    console.log(`Migrated ${count} memories`);
  } else {
    console.log("No memories.json found, skipping");
  }

  // Migrate checkins.json
  const ckPath = "data/checkins.json";
  if (existsSync(ckPath)) {
    const raw = JSON.parse(readFileSync(ckPath, "utf8"));
    const items = Array.isArray(raw) ? raw : [];
    for (const c of items) {
      const dateStr = (c.date || "").replace(/\./g, "-");
      await pool.query(
        `INSERT INTO checkins (id,city_id,location,name,date,text,photos,created_at)
         VALUES ($1,$2,ST_SetSRID(ST_MakePoint($3,$4),4326)::geography,$5,$6::date,$7,$8::jsonb,$9)
         ON CONFLICT (id) DO NOTHING`,
        [c.id, c.cityId, c.lng || 0, c.lat || 0, c.name || "", dateStr, c.text || "",
         JSON.stringify(c.photos || []), c.createdAt || new Date().toISOString()],
      );
    }
    console.log(`Migrated ${items.length} checkins`);
  } else {
    console.log("No checkins.json found, skipping");
  }

  // Migrate app_store from JSON key-value files
  const storeFiles = [
    ["city-assets", "city-assets.json"],
    ["login-photos", "login-photos.json"],
  ];
  for (const [key, file] of storeFiles) {
    const fp = `data/${file}`;
    if (existsSync(fp)) {
      const value = JSON.parse(readFileSync(fp, "utf8"));
      await pool.query(
        `INSERT INTO app_store (key, value, updated_at) VALUES ($1,$2::jsonb,NOW())
         ON CONFLICT (key) DO UPDATE SET value = $2::jsonb, updated_at = NOW()`,
        [key, JSON.stringify(value)],
      );
      console.log(`Migrated ${key}`);
    } else {
      console.log(`No ${file} found, skipping`);
    }
  }

  await pool.end();
  console.log("Migration complete!");
}

migrate().catch((err) => { console.error(err); process.exit(1); });
