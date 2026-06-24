"use client";

import { Monitor, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";

export default function MobileFrame({ children }: { children: React.ReactNode }) {
    const [mode, setMode] = useState<"desktop" | "mobile">("desktop");
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        // Restore saved preference
        const saved = localStorage.getItem("viewMode");
        if (saved === "mobile" || saved === "desktop") setMode(saved);
        setMounted(true);
    }, []);

    const toggle = () => {
        const next = mode === "desktop" ? "mobile" : "desktop";
        setMode(next);
        localStorage.setItem("viewMode", next);
    };

    if (!mounted) return <>{children}</>;

    return (
        <>
            {/* Toggle button */}
            <button
                className="fixed right-4 top-4 z-[99999] flex items-center gap-1.5 rounded-[8px] border border-[#D8DDD8]/70 bg-[#FAFBF7]/88 px-3 py-2 text-xs font-semibold text-[#5A6670]/60 shadow-[0_4px_12px_rgba(90,102,112,0.08)] backdrop-blur transition hover:bg-[#FAFBF7] hover:text-[#5A6670]"
                type="button"
                onClick={toggle}
                aria-label={mode === "desktop" ? "切换到移动端视图" : "切换回桌面端视图"}
            >
                {mode === "desktop" ? (
                    <Smartphone className="h-3.5 w-3.5" />
                ) : (
                    <Monitor className="h-3.5 w-3.5" />
                )}
                {mode === "desktop" ? "移动端" : "桌面端"}
            </button>

            {mode === "mobile" ? (
                <div className="flex min-h-dvh items-center justify-center bg-[#D8DDD8]/40 px-4 py-16">
                    {/* Phone frame */}
                    <div className="relative w-[390px] max-w-full overflow-hidden rounded-[44px] border-[3px] border-[#5A6670]/20 bg-[#FAFBF7] shadow-[0_24px_48px_rgba(90,102,112,0.18)]">
                        {/* Notch area */}
                        <div className="absolute left-1/2 top-0 z-50 h-5 w-32 -translate-x-1/2 rounded-b-[14px] bg-[#5A6670]/12 backdrop-blur-sm" />
                        {/* Scrollable content */}
                        <div className="max-h-[calc(100dvh-140px)] overflow-y-auto overscroll-contain">
                            {children}
                        </div>
                        {/* Home indicator */}
                        <div className="sticky bottom-1 left-1/2 mx-auto h-1 w-32 -translate-x-1/2 rounded-full bg-[#5A6670]/18" />
                    </div>
                </div>
            ) : (
                children
            )}
        </>
    );
}
