"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import {
    MapContainer,
    TileLayer,
    Marker,
    Popup,
    useMap,
    useMapEvents,
    Circle,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { ImagePlus, MapPin, Pencil, Satellite, Trash2, X } from "lucide-react";
import { cities } from "@/data/cities";
import type { CheckIn } from "@/data/checkins";
import { checkInUpdatedEvent, notifyCheckInUpdate } from "@/data/checkins";
import { adminModeUpdatedEvent, readAdminMode } from "@/data/adminMode";
import { LocalPrivacyImg } from "@/components/LocalPrivacyImage";

const defaultIcon = L.icon({
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
});

L.Marker.prototype.options.icon = defaultIcon;

const heartIcon = L.divIcon({
    className: "checkin-marker-icon",
    html: '<svg viewBox="0 0 24 24" width="28" height="28" fill="#E8B8C2" stroke="#FAFBF7" stroke-width="2"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -18],
});

const photoMaxDimension = 900;
const photoQuality = 0.52;

async function readCompressedImageDataUrl(
    file: File,
    { maxDimension, quality }: { maxDimension: number; quality: number }
) {
    return new Promise<string>((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const image = new window.Image();
        image.onload = () => {
            URL.revokeObjectURL(url);
            const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
            const width = Math.max(1, Math.round(image.naturalWidth * scale));
            const height = Math.max(1, Math.round(image.naturalHeight * scale));
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            if (!ctx) { reject(new Error("Canvas unavailable")); return; }
            ctx.fillStyle = "#FAFBF7";
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(image, 0, 0, width, height);
            canvas.toBlob((blob) => {
                if (!blob) { reject(new Error("Compression failed")); return; }
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = () => reject(new Error("Read failed"));
                reader.readAsDataURL(blob);
            }, "image/jpeg", quality);
        };
        image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Image load failed")); };
        image.src = url;
    });
}

interface CityDetailMapProps {
    cityId: string;
}

function MapClickHandler({
    onMapClick,
}: {
    onMapClick: (lat: number, lng: number) => void;
}) {
    useMapEvents({
        click(e) {
            onMapClick(e.latlng.lat, e.latlng.lng);
        },
    });
    return null;
}

function FitBoundsOnLoad({ cityId }: { cityId: string }) {
    const map = useMap();
    const city = cities.find((c) => c.id === cityId);

    useEffect(() => {
        if (city) {
            map.setView([city.lat, city.lng], 13);
        }
    }, [map, city]);

    return null;
}

const amapTileUrl = "https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}";
const amapSatelliteUrl = "https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}";
const amapSubdomains = "1234";

async function fetchCheckIns(cityId: string): Promise<CheckIn[]> {
    try {
        const res = await fetch(`/api/checkins?cityId=${encodeURIComponent(cityId)}`);
        if (!res.ok) return [];
        const data = await res.json();
        return data.checkins ?? [];
    } catch {
        return [];
    }
}

async function createCheckIn(checkin: Omit<CheckIn, "id" | "createdAt">): Promise<CheckIn | null> {
    try {
        const res = await fetch("/api/checkins", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ checkin }),
        });
        if (!res.ok) return null;
        const data = await res.json();
        return data.checkin ?? null;
    } catch {
        return null;
    }
}

async function updateCheckIn(id: string, checkin: Partial<CheckIn>): Promise<CheckIn | null> {
    try {
        const res = await fetch("/api/checkins", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, checkin }),
        });
        if (!res.ok) return null;
        const data = await res.json();
        return data.checkin ?? null;
    } catch {
        return null;
    }
}

async function deleteCheckInApi(id: string): Promise<boolean> {
    try {
        const res = await fetch(`/api/checkins?id=${encodeURIComponent(id)}`, {
            method: "DELETE",
        });
        return res.ok;
    } catch {
        return false;
    }
}

export default function CityDetailMap({ cityId }: CityDetailMapProps) {
    const city = cities.find((c) => c.id === cityId);
    const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
    const [isAdmin, setIsAdmin] = useState(false);
    const [satellite, setSatellite] = useState(false);
    const [newPoint, setNewPoint] = useState<{ lat: number; lng: number } | null>(null);
    const [formName, setFormName] = useState("");
    const [formDate, setFormDate] = useState("");
    const [formText, setFormText] = useState("");
    const [formPhotos, setFormPhotos] = useState<string[]>([]);
    const [formPhotoFiles, setFormPhotoFiles] = useState<File[]>([]);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [status, setStatus] = useState("");
    const fileInputRef = useRef<HTMLInputElement>(null);

    const loadCheckIns = useCallback(async () => {
        const items = await fetchCheckIns(cityId);
        setCheckIns(items);
    }, [cityId]);

    useEffect(() => {
        loadCheckIns();
        const timer = window.setTimeout(() => setIsAdmin(readAdminMode()), 0);
        const handleAdmin = (e: Event) => setIsAdmin(Boolean((e as CustomEvent<boolean>).detail));
        const handleUpdate = () => loadCheckIns();
        window.addEventListener(adminModeUpdatedEvent, handleAdmin);
        window.addEventListener(checkInUpdatedEvent, handleUpdate);
        return () => {
            window.clearTimeout(timer);
            window.removeEventListener(adminModeUpdatedEvent, handleAdmin);
            window.removeEventListener(checkInUpdatedEvent, handleUpdate);
        };
    }, [cityId, loadCheckIns]);

    const today = new Date().toISOString().slice(0, 10);
    const formattedToday = `${today.slice(0, 4)}.${today.slice(5, 7)}.${today.slice(8, 10)}`;

    const handleMapClick = (lat: number, lng: number) => {
        setNewPoint({ lat, lng });
        setFormName("");
        setFormDate(formattedToday);
        setFormText("");
        setFormPhotos([]);
        setFormPhotoFiles([]);
        setEditingId(null);
        setStatus("");
    };

    const handlePhotoPick = async (e: ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        setFormPhotoFiles((prev) => [...prev, ...Array.from(files)]);
        for (const file of Array.from(files)) {
            try {
                const dataUrl = await readCompressedImageDataUrl(file, {
                    maxDimension: photoMaxDimension,
                    quality: photoQuality,
                });
                setFormPhotos((prev) => [...prev, dataUrl]);
            } catch {
                setStatus("照片读取失败");
            }
        }
        e.target.value = "";
    };

    const removePhoto = (index: number) => {
        setFormPhotos((prev) => prev.filter((_, i) => i !== index));
        setFormPhotoFiles((prev) => prev.filter((_, i) => i !== index));
    };

    const saveCheckIn = async () => {
        if (!isAdmin) { setStatus("请先进入管理员模式"); return; }
        if (!newPoint && !editingId) { setStatus("请在地图上选择一个位置"); return; }
        if (!formName.trim()) { setStatus("请输入地点名称"); return; }

        setIsSaving(true);

        if (editingId) {
            const updated = await updateCheckIn(editingId, {
                name: formName.trim(),
                date: formDate,
                text: formText.trim(),
                photos: formPhotos,
            });
            if (!updated) {
                setStatus("保存失败");
                setIsSaving(false);
                return;
            }
            setEditingId(null);
        } else if (newPoint) {
            const created = await createCheckIn({
                cityId,
                lat: newPoint.lat,
                lng: newPoint.lng,
                name: formName.trim(),
                date: formDate,
                text: formText.trim(),
                photos: formPhotos,
            });
            if (!created) {
                setStatus("保存失败");
                setIsSaving(false);
                return;
            }
            setNewPoint(null);

            // Also create a memory entry so the city lights up on the main map
            const coverImage = formPhotos[0] ?? city!.sprite;
            try {
                await fetch("/api/memories", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        memory: {
                            cityId,
                            date: formDate,
                            text: formName.trim(),
                            image: coverImage,
                            photos: formPhotos,
                        },
                    }),
                });
            } catch {
                // Non-critical: memory creation failure shouldn't block the check-in
            }
        }

        await loadCheckIns();
        notifyCheckInUpdate();
        resetForm();
        setIsSaving(false);
        setStatus("已保存");
    };

    const editCheckIn = (item: CheckIn) => {
        setNewPoint(null);
        setEditingId(item.id);
        setFormName(item.name);
        setFormDate(item.date);
        setFormText(item.text);
        setFormPhotos(item.photos);
        setFormPhotoFiles([]);
        setStatus("");
    };

    const deleteCheckIn = async (id: string) => {
        if (!isAdmin) { setStatus("请先进入管理员模式"); return; }
        const ok = await deleteCheckInApi(id);
        if (!ok) {
            setStatus("删除失败");
            return;
        }
        await loadCheckIns();
        notifyCheckInUpdate();
        if (editingId === id) resetForm();
        setStatus("已删除");
    };

    const resetForm = () => {
        setNewPoint(null);
        setEditingId(null);
        setFormName("");
        setFormDate(formattedToday);
        setFormText("");
        setFormPhotos([]);
        setFormPhotoFiles([]);
    };

    if (!city) {
        return (
            <div className="flex h-[60vh] items-center justify-center text-[#5A6670]/60">
                未找到该城市
            </div>
        );
    }

    return (
        <div className="flex h-[calc(100vh-120px)] flex-col gap-4 lg:flex-row">
            {/* Map */}
            <div className="relative min-h-[400px] flex-1 overflow-hidden rounded-[8px] border border-[#D8DDD8]/80 shadow-[0_12px_28px_rgba(90,102,112,0.06)]">
                <button
                    className="absolute left-3 top-3 z-[1000] flex items-center gap-1.5 rounded-[6px] border border-[#D8DDD8]/72 bg-[#FAFBF7]/88 px-3 py-1.5 text-xs font-semibold text-[#5A6670]/70 shadow-[0_4px_12px_rgba(90,102,112,0.06)] backdrop-blur transition hover:bg-[#FAFBF7]"
                    type="button"
                    onClick={() => setSatellite((v) => !v)}
                >
                    <Satellite className="h-3.5 w-3.5" />
                    {satellite ? "普通地图" : "卫星地图"}
                </button>
                <MapContainer
                    center={[city.lat, city.lng]}
                    zoom={13}
                    className="h-full w-full"
                    zoomControl={true}
                >
                    <TileLayer
                        attribution='&copy; 高德地图'
                        url={satellite ? amapSatelliteUrl : amapTileUrl}
                        subdomains={amapSubdomains}
                    />
                    <FitBoundsOnLoad cityId={cityId} />
                    <MapClickHandler onMapClick={handleMapClick} />

                    <Circle
                        center={[city.lat, city.lng]}
                        radius={10000}
                        pathOptions={{
                            color: "#E8B8C2",
                            fillColor: "#F5DCE0",
                            fillOpacity: 0.1,
                            weight: 2,
                            dashArray: "6, 6",
                        }}
                    />

                    {checkIns.map((item) => (
                        <Marker
                            key={item.id}
                            position={[item.lat, item.lng]}
                            icon={heartIcon}
                        >
                            <Popup>
                                <div className="min-w-[180px]">
                                    <p className="font-semibold text-[#5A6670]">{item.name}</p>
                                    <p className="mt-1 text-xs text-[#5A6670]/60">{item.date}</p>
                                    {item.text && (
                                        <p className="mt-1 text-sm text-[#5A6670]/80">{item.text}</p>
                                    )}
                                    {item.photos.length > 0 && (
                                        <div className="mt-2 grid grid-cols-3 gap-1">
                                            {item.photos.slice(0, 3).map((photo, i) => (
                                                <img
                                                    key={i}
                                                    src={photo}
                                                    alt=""
                                                    className="h-16 w-full rounded object-cover"
                                                />
                                            ))}
                                        </div>
                                    )}
                                    {isAdmin && (
                                        <div className="mt-2 flex gap-2 border-t border-[#D8DDD8]/50 pt-2">
                                            <button
                                                className="flex items-center gap-1 text-xs text-[#A8C8DC] transition hover:text-[#5A6670]"
                                                onClick={() => editCheckIn(item)}
                                                type="button"
                                            >
                                                <Pencil className="h-3 w-3" /> 编辑
                                            </button>
                                            <button
                                                className="flex items-center gap-1 text-xs text-[#E8B8C2] transition hover:text-[#c990a0]"
                                                onClick={() => deleteCheckIn(item.id)}
                                                type="button"
                                            >
                                                <Trash2 className="h-3 w-3" /> 删除
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </Popup>
                        </Marker>
                    ))}

                    {newPoint && (
                        <Marker position={[newPoint.lat, newPoint.lng]} icon={defaultIcon}>
                            <Popup>
                                <p className="text-sm text-[#5A6670]">新打卡位置</p>
                                <p className="text-xs text-[#5A6670]/60">
                                    {newPoint.lat.toFixed(4)}, {newPoint.lng.toFixed(4)}
                                </p>
                            </Popup>
                        </Marker>
                    )}
                </MapContainer>
            </div>

            {/* Form panel */}
            <div className="w-full shrink-0 rounded-[8px] border border-[#D8DDD8]/78 bg-[#FAFBF7]/76 p-5 shadow-[0_12px_28px_rgba(90,102,112,0.06)] lg:w-[340px]">
                <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-[#5A6670]">
                        {editingId ? "编辑打卡" : newPoint ? "添加打卡" : "点击地图选点"}
                    </p>
                    {!isAdmin && (
                        <span className="text-xs font-semibold text-[#5A6670]/42">管理员锁定</span>
                    )}
                </div>

                {newPoint && (
                    <p className="mt-2 text-xs text-[#A8C8DC]">
                        已选位置: {newPoint.lat.toFixed(4)}, {newPoint.lng.toFixed(4)}
                    </p>
                )}

                <input
                    className="mt-4 w-full rounded-[7px] border border-[#D8DDD8] bg-[#FAFBF7] px-3 py-2 text-sm outline-none transition focus:border-[#E8B8C2]"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="地点名称（如：小区门口的咖啡店）"
                    disabled={!isAdmin || (!newPoint && !editingId)}
                />

                <input
                    className="mt-3 w-full rounded-[7px] border border-[#D8DDD8] bg-[#FAFBF7] px-3 py-2 text-sm outline-none transition focus:border-[#E8B8C2]"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    placeholder="2026.05.20"
                    maxLength={10}
                    disabled={!isAdmin || (!newPoint && !editingId)}
                />

                <textarea
                    className="mt-3 w-full resize-none rounded-[7px] border border-[#D8DDD8] bg-[#FAFBF7] px-3 py-2 text-sm leading-6 outline-none transition focus:border-[#E8B8C2]"
                    rows={3}
                    value={formText}
                    onChange={(e) => setFormText(e.target.value)}
                    placeholder="写一点备注……"
                    disabled={!isAdmin || (!newPoint && !editingId)}
                />

                <div className="mt-3">
                    <input
                        ref={fileInputRef}
                        className="hidden"
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handlePhotoPick}
                        disabled={!isAdmin || (!newPoint && !editingId)}
                    />
                    <button
                        className="flex w-full items-center justify-center gap-2 rounded-[6px] border border-dashed border-[#D8DDD8] bg-[#FAFBF7] px-3 py-2 text-sm text-[#5A6670]/70 transition hover:border-[#E8B8C2] hover:text-[#E8B8C2] disabled:opacity-45"
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={!isAdmin || (!newPoint && !editingId)}
                    >
                        <ImagePlus className="h-4 w-4" />
                        {formPhotos.length > 0 ? `已选 ${formPhotos.length} 张` : "添加照片"}
                    </button>
                    {formPhotos.length > 0 && (
                        <div className="mt-2 grid grid-cols-4 gap-1.5">
                            {formPhotos.map((photo, index) => (
                                <div key={index} className="group relative aspect-square overflow-hidden rounded-[4px] bg-[#D6E8F0]">
                                    <LocalPrivacyImg
                                        className="h-full w-full object-cover"
                                        src={photo}
                                        alt={`photo ${index + 1}`}
                                    />
                                    <button
                                        className="absolute right-0.5 top-0.5 grid h-5 w-5 place-items-center rounded-full bg-[#FAFBF7]/90 text-[#E8B8C2] opacity-0 transition hover:bg-[#FAFBF7] group-hover:opacity-100"
                                        type="button"
                                        onClick={() => removePhoto(index)}
                                        aria-label="删除照片"
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <button
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-[7px] bg-[#F5DCE0] px-4 py-2.5 text-sm font-semibold text-[#E8B8C2] transition hover:bg-[#E8B8C2] hover:text-[#FAFBF7] disabled:opacity-45"
                    type="button"
                    onClick={() => void saveCheckIn()}
                    disabled={!isAdmin || (!newPoint && !editingId) || !formName.trim()}
                >
                    <MapPin className="h-4 w-4" />
                    {isSaving ? "保存中" : editingId ? "保存修改" : "保存打卡"}
                </button>

                {(editingId || newPoint) && (
                    <button
                        className="mt-2 flex w-full items-center justify-center gap-2 rounded-[7px] px-4 py-2 text-sm font-semibold text-[#5A6670]/56 transition hover:bg-[#D8DDD8]/28 hover:text-[#5A6670]"
                        type="button"
                        onClick={resetForm}
                    >
                        取消
                    </button>
                )}

                {status && (
                    <p className={`mt-2 text-center text-xs font-semibold ${status === "已保存" || status === "已删除" ? "text-[#A8C8DC]" : "text-[#E8B8C2]"
                        }`}>
                        {status}
                    </p>
                )}

                <div className="mt-6 border-t border-dashed border-[#D8DDD8] pt-4">
                    <p className="mb-3 text-xs font-semibold text-[#5A6670]/70">
                        打卡记录（{checkIns.length}）
                    </p>
                    <div className="max-h-[300px] space-y-2 overflow-y-auto">
                        {checkIns.length === 0 ? (
                            <p className="text-center text-xs text-[#5A6670]/50 py-4">
                                还没有打卡记录，在地图上选一个位置开始吧
                            </p>
                        ) : (
                            checkIns.map((item) => (
                                <div
                                    key={item.id}
                                    className="rounded-[7px] border border-[#D8DDD8]/70 bg-[#FAFBF7]/72 p-3"
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <p className="text-sm font-semibold text-[#5A6670] truncate">{item.name}</p>
                                            <p className="text-xs text-[#5A6670]/50">{item.date}</p>
                                        </div>
                                        {isAdmin && (
                                            <div className="flex shrink-0 gap-1">
                                                <button
                                                    className="grid h-6 w-6 place-items-center rounded-[4px] text-[#5A6670]/46 transition hover:bg-[#D6E8F0]/34 hover:text-[#A8C8DC]"
                                                    onClick={() => editCheckIn(item)}
                                                    type="button"
                                                    aria-label="编辑"
                                                >
                                                    <Pencil className="h-3 w-3" />
                                                </button>
                                                <button
                                                    className="grid h-6 w-6 place-items-center rounded-[4px] text-[#5A6670]/46 transition hover:bg-[#F5DCE0]/46 hover:text-[#E8B8C2]"
                                                    onClick={() => deleteCheckIn(item.id)}
                                                    type="button"
                                                    aria-label="删除"
                                                >
                                                    <Trash2 className="h-3 w-3" />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                    {item.text && (
                                        <p className="mt-1 text-xs leading-5 text-[#5A6670]/70">{item.text}</p>
                                    )}
                                    {item.photos.length > 0 && (
                                        <div className="mt-2 grid grid-cols-5 gap-1">
                                            {item.photos.slice(0, 5).map((photo, i) => (
                                                <div
                                                    key={i}
                                                    className="aspect-square overflow-hidden rounded-[3px] bg-[#D6E8F0]"
                                                >
                                                    <LocalPrivacyImg
                                                        className="h-full w-full object-cover"
                                                        src={photo}
                                                        alt=""
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
