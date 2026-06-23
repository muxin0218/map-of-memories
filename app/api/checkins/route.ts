import { NextResponse, type NextRequest } from "next/server";
import { ensureSchema, query } from "@/lib/server/db";
import { requireAdminSession, requireSiteSession } from "@/lib/server/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export interface CheckIn {
  id: string;
  cityId: string;
  lat: number;
  lng: number;
  name: string;
  date: string;
  text: string;
  photos: string[];
  createdAt?: string;
}

let schemaEnsured = false;
async function ensureDb() {
  if (!schemaEnsured) { await ensureSchema(); schemaEnsured = true; }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function dateToSql(dateStr: string): string {
  return dateStr.replace(/\./g, "-");
}

function rowToCheckin(row: Record<string, unknown>): CheckIn {
  const d = new Date(row.date as string);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return {
    id: row.id as string,
    cityId: row.city_id as string,
    lat: Number(row.lat ?? 0),
    lng: Number(row.lng ?? 0),
    name: row.name as string,
    date: `${y}.${m}.${day}`,
    text: (row.text as string) ?? "",
    photos: (row.photos as string[]) ?? [],
    createdAt: (row.created_at as string) ?? new Date().toISOString(),
  };
}

function normalizeCheckIns(value: unknown): CheckIn[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is CheckIn => {
    if (!isRecord(item)) return false;
    return (
      typeof item.id === "string" &&
      typeof item.cityId === "string" &&
      typeof item.lat === "number" &&
      typeof item.lng === "number" &&
      typeof item.name === "string" &&
      typeof item.date === "string" &&
      typeof item.text === "string"
    );
  });
}

async function readCheckIns(cityId?: string): Promise<CheckIn[]> {
  if (cityId) {
    const rows = await query<Record<string, unknown>>(
      `SELECT id, city_id, name, date::text, text, photos, created_at,
              ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
       FROM checkins WHERE city_id = $1 ORDER BY date DESC, created_at DESC`,
      [cityId],
    );
    return rows.map(rowToCheckin);
  }
  const rows = await query<Record<string, unknown>>(
    `SELECT id, city_id, name, date::text, text, photos, created_at,
            ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
     FROM checkins ORDER BY date DESC, created_at DESC`,
  );
  return rows.map(rowToCheckin);
}

function parseCheckInPayload(payload: unknown): Partial<CheckIn> | null {
  if (!isRecord(payload) || !isRecord(payload.checkin)) return null;
  const item = payload.checkin;

  const cityId = typeof item.cityId === "string" ? item.cityId : null;
  const lat = typeof item.lat === "number" ? item.lat : null;
  const lng = typeof item.lng === "number" ? item.lng : null;
  const name = typeof item.name === "string" ? item.name.trim() : null;
  const date = typeof item.date === "string" ? item.date.trim() : null;
  const text = typeof item.text === "string" ? item.text.trim() : "";
  const photos = Array.isArray(item.photos)
    ? item.photos.filter((p: unknown): p is string => typeof p === "string")
    : [];

  if (!cityId || lat === null || lng === null || !name || !date) return null;
  return { cityId, lat, lng, name, date, text, photos };
}

// GET /api/checkins?cityId=xxx
export async function GET(request: NextRequest) {
  const authResponse = requireSiteSession(request);
  if (authResponse) return authResponse;
  await ensureDb();

  const { searchParams } = new URL(request.url);
  const cityId = searchParams.get("cityId");
  const result = await readCheckIns(cityId ?? undefined);

  return NextResponse.json({ checkins: result });
}

// POST /api/checkins
export async function POST(request: NextRequest) {
  const authResponse = requireAdminSession(request);
  if (authResponse) return authResponse;
  await ensureDb();

  const parsed = parseCheckInPayload(await request.json().catch(() => null));
  if (!parsed) {
    return NextResponse.json({ error: "Invalid checkin payload" }, { status: 400 });
  }

  const id = `checkin-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const createdAt = new Date().toISOString();

  // Insert with PostGIS geography point
  await query(
    `INSERT INTO checkins (id, city_id, location, name, date, text, photos, created_at)
     VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography, $5, $6::date, $7, $8::jsonb, $9)`,
    [
      id, parsed.cityId, parsed.lng, parsed.lat,
      parsed.name, dateToSql(parsed.date!), parsed.text || "",
      JSON.stringify(parsed.photos || []), createdAt,
    ],
  );

  const allCheckIns = await readCheckIns();
  const newCheckIn = allCheckIns.find((c) => c.id === id)!;
  return NextResponse.json({ checkin: newCheckIn, checkins: allCheckIns });
}

// PATCH /api/checkins
export async function PATCH(request: NextRequest) {
  const authResponse = requireAdminSession(request);
  if (authResponse) return authResponse;
  await ensureDb();

  const payload = await request.json().catch(() => null);
  if (!isRecord(payload) || typeof payload.id !== "string") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const item = isRecord(payload.checkin) ? payload.checkin : null;
  if (!item) {
    return NextResponse.json({ error: "Missing checkin data" }, { status: 400 });
  }

  const setClauses: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (typeof item.name === "string") { setClauses.push(`name = $${idx++}`); params.push(item.name.trim()); }
  if (typeof item.date === "string") { setClauses.push(`date = $${idx++}::date`); params.push(dateToSql(item.date.trim())); }
  if (typeof item.text === "string") { setClauses.push(`text = $${idx++}`); params.push(item.text.trim()); }
  if (Array.isArray(item.photos)) {
    setClauses.push(`photos = $${idx++}::jsonb`);
    params.push(JSON.stringify(item.photos.filter((p: unknown): p is string => typeof p === "string")));
  }
  if (typeof item.lat === "number" && typeof item.lng === "number") {
    setClauses.push(`location = ST_SetSRID(ST_MakePoint($${idx++},$${idx++}),4326)::geography`);
    params.push(item.lng, item.lat);
  }

  if (setClauses.length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  params.push(payload.id);
  const result = await query(
    `UPDATE checkins SET ${setClauses.join(", ")} WHERE id = $${idx} RETURNING id`,
    params,
  );
  if (result.length === 0) {
    return NextResponse.json({ error: "Checkin not found" }, { status: 404 });
  }

  const allCheckIns = await readCheckIns();
  const updated = allCheckIns.find((c) => c.id === payload.id)!;
  return NextResponse.json({ checkin: updated, checkins: allCheckIns });
}

// DELETE /api/checkins?id=xxx
export async function DELETE(request: NextRequest) {
  const authResponse = requireAdminSession(request);
  if (authResponse) return authResponse;
  await ensureDb();

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id parameter" }, { status: 400 });
  }

  const result = await query("DELETE FROM checkins WHERE id = $1 RETURNING id", [id]);
  if (result.length === 0) {
    return NextResponse.json({ error: "Checkin not found" }, { status: 404 });
  }

  const allCheckIns = await readCheckIns();
  return NextResponse.json({ checkins: allCheckIns });
}
