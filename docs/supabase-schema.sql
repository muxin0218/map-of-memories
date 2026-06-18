-- Map of Us Supabase setup
-- Run this in Supabase SQL Editor (https://supabase.com > SQL Editor > New query)
-- before deploying with Supabase env vars.

-- ============================================
-- 1. 主数据表（一张表存所有）
-- ============================================
create table if not exists public.map_of_us_store (
    key text primary key,
    value jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now()
);

-- 允许所有操作（RLS 由应用层鉴权管理）
alter table public.map_of_us_store disable row level security;

-- ============================================
-- 2. 存储桶（存照片文件，不再用 Base64）
-- ============================================
insert into storage.buckets (id, name, public)
values ('map-of-us', 'map-of-us', true)
on conflict (id) do update set public = excluded.public;

-- 允许公开读取存储桶内容
create policy "Map of Us public read"
on storage.objects for select
using (bucket_id = 'map-of-us');

-- 允许公开上传/更新文件（应用层 API 鉴权）
create policy "Map of Us public write"
on storage.objects for insert
with check (bucket_id = 'map-of-us');

create policy "Map of Us public update"
on storage.objects for update
using (bucket_id = 'map-of-us');

create policy "Map of Us public delete"
on storage.objects for delete
using (bucket_id = 'map-of-us');

-- ============================================
-- 3. 本表存储结构说明（不需要执行，仅做参考）
-- ============================================
-- 
-- key = "memories" 的 value 格式：
-- {
--   "beijing": [
--     { "id": "...", "cityId": "beijing", "city": "北京", "date": "2024.05.20",
--       "text": "第一次一起爬长城", "image": "https://...", "photos": ["https://..."], "createdAt": "..." }
--   ],
--   "nanjing": [...]
-- }
--
-- key = "checkins" 的 value 格式：
-- [
--   { "id": "checkin-xxx", "cityId": "nanjing", "lat": 32.06, "lng": 118.78,
--     "name": "小区门口的咖啡店", "date": "2026.06.15", "text": "拿铁很好喝",
--     "photos": ["https://..."], "createdAt": "..." }
-- ]
--
-- key = "city-assets" 的 value 格式：
-- { "beijing": "https://xxx/beijing.jpg", "nanjing": "https://xxx/nanjing.jpg" }
-- 
-- key = "settings" 的 value 格式（可选）：
-- { "anniversaryDate": "2024.05.20", "anniversaryLabel": "我们在一起", ... }
