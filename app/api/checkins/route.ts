import { NextResponse, type NextRequest } from "next/server";
import { readJsonValue, writeJsonValue } from "@/lib/server/db";
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
    createdAt: string;
}

const checkinsKey = "checkins";

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

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

async function readCheckIns(): Promise<CheckIn[]> {
    return normalizeCheckIns(await readJsonValue(checkinsKey, []));
}

// GET /api/checkins?cityId=xxx — get all checkins, optionally filtered by city
export async function GET(request: NextRequest) {
    const authResponse = requireSiteSession(request);
    if (authResponse) return authResponse;

    const allCheckIns = await readCheckIns();
    const { searchParams } = new URL(request.url);
    const cityId = searchParams.get("cityId");

    const result = cityId
        ? allCheckIns.filter((item) => item.cityId === cityId)
        : allCheckIns;

    return NextResponse.json({ checkins: result });
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

// POST /api/checkins — create a new checkin
export async function POST(request: NextRequest) {
    const authResponse = requireAdminSession(request);
    if (authResponse) return authResponse;

    const parsed = parseCheckInPayload(await request.json().catch(() => null));
    if (!parsed) {
        return NextResponse.json({ error: "Invalid checkin payload" }, { status: 400 });
    }

    const newCheckIn: CheckIn = {
        id: `checkin-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        cityId: parsed.cityId!,
        lat: parsed.lat!,
        lng: parsed.lng!,
        name: parsed.name!,
        date: parsed.date!,
        text: parsed.text || "",
        photos: parsed.photos || [],
        createdAt: new Date().toISOString(),
    };

    const allCheckIns = await readCheckIns();
    allCheckIns.unshift(newCheckIn);
    await writeJsonValue(checkinsKey, allCheckIns);

    return NextResponse.json({ checkin: newCheckIn, checkins: allCheckIns });
}

// PATCH /api/checkins — update a checkin
export async function PATCH(request: NextRequest) {
    const authResponse = requireAdminSession(request);
    if (authResponse) return authResponse;

    const payload = await request.json().catch(() => null);
    if (!isRecord(payload) || typeof payload.id !== "string") {
        return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const item = isRecord(payload.checkin) ? payload.checkin : null;
    if (!item) {
        return NextResponse.json({ error: "Missing checkin data" }, { status: 400 });
    }

    const allCheckIns = await readCheckIns();
    const index = allCheckIns.findIndex((c) => c.id === payload.id);
    if (index === -1) {
        return NextResponse.json({ error: "Checkin not found" }, { status: 404 });
    }

    const updated: CheckIn = {
        ...allCheckIns[index],
        name: typeof item.name === "string" ? item.name.trim() : allCheckIns[index].name,
        date: typeof item.date === "string" ? item.date.trim() : allCheckIns[index].date,
        text: typeof item.text === "string" ? item.text.trim() : allCheckIns[index].text,
        photos: Array.isArray(item.photos)
            ? item.photos.filter((p: unknown): p is string => typeof p === "string")
            : allCheckIns[index].photos,
    };

    allCheckIns[index] = updated;
    await writeJsonValue(checkinsKey, allCheckIns);

    return NextResponse.json({ checkin: updated, checkins: allCheckIns });
}

// DELETE /api/checkins?id=xxx — delete a checkin
export async function DELETE(request: NextRequest) {
    const authResponse = requireAdminSession(request);
    if (authResponse) return authResponse;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
        return NextResponse.json({ error: "Missing id parameter" }, { status: 400 });
    }

    const allCheckIns = await readCheckIns();
    const filtered = allCheckIns.filter((c) => c.id !== id);
    if (filtered.length === allCheckIns.length) {
        return NextResponse.json({ error: "Checkin not found" }, { status: 404 });
    }

    await writeJsonValue(checkinsKey, filtered);

    return NextResponse.json({ checkins: filtered });
}
