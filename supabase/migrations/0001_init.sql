-- Colorway: synced, derived data only. Original photos never leave the device.
-- Every table has row-level security: a user can only see and change their own rows.

create table if not exists public.photos (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  name text not null check (char_length(name) <= 255),
  kind text not null check (kind in ('jpeg', 'png', 'webp', 'other')),
  width int not null check (width >= 0),
  height int not null check (height >= 0),
  added_at timestamptz not null,
  family_override text,
  thumb_path text,                         -- storage path of the <= 400 px WebP, EXIF-free
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.analyses (
  photo_id uuid primary key references public.photos (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  version int not null,
  data jsonb not null,                     -- palettes, histograms, grading, glow, features, colour samples
  updated_at timestamptz not null default now()
);

create table if not exists public.groupings (
  user_id uuid primary key references auth.users (id) on delete cascade default auth.uid(),
  data jsonb not null,                     -- families, set summary, renamed families, moves
  updated_at timestamptz not null default now()
);

create table if not exists public.grid_layouts (
  user_id uuid primary key references auth.users (id) on delete cascade default auth.uid(),
  data jsonb not null,                     -- order, theme, mode
  updated_at timestamptz not null default now()
);

create index if not exists photos_user_updated on public.photos (user_id, updated_at);
create index if not exists analyses_user_updated on public.analyses (user_id, updated_at);

alter table public.photos enable row level security;
alter table public.analyses enable row level security;
alter table public.groupings enable row level security;
alter table public.grid_layouts enable row level security;

-- one policy per action per table, all scoped to the signed-in user
do $$
declare t text;
begin
  foreach t in array array['photos', 'analyses', 'groupings', 'grid_layouts'] loop
    execute format('drop policy if exists "own rows select" on public.%I', t);
    execute format('drop policy if exists "own rows insert" on public.%I', t);
    execute format('drop policy if exists "own rows update" on public.%I', t);
    execute format('drop policy if exists "own rows delete" on public.%I', t);
    execute format('create policy "own rows select" on public.%I for select to authenticated using (user_id = (select auth.uid()))', t);
    execute format('create policy "own rows insert" on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t);
    execute format('create policy "own rows update" on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('create policy "own rows delete" on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- keep updated_at honest on every write
create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
do $$
declare t text;
begin
  foreach t in array array['photos', 'analyses', 'groupings', 'grid_layouts'] loop
    execute format('drop trigger if exists touch on public.%I', t);
    execute format('create trigger touch before insert or update on public.%I for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

-- private thumbnail bucket: thumbs/<user id>/<photo id>.webp, 200 KB cap, WebP only
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('thumbs', 'thumbs', false, 204800, array['image/webp'])
on conflict (id) do update set public = false, file_size_limit = 204800, allowed_mime_types = array['image/webp'];

drop policy if exists "thumbs own select" on storage.objects;
drop policy if exists "thumbs own insert" on storage.objects;
drop policy if exists "thumbs own update" on storage.objects;
drop policy if exists "thumbs own delete" on storage.objects;
create policy "thumbs own select" on storage.objects for select to authenticated
  using (bucket_id = 'thumbs' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "thumbs own insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'thumbs' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "thumbs own update" on storage.objects for update to authenticated
  using (bucket_id = 'thumbs' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'thumbs' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "thumbs own delete" on storage.objects for delete to authenticated
  using (bucket_id = 'thumbs' and (storage.foldername(name))[1] = (select auth.uid())::text);
