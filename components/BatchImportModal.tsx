"use client";

import {
    useState,
    useRef,
    useEffect,
    useCallback,
    type ChangeEvent,
} from "react";
import {
    ImagePlus,
    X,
    Loader2,
    AlertCircle,
    CheckCircle,
    MapPin,
    Upload,
} from "lucide-react";
import exifr from "exifr";
import { cities } from "@/data/cities";
import { readAdminMode, adminModeUpdatedEvent } from "@/data/adminMode";
import { notifyCheckInUpdate } from "@/data/checkins";
import { LocalPrivacyImg } from "@/components/LocalPrivacyImage";

/* ------------------------------------------------------------------ */
/*  Types & helpers                                                    */
/* ------------------------------------------------------------------ */

interface PhotoEntry {
    id: string;
    file: File;
    previewUrl: string;
    compressedDataUrl: string | null;
    lat: number | null;
    lng: number | null;
    date: string;
    name: string;
    text: string;
    cityId: string | null;
    cityName: string | null;
    status: "pending" | "ready" | "error";
    errorMsg?: string;
}

const photoMaxDimension = 900;
const photoQuality = 0.52;

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
    const R = 6371;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function findNearestCity(
    lat: number,
    lng: number
): { cityId: string; cityName: string } | null {
    let best: { cityId: string; cityName: string; dist: number } | null = null;
    for (const c of cities) {
        const dist = haversineKm(lat, lng, c.lat, c.lng);
        if (dist < 100 && (!best || dist < best.dist)) {
            best = { cityId: c.id, cityName: c.name, dist };
        }
    }
    return best ? { cityId: best.cityId, cityName: best.cityName } : null;
}

function nameFromFile(file: File): string {
    const dot = file.name.lastIndexOf(".");
    return dot > 0 ? file.name.slice(0, dot) : file.name;
}

function formatExifDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}.${m}.${day}`;
}

function readCompressedDataUrl(
    file: File
): Promise<string> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new window.Image();
        img.onload = () => {
            URL.revokeObjectURL(url);
            const scale = Math.min(
                1,
                photoMaxDimension / Math.max(img.naturalWidth, img.naturalHeight)
            );
            const w = Math.max(1, Math.round(img.naturalWidth * scale));
            const h = Math.max(1, Math.round(img.naturalHeight * scale));
            const canvas = document.createElement("canvas");
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext("2d");
            if (!ctx) {
                reject(new Error("Canvas unavailable"));
                return;
            }
            ctx.fillStyle = "#FAFBF7";
            ctx.fillRect(0, 0, w, h);
            ctx.drawImage(img, 0, 0, w, h);
            canvas.toBlob(
                (blob) => {
                    if (!blob) {
                        reject(new Error("Compression failed"));
                        return;
                    }
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result as string);
                    reader.onerror = () => reject(new Error("Read failed"));
                    reader.readAsDataURL(blob);
                },
                "image/jpeg",
                photoQuality
            );
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("Image load failed"));
        };
        img.src = url;
    });
}

async function createCheckinApi(checkin: {
    cityId: string;
    lat: number;
    lng: number;
    name: string;
    date: string;
    text: string;
    photos: string[];
}): Promise<boolean> {
    try {
        const res = await fetch("/api/checkins", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ checkin }),
        });
        return res.ok;
    } catch {
        return false;
    }
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface BatchImportModalProps {
    onClose: () => void;
}

export default function BatchImportModal({ onClose }: BatchImportModalProps) {
    const [photos, setPhotos] = useState<PhotoEntry[]>([]);
    const [isAdmin, setIsAdmin] = useState(false);
    const [isParsing, setIsParsing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [saveProgress, setSaveProgress] = useState({ ok: 0, fail: 0, total: 0 });
    const [statusMsg, setStatusMsg] = useState("");
    const fileRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const t = window.setTimeout(() => setIsAdmin(readAdminMode()), 0);
        const h = (e: Event) =>
            setIsAdmin(Boolean((e as CustomEvent<boolean>).detail));
        window.addEventListener(adminModeUpdatedEvent, h);
        return () => {
            window.clearTimeout(t);
            window.removeEventListener(adminModeUpdatedEvent, h);
        };
    }, []);

    /* pick files → parse EXIF → build entries */
    const handlePick = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        setIsParsing(true);
        setStatusMsg("");
        const fileArray = Array.from(files);
        const entries: PhotoEntry[] = [];

        for (const file of fileArray) {
            const previewUrl = URL.createObjectURL(file);
            const name = nameFromFile(file);
            let lat: number | null = null;
            let lng: number | null = null;
            let dateStr = "";
            let cityId: string | null = null;
            let cityName: string | null = null;
            let status: PhotoEntry["status"] = "pending";
            let errorMsg: string | undefined;

            try {
                const gps = await exifr.gps(file);
                if (gps?.latitude != null && gps?.longitude != null) {
                    lat = gps.latitude;
                    lng = gps.longitude;
                    const nearest = findNearestCity(lat, lng);
                    if (nearest) {
                        cityId = nearest.cityId;
                        cityName = nearest.cityName;
                    }
                }

                const exifDate = await exifr.parse(file, ["DateTimeOriginal"]);
                if (exifDate?.DateTimeOriginal) {
                    dateStr = formatExifDate(new Date(exifDate.DateTimeOriginal));
                }
            } catch {
                errorMsg = "EXIF 读取失败";
                status = "error";
            }

            // Mark as "ready" if no error and we have GPS data
            const finalStatus = status === "error" ? "error" : "ready";

            entries.push({
                id: `photo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                file,
                previewUrl,
                compressedDataUrl: null,
                lat,
                lng,
                date: dateStr,
                name,
                text: "",
                cityId,
                cityName,
                status: finalStatus,
                errorMsg,
            });
        }

        setPhotos((prev) => [...prev, ...entries]);
        setIsParsing(false);
        e.target.value = "";
    }, []);

    const removePhoto = (id: string) => {
        setPhotos((prev) => {
            const entry = prev.find((p) => p.id === id);
            if (entry) URL.revokeObjectURL(entry.previewUrl);
            return prev.filter((p) => p.id !== id);
        });
    };

    const updateField = (id: string, field: "name" | "text" | "date", val: string) => {
        setPhotos((prev) =>
            prev.map((p) => (p.id === id ? { ...p, [field]: val } : p))
        );
    };

    /* save all ready entries */
    const handleSaveAll = async () => {
        if (!isAdmin) {
            setStatusMsg("请先进入管理员模式");
            return;
        }

        const ready = photos.filter(
            (p) => p.status === "ready" && p.cityId && p.lat != null && p.lng != null
        );
        if (ready.length === 0) {
            setStatusMsg("没有可导入的打卡记录（请确保照片包含位置信息并能匹配到城市）");
            return;
        }

        setIsSaving(true);
        setSaveProgress({ ok: 0, fail: 0, total: ready.length });
        setStatusMsg("");

        let okCount = 0;
        let failCount = 0;

        for (const entry of ready) {
            setStatusMsg(`正在处理 ${okCount + failCount + 1}/${ready.length} ...`);
            try {
                const compressed = await readCompressedDataUrl(entry.file);
                const success = await createCheckinApi({
                    cityId: entry.cityId!,
                    lat: entry.lat!,
                    lng: entry.lng!,
                    name: entry.name.trim() || nameFromFile(entry.file),
                    date: entry.date,
                    text: entry.text.trim(),
                    photos: [compressed],
                });
                if (success) okCount++;
                else failCount++;
            } catch {
                failCount++;
            }
            setSaveProgress({ ok: okCount, fail: failCount, total: ready.length });
        }

        if (okCount > 0) notifyCheckInUpdate();
        setStatusMsg(
            `导入完成：成功 ${okCount} 条${failCount > 0 ? `，失败 ${failCount} 条` : ""}`
        );
        setIsSaving(false);
    };

    const readyCount = photos.filter(
        (p) => p.status === "ready" && p.cityId
    ).length;
    const noGpsCount = photos.filter(
        (p) => p.status === "ready" && !p.cityId
    ).length;

    return (
        <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#5A6670]/36 px-4 py-8 backdrop-blur-sm"
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-[12px] border border-[#D8DDD8] bg-[#FAFBF7] shadow-[0_24px_48px_rgba(90,102,112,0.18)]">
                {/* header */}
                <div className="flex items-center justify-between border-b border-[#D8DDD8]/70 px-6 py-4">
                    <div>
                        <h2 className="text-base font-semibold text-[#5A6670]">
                            批量导入打卡
                        </h2>
                        <p className="mt-0.5 text-xs text-[#5A6670]/52">
                            从照片 EXIF 提取位置信息，自动创建打卡记录
                        </p>
                    </div>
                    <button
                        className="grid h-8 w-8 place-items-center rounded-[6px] text-[#5A6670]/52 transition hover:bg-[#D8DDD8]/24 hover:text-[#5A6670]"
                        type="button"
                        onClick={onClose}
                        aria-label="关闭"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* body */}
                <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                    {/* admin check */}
                    {!isAdmin && (
                        <div className="mb-4 flex items-center gap-2 rounded-[8px] border border-[#E8B8C2]/50 bg-[#F5DCE0]/28 px-4 py-3 text-sm text-[#E8B8C2]">
                            <AlertCircle className="h-4 w-4 shrink-0" />
                            <span>需要管理员模式才能导入打卡</span>
                        </div>
                    )}

                    {/* upload area */}
                    <div
                        className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[10px] border-2 border-dashed border-[#D8DDD8] bg-[#FAFBF7]/60 px-6 py-8 text-center transition hover:border-[#E8B8C2] hover:bg-[#F5DCE0]/12"
                        onClick={() => fileRef.current?.click()}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") fileRef.current?.click();
                        }}
                    >
                        <Upload className="h-8 w-8 text-[#A8C8DC]" />
                        <p className="text-sm font-semibold text-[#5A6670]/72">
                            点击选择照片
                        </p>
                        <p className="text-xs text-[#5A6670]/46">
                            支持 JPG / PNG / HEIC，将自动读取 GPS 和拍摄时间
                        </p>
                        <input
                            ref={fileRef}
                            className="hidden"
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={handlePick}
                        />
                    </div>

                    {isParsing && (
                        <div className="mt-4 flex items-center justify-center gap-2 py-4 text-sm text-[#5A6670]/62">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            正在读取照片信息...
                        </div>
                    )}

                    {/* photo list */}
                    {photos.length > 0 && (
                        <div className="mt-5 space-y-3">
                            <div className="flex items-center justify-between">
                                <p className="text-sm font-semibold text-[#5A6670]">
                                    已添加 {photos.length} 张照片
                                </p>
                                {noGpsCount > 0 && (
                                    <span className="text-xs text-[#E8B8C2]">
                                        {noGpsCount} 张无位置信息
                                    </span>
                                )}
                            </div>

                            {photos.map((entry) => (
                                <div
                                    key={entry.id}
                                    className="rounded-[8px] border border-[#D8DDD8]/70 bg-[#FAFBF7]/72 p-3"
                                >
                                    <div className="flex gap-3">
                                        {/* thumbnail */}
                                        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-[5px] bg-[#D6E8F0]">
                                            <LocalPrivacyImg
                                                className="h-full w-full object-cover"
                                                src={entry.previewUrl}
                                                alt={entry.name}
                                            />
                                        </div>

                                        <div className="min-w-0 flex-1 space-y-1.5">
                                            {/* name */}
                                            <input
                                                className="w-full rounded-[5px] border border-[#D8DDD8] bg-[#FAFBF7] px-2 py-1 text-sm outline-none transition focus:border-[#E8B8C2]"
                                                value={entry.name}
                                                onChange={(e) =>
                                                    updateField(entry.id, "name", e.target.value)
                                                }
                                                placeholder="地点名称"
                                                disabled={isSaving}
                                            />

                                            {/* date */}
                                            <input
                                                className="w-full rounded-[5px] border border-[#D8DDD8] bg-[#FAFBF7] px-2 py-1 text-sm outline-none transition focus:border-[#E8B8C2]"
                                                value={entry.date}
                                                onChange={(e) =>
                                                    updateField(entry.id, "date", e.target.value)
                                                }
                                                placeholder="2026.06.24"
                                                maxLength={10}
                                                disabled={isSaving}
                                            />

                                            {/* text note */}
                                            <input
                                                className="w-full rounded-[5px] border border-[#D8DDD8] bg-[#FAFBF7] px-2 py-1 text-sm outline-none transition focus:border-[#E8B8C2]"
                                                value={entry.text}
                                                onChange={(e) =>
                                                    updateField(entry.id, "text", e.target.value)
                                                }
                                                placeholder="备注（可选）"
                                                disabled={isSaving}
                                            />

                                            {/* city & GPS status */}
                                            <div className="flex items-center gap-2 text-xs">
                                                {entry.cityId ? (
                                                    <span className="inline-flex items-center gap-1 rounded-[4px] bg-[#F0DEC4]/38 px-2 py-0.5 font-semibold text-[#D4A574]">
                                                        <MapPin className="h-3 w-3" />
                                                        {entry.cityName}
                                                    </span>
                                                ) : entry.lat != null ? (
                                                    <span className="inline-flex items-center gap-1 rounded-[4px] bg-[#E8B8C2]/18 px-2 py-0.5 text-[#E8B8C2]">
                                                        <AlertCircle className="h-3 w-3" />
                                                        未匹配到城市
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 rounded-[4px] bg-[#D8DDD8]/38 px-2 py-0.5 text-[#5A6670]/52">
                                                        无位置信息
                                                    </span>
                                                )}
                                                {entry.lat != null && (
                                                    <span className="text-[#5A6670]/42">
                                                        {entry.lat.toFixed(4)}, {entry.lng?.toFixed(4)}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* remove */}
                                        <button
                                            className="h-6 w-6 shrink-0 rounded-[4px] text-[#5A6670]/36 transition hover:bg-[#D8DDD8]/24 hover:text-[#E8B8C2] disabled:opacity-30"
                                            type="button"
                                            onClick={() => removePhoto(entry.id)}
                                            disabled={isSaving}
                                            aria-label="移除"
                                        >
                                            <X className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* save progress */}
                    {isSaving && (
                        <div className="mt-4 rounded-[8px] border border-[#A8C8DC]/50 bg-[#D6E8F0]/24 px-4 py-3">
                            <div className="flex items-center gap-2 text-sm text-[#5A6670]">
                                <Loader2 className="h-4 w-4 animate-spin text-[#A8C8DC]" />
                                {statusMsg}
                            </div>
                            <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#D8DDD8]/48">
                                <div
                                    className="h-full rounded-full bg-[#A8C8DC] transition-all duration-300"
                                    style={{
                                        width: `${saveProgress.total > 0
                                            ? ((saveProgress.ok + saveProgress.fail) /
                                                saveProgress.total) *
                                            100
                                            : 0
                                            }%`,
                                    }}
                                />
                            </div>
                            <p className="mt-1 text-xs text-[#5A6670]/48">
                                成功 {saveProgress.ok} / 失败 {saveProgress.fail}
                            </p>
                        </div>
                    )}

                    {/* status message */}
                    {statusMsg && !isSaving && (
                        <div className="mt-4 flex items-center gap-2 rounded-[8px] border border-[#D4E8D0]/60 bg-[#D4E8D0]/18 px-4 py-3 text-sm text-[#5A6670]">
                            <CheckCircle className="h-4 w-4 shrink-0 text-[#A8C89A]" />
                            {statusMsg}
                        </div>
                    )}
                </div>

                {/* footer */}
                <div className="flex items-center justify-end gap-3 border-t border-[#D8DDD8]/70 px-6 py-4">
                    <button
                        className="rounded-[7px] border border-[#D8DDD8] px-4 py-2 text-sm font-semibold text-[#5A6670]/62 transition hover:bg-[#D8DDD8]/18 hover:text-[#5A6670] disabled:opacity-40"
                        type="button"
                        onClick={onClose}
                        disabled={isSaving}
                    >
                        取消
                    </button>
                    <button
                        className="flex items-center gap-2 rounded-[7px] bg-[#F5DCE0] px-5 py-2 text-sm font-semibold text-[#E8B8C2] transition hover:bg-[#E8B8C2] hover:text-[#FAFBF7] disabled:opacity-45"
                        type="button"
                        onClick={() => void handleSaveAll()}
                        disabled={
                            !isAdmin ||
                            isSaving ||
                            isParsing ||
                            readyCount === 0
                        }
                    >
                        {isSaving ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <MapPin className="h-4 w-4" />
                        )}
                        {isSaving
                            ? `导入中 ${saveProgress.ok + saveProgress.fail}/${saveProgress.total}`
                            : `批量导入 (${readyCount} 条)`}
                    </button>
                </div>
            </div>
        </div>
    );
}
