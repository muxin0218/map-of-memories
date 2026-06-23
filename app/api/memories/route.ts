import { NextResponse, type NextRequest } from "next/server";
import { cities } from "@/data/cities";
import type { Memory } from "@/data/memories";
import {
  ensureSchema,
  isDbConfigured,
  query,
  uploadDataImage,
} from "@/lib/server/db";
import { isLocalPrivacyRequest, localPrivacyImagePlaceholder } from "@/lib/localPrivacy";
import { requireAdminSession, requireSiteSession } from "@/lib/server/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const memoryTextMaxLength = 80;
const imageMaxLength = 12_000_000;
const maxPhotosPerMemory = 24;

// Ensure schema on first request
let schemaEnsured = false;
async function ensureDb() {
  if (!schemaEnsured) { await ensureSchema(); schemaEnsured = true; }
}

// ---- Date helpers (same as before) ----

const normalizeMemoryDate = (value: string) => {
  const match = value.match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})$/);
  if (!match) return null;
  const [, rawYear, rawMonth, rawDay] = match;
  const year = Number(rawYear);
  const month = Number(rawMonth);
  const day = Number(rawDay);
  const date = new Date(Date.UTC(year, month - 1, day));
  const isValid = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  if (!isValid) return null;
  return `${rawYear}.${String(month).padStart(2, "0")}.${String(day).padStart(2, "0")}`;
};

function dateToSql(dateStr: string): string {
  return dateStr.replace(/\./g, "-");
}

// ---- Validation helpers (same as before) ----

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isAllowedImage = (value: string) =>
  value.length <= imageMaxLength &&
  (value.startsWith("/photos/") ||
    value.startsWith("/sprites/") ||
    value.startsWith("https://") ||
    value.startsWith("data:image/"));

const normalizePhotos = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  return value.filter((photo): photo is string => typeof photo === "string" && isAllowedImage(photo));
};

// ---- DB helpers ----

async function readAllMemories(): Promise<Memory[]> {
  const rows = await query<{
    id: string; city_id: string; city_name: string; city_en: string;
    date: string; text: string; image: string; photos: string[];
    draft: boolean; created_at: string;
  }>("SELECT * FROM memories ORDER BY date DESC, created_at DESC");
  return rows.map(rowToMemory);
}

function rowToMemory(row: Record<string, unknown>): Memory {
  const d = new Date(row.date as string);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return {
    id: row.id as string,
    cityId: row.city_id as string,
    city: (row.city_name as string) ?? "",
    cityEn: (row.city_en as string) ?? "",
    date: `${y}.${m}.${day}`,
    text: row.text as string,
    image: row.image as string,
    photos: (row.photos as string[]) ?? [],
    createdAt: (row.created_at as string) ?? new Date(0).toISOString(),
    draft: (row.draft as boolean) ?? false,
  };
}

async function insertMemory(memory: Memory): Promise<void> {
  await query(
    `INSERT INTO memories (id, city_id, city_name, city_en, date, text, image, photos, draft, created_at)
     VALUES ($1,$2,$3,$4,$5::date,$6,$7,$8::jsonb,$9,$10)
     ON CONFLICT (id) DO UPDATE SET
       city_name = EXCLUDED.city_name, city_en = EXCLUDED.city_en,
       date = EXCLUDED.date, text = EXCLUDED.text, image = EXCLUDED.image,
       photos = EXCLUDED.photos, draft = EXCLUDED.draft`,
    [
      memory.id, memory.cityId, memory.city, memory.cityEn,
      dateToSql(memory.date), memory.text, memory.image,
      JSON.stringify(memory.photos ?? []),
      memory.draft ?? false, memory.createdAt ?? new Date().toISOString(),
    ],
  );
}

async function updateMemory(id: string, updates: Record<string, unknown>): Promise<boolean> {
  const setClauses: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (updates.text !== undefined) { setClauses.push(`text = $${idx++}`); params.push(updates.text); }
  if (updates.image !== undefined) { setClauses.push(`image = $${idx++}`); params.push(updates.image); }
  if (updates.photos !== undefined) { setClauses.push(`photos = $${idx++}::jsonb`); params.push(JSON.stringify(updates.photos)); }
  if (updates.date !== undefined) { setClauses.push(`date = $${idx++}::date`); params.push(dateToSql(updates.date as string)); }
  if (updates.draft !== undefined) { setClauses.push(`draft = $${idx++}`); params.push(updates.draft); }

  if (setClauses.length === 0) return true;
  params.push(id);
  await query(`UPDATE memories SET ${setClauses.join(", ")} WHERE id = $${idx}`, params);
  return true;
}

async function deleteMemory(id: string): Promise<void> {
  await query("DELETE FROM memories WHERE id = $1", [id]);
}

// ---- Image upload (same as before, calls db.uploadDataImage) ----

async function uploadMemoryImages(memory: Memory): Promise<Memory> {
  const photos = await Promise.all(
    (memory.photos?.length ? memory.photos : [memory.image]).map((photo, index) =>
      uploadDataImage(photo, `memories/${memory.cityId}/${memory.id}`, `photo-${index + 1}`),
    ),
  );
  const image = photos.includes(memory.image)
    ? memory.image
    : memory.image.startsWith("data:image/")
      ? photos[0]
      : memory.image;
  return { ...memory, image, photos };
}

// ---- Payload parsers (same as before) ----

function parseMemoryPayload(payload: unknown): Memory | null {
  if (!isRecord(payload) || !isRecord(payload.memory)) return null;
  const cityId = payload.memory.cityId;
  const date = payload.memory.date;
  const text = payload.memory.text;
  const image = payload.memory.image;
  const photos = normalizePhotos(payload.memory.photos).slice(0, maxPhotosPerMemory);
  if (typeof cityId !== "string" || typeof date !== "string" || typeof text !== "string" || (typeof image !== "string" && photos.length === 0)) return null;
  const city = cities.find((candidate) => candidate.id === cityId);
  const trimmedDate = date.trim();
  const trimmedText = text.trim();
  const normalizedDate = normalizeMemoryDate(trimmedDate);
  if (!city || !normalizedDate || trimmedText.length === 0 || trimmedText.length > memoryTextMaxLength || (typeof image === "string" && image.length > 0 && !isAllowedImage(image))) return null;
  const coverImage = photos[0] ?? image ?? city.sprite;
  return {
    id: `city-${cityId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    cityId: city.id, city: city.name, cityEn: city.nameEn,
    date: normalizedDate, image: coverImage, photos, text: trimmedText,
    createdAt: new Date().toISOString(),
  };
}

function parseEditPayload(payload: unknown): { cityId: string; memoryId: string; updates: Record<string, unknown> } | null {
  if (!isRecord(payload)) return null;
  const memoryId = typeof payload.memoryId === "string" ? payload.memoryId : null;
  const cityId = typeof payload.cityId === "string" ? payload.cityId : null;
  const text = typeof payload.text === "string" ? payload.text.trim() : null;
  const image = typeof payload.image === "string" ? payload.image : null;
  const photos = normalizePhotos(payload.photos).slice(0, maxPhotosPerMemory);
  if (!memoryId || !cityId) return null;
  if (!text && !image && photos.length === 0) return null;
  const updates: Record<string, unknown> = {};
  if (text) { if (text.length > memoryTextMaxLength) return null; updates.text = text; }
  if (image) { if (!isAllowedImage(image)) return null; updates.image = image; }
  if (photos.length > 0) updates.photos = photos;
  return { cityId, memoryId, updates };
}

function parseCoverPayload(payload: unknown): { cityId: string; memoryId: string; coverImage: string } | null {
  if (!isRecord(payload) || typeof payload.cityId !== "string" || typeof payload.memoryId !== "string" || typeof payload.coverImage !== "string") return null;
  return { cityId: payload.cityId, memoryId: payload.memoryId, coverImage: payload.coverImage };
}

function parseDeletePayload(payload: unknown): { cityId: string; memoryId: string } | null {
  if (!isRecord(payload) || typeof payload.cityId !== "string" || typeof payload.memoryId !== "string") return null;
  return { cityId: payload.cityId, memoryId: payload.memoryId };
}

// ---- Mask helpers (same as before) ----

function maskMemoryPhotos(memories: Memory[]): Memory[] {
  return memories.map((memory) => ({
    ...memory,
    image: localPrivacyImagePlaceholder,
    photos: memory.photos?.map(() => localPrivacyImagePlaceholder) ?? [localPrivacyImagePlaceholder],
  }));
}

function maskMemoryStore(store: Record<string, Memory[]>): Record<string, Memory[]> {
  return Object.fromEntries(
    Object.entries(store).map(([cityId, memories]) => [cityId, maskMemoryPhotos(memories)]),
  );
}

// ---- Handlers ----

export async function GET(request: NextRequest) {
  const authResponse = requireSiteSession(request);
  if (authResponse) return authResponse;
  await ensureDb();

  const allRows = await readAllMemories();
  // Group by cityId to maintain backward-compatible response shape
  const store: Record<string, Memory[]> = {};
  for (const m of allRows) {
    if (!store[m.cityId]) store[m.cityId] = [];
    store[m.cityId].push(m);
  }

  return NextResponse.json({ memories: isLocalPrivacyRequest(request) ? maskMemoryStore(store) : store });
}

export async function POST(request: NextRequest) {
  const authResponse = requireAdminSession(request);
  if (authResponse) return authResponse;
  await ensureDb();

  const parsedMemory = parseMemoryPayload(await request.json().catch(() => null));
  if (!parsedMemory) return NextResponse.json({ error: "Invalid memory payload" }, { status: 400 });

  const memory = await uploadMemoryImages(parsedMemory);
  await insertMemory(memory);

  const allRows = await readAllMemories();
  const store: Record<string, Memory[]> = {};
  for (const m of allRows) {
    if (!store[m.cityId]) store[m.cityId] = [];
    store[m.cityId].push(m);
  }
  return NextResponse.json({ memory, memories: store });
}

export async function PUT(request: NextRequest) {
  const authResponse = requireAdminSession(request);
  if (authResponse) return authResponse;
  await ensureDb();

  const payload = await request.json().catch(() => null);
  if (!isRecord(payload) || !isRecord(payload.memories)) {
    return NextResponse.json({ error: "Invalid memory store payload" }, { status: 400 });
  }

  // Process bulk update: upsert all memories from payload
  for (const [cityId, entries] of Object.entries(payload.memories as Record<string, unknown>)) {
    const city = cities.find((c) => c.id === cityId);
    if (!city) continue;
    const mems = Array.isArray(entries) ? entries : [entries];
    for (const entry of mems) {
      if (!isRecord(entry)) continue;
      const memory: Memory = {
        id: typeof entry.id === "string" ? entry.id : `${cityId}-bulk-${Date.now()}`,
        cityId, city: city.name, cityEn: city.nameEn,
        date: typeof entry.date === "string" ? entry.date : "待添加日期",
        text: typeof entry.text === "string" ? entry.text.trim() : "",
        image: typeof entry.image === "string" ? entry.image : city.sprite,
        photos: normalizePhotos(entry.photos),
        createdAt: typeof entry.createdAt === "string" ? entry.createdAt : new Date().toISOString(),
        draft: entry.draft === true,
      };
      const uploaded = await uploadMemoryImages(memory);
      await insertMemory(uploaded);
    }
  }

  const allRows = await readAllMemories();
  const store: Record<string, Memory[]> = {};
  for (const m of allRows) {
    if (!store[m.cityId]) store[m.cityId] = [];
    store[m.cityId].push(m);
  }
  return NextResponse.json({ memories: store });
}

export async function PATCH(request: NextRequest) {
  const authResponse = requireAdminSession(request);
  if (authResponse) return authResponse;
  await ensureDb();

  const rawPayload = await request.json().catch(() => null);
  const editPayload = parseEditPayload(rawPayload);

  if (editPayload) {
    const memory = (await query<{ id: string; city_id: string; city_name: string; city_en: string; date: string; text: string; image: string; photos: string[]; draft: boolean; created_at: string }>(
      "SELECT * FROM memories WHERE id = $1", [editPayload.memoryId],
    ))[0];
    if (!memory) return NextResponse.json({ error: "Memory not found" }, { status: 404 });

    await updateMemory(editPayload.memoryId, editPayload.updates);
    const updated = (await query("SELECT * FROM memories WHERE id = $1", [editPayload.memoryId]))[0];
    return NextResponse.json({ memory: rowToMemory(updated), memories: {} });
  }

  const payload = parseCoverPayload(rawPayload);
  if (!payload) return NextResponse.json({ error: "Invalid memory payload" }, { status: 400 });

  const existing = (await query("SELECT * FROM memories WHERE id = $1", [payload.memoryId]))[0];
  if (!existing) return NextResponse.json({ error: "Memory not found" }, { status: 404 });

  const photos = (existing.photos as string[]) ?? [];
  const image = existing.image as string;
  const allPhotos = photos.length > 0 ? photos : [image];
  if (!allPhotos.includes(payload.coverImage)) {
    return NextResponse.json({ error: "Cover image must be one of the memory photos" }, { status: 400 });
  }

  await query("UPDATE memories SET image = $1 WHERE id = $2", [payload.coverImage, payload.memoryId]);
  const updated = (await query("SELECT * FROM memories WHERE id = $1", [payload.memoryId]))[0];
  return NextResponse.json({ memory: rowToMemory(updated), memories: {} });
}

export async function DELETE(request: NextRequest) {
  const authResponse = requireAdminSession(request);
  if (authResponse) return authResponse;
  await ensureDb();

  const payload = parseDeletePayload(await request.json().catch(() => null));
  if (!payload) return NextResponse.json({ error: "Invalid delete payload" }, { status: 400 });

  const existing = await query("SELECT id FROM memories WHERE id = $1", [payload.memoryId]);
  if (existing.length === 0) return NextResponse.json({ error: "Memory not found" }, { status: 404 });

  await deleteMemory(payload.memoryId);

  const allRows = await readAllMemories();
  const store: Record<string, Memory[]> = {};
  for (const m of allRows) {
    if (!store[m.cityId]) store[m.cityId] = [];
    store[m.cityId].push(m);
  }
  return NextResponse.json({ memories: store });
}
