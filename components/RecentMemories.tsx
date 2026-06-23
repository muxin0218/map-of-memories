"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Heart } from "lucide-react";
import { cities } from "@/data/cities";
import {
  memoryStoreUpdatedEvent,
  type LocalMemoryStore,
} from "@/data/progress";
import { memories, type Memory } from "@/data/memories";
import { LocalPrivacyImage, LocalPrivacyImg } from "@/components/LocalPrivacyImage";

const isBrowserImageUrl = (url: string) => url.startsWith("data:image/") || url.startsWith("https://");
const randomMemoryCount = 3;

function pickRandomMemories(items: Memory[]) {
  const shuffled = [...items];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled.slice(0, randomMemoryCount);
}

function collectMemories(localMemories: LocalMemoryStore) {
  const localItems = Object.values(localMemories).flat();
  const byId = new Map<string, Memory>();

  [...memories, ...localItems].forEach((memory) => {
    if (!memory.draft) byId.set(memory.id, memory);
  });

  return [...byId.values()];
}

function MemoryThumb({ memory }: Readonly<{ memory: Memory }>) {
  const className = "pixelated h-full w-full object-cover transition duration-300 group-hover:scale-105";

  if (isBrowserImageUrl(memory.image)) {
    return (
      <LocalPrivacyImg className={className} src={memory.image} alt={`${memory.city} memory`} />
    );
  }

  return (
    <LocalPrivacyImage
      className="pixelated object-cover transition duration-300 group-hover:scale-105"
      src={memory.image}
      alt={`${memory.city} memory`}
      fill
      sizes="70px"
    />
  );
}

export default function RecentMemories() {
  const [randomMemories, setRandomMemories] = useState<Memory[]>([]);

  useEffect(() => {
    let cancelled = false;
    const handleMemoryUpdate = (event: Event) => {
      const detail = (event as CustomEvent<LocalMemoryStore>).detail;
      if (detail) {
        setRandomMemories(pickRandomMemories(collectMemories(detail)));
      }
    };

    async function loadLocalMemories() {
      const response = await fetch("/api/memories", { cache: "no-store" }).catch(() => null);
      if (!response?.ok) {
        if (!cancelled) setRandomMemories(pickRandomMemories(collectMemories({})));
        return;
      }

      const data = (await response.json().catch(() => null)) as
        | { memories?: LocalMemoryStore }
        | null;

      if (cancelled) return;

      const nextLocalMemories = data?.memories ?? {};
      setRandomMemories(pickRandomMemories(collectMemories(nextLocalMemories)));
    }

    window.addEventListener(memoryStoreUpdatedEvent, handleMemoryUpdate);
    loadLocalMemories();

    return () => {
      cancelled = true;
      window.removeEventListener(memoryStoreUpdatedEvent, handleMemoryUpdate);
    };
  }, []);

  const memoryItems = useMemo(
    () =>
      randomMemories.map((memory) => ({
        memory,
        city: cities.find((city) => city.id === memory.cityId),
      })),
    [randomMemories],
  );

  return (
    <div className="mt-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[#5A6670]">闅忔満璁板繂</p>
          <p className="mt-0.5 text-xs text-[#5A6670]/50">闅忔満鎺ㄨ崘涓夋锛岀偣涓€涓嬪洖鍒伴偅搴у煄</p>
        </div>
        <Heart className="h-4 w-4 fill-[#F0DEC4] text-[#D4A574]" />
      </div>
      <div className="mt-3 space-y-2">
        {memoryItems.length > 0 ? (
          memoryItems.map(({ memory, city }) => (
            <Link
              key={memory.id}
              className="group block rounded-[8px] border border-transparent p-1.5 transition hover:border-[#F0DEC4] hover:bg-[#FAFBF7]/72 hover:shadow-[0_10px_24px_rgba(90,102,112,0.07)]"
              href={city ? `/province/${city.provinceId}?city=${memory.cityId}` : "/map"}
            >
              <article className="flex items-center gap-2.5">
                <div className="relative h-[46px] w-[56px] shrink-0 overflow-hidden rounded-[5px] border border-[#D8DDD8] bg-[#D6E8F0]">
                  <MemoryThumb memory={memory} />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-[#5A6670]">
                    {memory.city}
                    <span className="ml-1.5 text-xs font-normal text-[#5A6670]/48">
                      {memory.date}
                    </span>
                  </p>
                  <p className="mt-0.5 line-clamp-1 text-xs leading-5 text-[#5A6670]/62">
                    {memory.text}
                  </p>
                </div>
              </article>
            </Link>
          ))
        ) : (
          <div className="rounded-[8px] border border-dashed border-[#D8DDD8] bg-[#FAFBF7]/52 px-4 py-5 text-sm leading-6 text-[#5A6670]/58">
            杩樻病鏈夊洖蹇嗐€傚厛鍦ㄥ湴鍥句笂鐐逛竴搴у煄甯傦紝鍐欎笅绗竴娈碉紝瀹冨氨浼氬嚭鐜板湪闅忔満鎺ㄨ崘閲屻€?
          </div>
        )}
      </div>
      <Link
        className="mt-4 flex w-full items-center justify-between rounded-[8px] border border-[#D8DDD8]/70 bg-[#FAFBF7]/62 px-4 py-2.5 text-sm font-semibold text-[#5A6670]/72 transition hover:border-[#F0DEC4] hover:text-[#D4A574] hover:shadow-[0_10px_24px_rgba(90,102,112,0.07)]"
        href="/memories"
      >
        鏌ョ湅鍏ㄩ儴
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

