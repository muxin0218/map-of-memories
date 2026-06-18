"use client";

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

const storageKey = "mapofus:checkins";

export const readCheckIns = (): CheckIn[] => {
    if (typeof window === "undefined") return [];

    try {
        const parsed = JSON.parse(window.localStorage.getItem(storageKey) ?? "[]") as unknown;
        return Array.isArray(parsed) ? parsed.filter((item): item is CheckIn => typeof item === "object" && item !== null && "id" in item) : [];
    } catch {
        return [];
    }
};

export const writeCheckIns = (items: CheckIn[]) => {
    window.localStorage.setItem(storageKey, JSON.stringify(items));
};

export const readCheckInsByCity = (cityId: string): CheckIn[] => {
    return readCheckIns().filter((item) => item.cityId === cityId);
};

export const checkInUpdatedEvent = "mapofus:checkins-updated";

export const notifyCheckInUpdate = () => {
    if (typeof window !== "undefined") {
        window.dispatchEvent(new Event(checkInUpdatedEvent));
    }
};
