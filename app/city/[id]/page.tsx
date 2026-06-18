"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { ArrowLeft, MapIcon } from "lucide-react";
import { cities } from "@/data/cities";

const CityDetailMap = dynamic(() => import("@/components/CityDetailMap"), {
    ssr: false,
    loading: () => (
        <div className="flex h-[60vh] items-center justify-center text-[#5A6670]/60">
            加载地图中...
        </div>
    ),
});

export default function CityDetailPage() {
    const params = useParams();
    const router = useRouter();
    const cityId = params.id as string;
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const city = cities.find((c) => c.id === cityId);

    if (!city) {
        return (
            <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#FAFBF7] text-[#5A6670]/60">
                <MapIcon className="h-12 w-12 opacity-40" />
                <p className="text-lg font-semibold">未找到该城市</p>
                <button
                    className="rounded-[7px] border border-[#D8DDD8] px-4 py-2 text-sm transition hover:bg-[#D8DDD8]/20"
                    onClick={() => router.back()}
                    type="button"
                >
                    返回
                </button>
            </div>
        );
    }

    return (
        <main className="min-h-screen bg-[#FAFBF7]">
            <header className="sticky top-0 z-40 border-b border-[#D8DDD8]/62 bg-[#FAFBF7]/94 px-4 pb-3 pt-4 shadow-[0_4px_16px_rgba(90,102,112,0.03)] backdrop-blur">
                <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <button
                            className="grid h-9 w-9 place-items-center rounded-[7px] border border-[#D8DDD8] text-[#5A6670]/62 transition hover:bg-[#D8DDD8]/24 hover:text-[#5A6670]"
                            onClick={() => router.back()}
                            type="button"
                            aria-label="返回"
                        >
                            <ArrowLeft className="h-5 w-5" />
                        </button>
                        <div>
                            <h1 className="text-lg font-semibold text-[#5A6670]">{city.name}</h1>
                            <p className="text-xs text-[#5A6670]/50">{city.nameEn}</p>
                        </div>
                    </div>
                </div>
            </header>

            <div className="mx-auto max-w-6xl p-4">
                {mounted && <CityDetailMap cityId={cityId} />}
            </div>
        </main>
    );
}
