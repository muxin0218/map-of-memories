import { NextResponse, type NextRequest } from "next/server";
import { cities } from "@/data/cities";
import {
  readJsonValue,
  uploadDataImage,
  writeJsonValue,
} from "@/lib/server/db";
import { isLocalPrivacyRequest, localPrivacyImagePlaceholder } from "@/lib/localPrivacy";
import { getMissingAuthEnv, hasSiteSession, requireAdminSession } from "@/lib/server/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CityAssetStore = Record<string, string>;

const cityAssetStoreKey = "city-assets";
const imageMaxLength = 12_000_000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isAllowedImage = (value: string) =>
  value.length <= imageMaxLength &&
  (value.startsWith("/sprites/") || value.startsWith("https://") || value.startsWith("data:image/"));

function normalizeCityAssetStore(value: unknown): CityAssetStore {
  if (!isRecord(value)) return {};

  return Object.fromEntries(
    Object.entries(value).filter(([cityId, image]) =>
      cities.some((city) => city.id === cityId) && typeof image === "string" && isAllowedImage(image),
    ),
  ) as CityAssetStore;
}

async function readCityAssetStore(): Promise<CityAssetStore> {
  return normalizeCityAssetStore(await readJsonValue(cityAssetStoreKey, {}));
}

async function writeCityAssetStore(store: CityAssetStore) {
  await writeJsonValue(cityAssetStoreKey, store);
}

function parseCityAssetPayload(payload: unknown) {
  if (!isRecord(payload)) return null;

  const cityId = payload.cityId;
  const image = payload.image;

  if (
    typeof cityId !== "string" ||
    typeof image !== "string" ||
    !cities.some((city) => city.id === cityId) ||
    !isAllowedImage(image)
  ) {
    return null;
  }

  return { cityId, image };
}

function parseCityPayload(payload: unknown) {
  if (!isRecord(payload) || typeof payload.cityId !== "string") return null;
  if (!cities.some((city) => city.id === payload.cityId)) return null;

  return { cityId: payload.cityId };
}

const maskCityAssets = (assets: CityAssetStore): CityAssetStore =>
  Object.fromEntries(Object.keys(assets).map((cityId) => [cityId, localPrivacyImagePlaceholder]));

export async function GET(request: NextRequest) {
  if (getMissingAuthEnv().length > 0 || !hasSiteSession(request)) {
    return NextResponse.json({ assets: {} });
  }

  const assets = await readCityAssetStore();

  return NextResponse.json({ assets: isLocalPrivacyRequest(request) ? maskCityAssets(assets) : assets });
}

export async function PUT(request: NextRequest) {
  const authResponse = requireAdminSession(request);
  if (authResponse) return authResponse;

  const payload = parseCityAssetPayload(await request.json().catch(() => null));

  if (!payload) {
    return NextResponse.json({ error: "Invalid city asset payload" }, { status: 400 });
  }

  const assets = await readCityAssetStore();
  const image = await uploadDataImage(payload.image, `city-assets/${payload.cityId}`, "landmark");
  const nextAssets = { ...assets, [payload.cityId]: image };

  await writeCityAssetStore(nextAssets);

  return NextResponse.json({ assets: nextAssets });
}

export async function PATCH(request: NextRequest) {
  const authResponse = requireAdminSession(request);
  if (authResponse) return authResponse;

  const payload = await request.json().catch(() => null);

  if (!isRecord(payload) || !isRecord(payload.assets)) {
    return NextResponse.json({ error: "Invalid city asset store payload" }, { status: 400 });
  }

  const normalizedAssets = normalizeCityAssetStore(payload.assets);
  const nextAssets = Object.fromEntries(
    await Promise.all(
      Object.entries(normalizedAssets).map(async ([cityId, image]) => [
        cityId,
        await uploadDataImage(image, `city-assets/${cityId}`, "landmark"),
      ]),
    ),
  );

  await writeCityAssetStore(nextAssets);

  return NextResponse.json({ assets: nextAssets });
}

export async function DELETE(request: NextRequest) {
  const authResponse = requireAdminSession(request);
  if (authResponse) return authResponse;

  const payload = parseCityPayload(await request.json().catch(() => null));

  if (!payload) {
    return NextResponse.json({ error: "Invalid city asset payload" }, { status: 400 });
  }

  const assets = await readCityAssetStore();
  const nextAssets = { ...assets };
  delete nextAssets[payload.cityId];

  await writeCityAssetStore(nextAssets);

  return NextResponse.json({ assets: nextAssets });
}
