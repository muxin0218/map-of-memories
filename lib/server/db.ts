import { Pool } from "pg";

const pool = new Pool({
    host: process.env.PGHOST || "localhost",
    port: Number(process.env.PGPORT) || 5432,
    database: process.env.PGDATABASE || "mapofus",
    user: process.env.PGUSER || "postgres",
    password: process.env.PGPASSWORD || "",
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
});

export async function readJsonValue<T>(key: string, fallback: T): Promise<T> {
    try {
        const result = await pool.query(
            `SELECT value FROM map_of_us_store WHERE key = $1`,
            [key],
        );
        if (result.rows.length === 0) return fallback;
        return result.rows[0].value as T;
    } catch (error) {
        console.error(`[DB] readJsonValue error for key="${key}":`, error);
        return fallback;
    }
}

export async function writeJsonValue<T>(key: string, value: T): Promise<T> {
    try {
        await pool.query(
            `INSERT INTO map_of_us_store (key, value, updated_at)
             VALUES ($1, $2::jsonb, NOW())
             ON CONFLICT (key)
             DO UPDATE SET value = $2::jsonb, updated_at = NOW()`,
            [key, JSON.stringify(value)],
        );
        return value;
    } catch (error) {
        console.error(`[DB] writeJsonValue error for key="${key}":`, error);
        throw error;
    }
}

export async function query<T>(text: string, params?: unknown[]): Promise<T[]> {
    const result = await pool.query(text, params);
    return result.rows as T[];
}

// For compatibility with existing supabase-like interface
export async function uploadDataImage(
    value: string,
    _pathPrefix: string,
    _fallbackFileName: string,
): Promise<string> {
    // If it's not a data URL, return as-is
    if (!value.startsWith("data:image/")) return value;

    // For now, we store data URLs directly in JSONB.
    // In production, you'd want a file storage solution.
    // But since this is a local app, data URLs in the DB are fine.
    return value;
}

export const isDbConfigured = true;
export const shouldRequirePersistentStorage = process.env.NODE_ENV === "production";
