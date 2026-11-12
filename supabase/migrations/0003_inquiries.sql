-- Compare and Edit guide photos ("inquiries"): synced as derived data + an EXIF-free thumbnail.
-- Never the original file or the full-size image.
create table if not exists public.inquiries (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  kind text not null check (kind in ('compare', 'edit')),
  name text not null check (char_length(name) <= 255),
  created_at timestamptz not null,
  in_grid boolean not null default true,
  thumb_path text,                         -- thumbs/<user id>/inq-<id>.(webp|jpg)
  data jsonb not null,                     -- analysis (+ Edit guide measurements and target family)
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists inquiries_user_updated on public.inquiries (user_id, updated_at);

alter table public.inquiries enable row level security;
drop policy if exists "own rows select" on public.inquiries;
drop policy if exists "own rows insert" on public.inquiries;
drop policy if exists "own rows update" on public.inquiries;
drop policy if exists "own rows delete" on public.inquiries;
create policy "own rows select" on public.inquiries for select to authenticated using (user_id = (select auth.uid()));
create policy "own rows insert" on public.inquiries for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own rows update" on public.inquiries for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows delete" on public.inquiries for delete to authenticated using (user_id = (select auth.uid()));

drop trigger if exists touch on public.inquiries;
create trigger touch before insert or update on public.inquiries for each row execute function public.touch_updated_at();
-- thumbnails reuse the private "thumbs" bucket and its per-user folder policies from 0001
