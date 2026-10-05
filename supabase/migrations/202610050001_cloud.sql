-- Owner-scoped rows; public tokens are resolved only by validated server routes.
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null default '' check (length(display_name)<=80),
 avatar_url text, username text unique, created_at timestamptz not null default now()
);
create table public.events (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 name text not null check(length(name) between 1 and 80), event_date date,
 template_id text not null default 'classic', layout_id text not null default 'classic',
 background text not null default '#ffffff', foreground text not null default '#292c27',
 allow_customization boolean not null default true, gallery_visibility text not null default 'private' check(gallery_visibility in ('private','link','public')),
 gallery_token_hash text unique, gallery_token text unique, share_visibility text not null default 'private' check(share_visibility in ('private','link')), share_days integer not null default 7 check(share_days in (0,1,7,30)), auto_delivery boolean not null default false, logo_asset_id uuid, created_at timestamptz not null default now(),
 unique(id,owner_id)
);
create table public.projects (
 id uuid primary key, owner_id uuid not null references auth.users(id) on delete cascade,
 name text not null check(length(name) between 1 and 80), document jsonb not null,
 photo_assets jsonb not null default '{}', export_settings jsonb not null default '{}',
 thumbnail_asset_id uuid, revision integer not null default 1 check(revision>0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,owner_id)
);
create table public.booth_sessions (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 event_id uuid not null, project_id uuid not null, created_at timestamptz not null default now(),
 unique(id,owner_id), unique(project_id),
 foreign key(event_id,owner_id) references public.events(id,owner_id) on delete cascade,
 foreign key(project_id,owner_id) references public.projects(id,owner_id) on delete cascade
);
create table public.upload_sessions (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 project_id uuid not null, token_hash text not null unique, expires_at timestamptz not null default now()+interval '15 minutes',
 status text not null default 'active' check(status in ('active','closed')), ended_by_host boolean not null default false, max_count integer not null default 4 check(max_count between 1 and 4),
 reserved_count integer not null default 0 check(reserved_count between 0 and 4), created_at timestamptz not null default now(),
 unique(id,owner_id), foreign key(project_id,owner_id) references public.projects(id,owner_id) on delete cascade
);
create table public.project_assets (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 project_id uuid, event_id uuid, upload_session_id uuid, source_id text,
 asset_type text not null check(asset_type in ('original','preview','export','logo')),
 object_path text not null unique, mime_type text not null check(mime_type in ('image/jpeg','image/png','image/webp')),
 bytes bigint not null check(bytes between 1 and 20971520), width integer not null, height integer not null,
 uploaded_at timestamptz not null default now(), unique(id,owner_id), check(width>0 and height>0 and width::bigint*height<=40000000),
 foreign key(project_id,owner_id) references public.projects(id,owner_id) on delete cascade,
 foreign key(event_id,owner_id) references public.events(id,owner_id) on delete cascade,
 foreign key(upload_session_id,owner_id) references public.upload_sessions(id,owner_id) on delete cascade
);
create table public.shares (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 project_id uuid not null, asset_id uuid not null, preview_asset_id uuid, event_id uuid, session_id uuid,
 token_hash text not null unique, visibility text not null default 'private' check(visibility in ('private','link')),
 status text not null default 'active' check(status in ('active','revoked')), expires_at timestamptz,
 created_at timestamptz not null default now(), unique(id,owner_id),
 foreign key(project_id,owner_id) references public.projects(id,owner_id) on delete cascade,
 foreign key(asset_id,owner_id) references public.project_assets(id,owner_id) on delete cascade,
 foreign key(preview_asset_id,owner_id) references public.project_assets(id,owner_id) on delete set null (preview_asset_id),
 foreign key(event_id,owner_id) references public.events(id,owner_id) on delete cascade,
 foreign key(session_id,owner_id) references public.booth_sessions(id,owner_id) on delete cascade
);
-- Asset links cannot reference assets belonging to a different user.
alter table public.projects add foreign key(thumbnail_asset_id,owner_id) references public.project_assets(id,owner_id) on delete set null (thumbnail_asset_id);
alter table public.events add foreign key(logo_asset_id,owner_id) references public.project_assets(id,owner_id) on delete set null (logo_asset_id);
create table public.storage_cleanup (id bigint generated always as identity primary key, object_path text unique not null, created_at timestamptz not null default now());
create table public.request_limits (key text primary key, started_at timestamptz not null default now(), requests integer not null default 1);
create index assets_project on public.project_assets(project_id);
create index shares_event on public.shares(event_id);
create index sessions_event on public.booth_sessions(event_id);

do $$ declare t text; begin
 foreach t in array array['profiles','projects','events','booth_sessions','project_assets','shares','upload_sessions','storage_cleanup','request_limits'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all privileges on public.%I from public,anon,authenticated',t);
 end loop;
 foreach t in array array['projects','events','booth_sessions','project_assets','shares','upload_sessions'] loop
  execute format('create policy owner_read on public.%I for select to authenticated using (owner_id=(select auth.uid()))',t);
 end loop;
 foreach t in array array['events'] loop
  execute format('create policy owner_insert on public.%I for insert to authenticated with check(owner_id=(select auth.uid()))',t);
  execute format('create policy owner_update on public.%I for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()))',t);
 end loop;
end $$;
create policy profile_read on public.profiles for select to authenticated using(id=(select auth.uid()));
create policy profile_write on public.profiles for insert to authenticated with check(id=(select auth.uid()));
create policy profile_update on public.profiles for update to authenticated using(id=(select auth.uid())) with check(id=(select auth.uid()));
grant select on public.projects,public.events,public.booth_sessions,public.project_assets,public.shares,public.upload_sessions to authenticated;
grant select,insert,update on public.profiles to authenticated;
grant insert,update on public.events to authenticated;
grant all on public.profiles,public.projects,public.events,public.booth_sessions,public.project_assets,public.shares,public.upload_sessions,public.storage_cleanup,public.request_limits to service_role;
grant usage,select on public.storage_cleanup_id_seq to service_role;

-- Security-definer functions pin search_path and verify ownership themselves.
create function public.save_project(p_id uuid,p_name text,p_document jsonb,p_photos jsonb,p_export jsonb,p_revision integer,p_thumbnail uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result public.projects; actor uuid=auth.uid(); existing public.projects; begin
 if actor is null then raise exception 'authentication required'; end if;
 select * into existing from public.projects where id=p_id for update;
 if found then
  if existing.owner_id<>actor then raise exception 'project unavailable'; end if;
  if existing.revision<>p_revision then raise exception 'revision conflict' using errcode='40001'; end if;
  update public.projects set name=p_name,document=p_document,photo_assets=p_photos,export_settings=p_export,
   thumbnail_asset_id=p_thumbnail,revision=revision+1,updated_at=now() where id=p_id returning * into result;
 else
  if p_revision<>0 then raise exception 'revision conflict' using errcode='40001'; end if;
  insert into public.projects(id,owner_id,name,document,photo_assets,export_settings,thumbnail_asset_id)
   values(p_id,actor,p_name,p_document,p_photos,p_export,p_thumbnail) returning * into result;
 end if;
 return to_jsonb(result); end $$;
revoke all on function public.save_project(uuid,text,jsonb,jsonb,jsonb,integer,uuid) from public,anon;
grant execute on function public.save_project(uuid,text,jsonb,jsonb,jsonb,integer,uuid) to authenticated;

create function public.queue_asset_cleanup() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into public.storage_cleanup(object_path) values(old.object_path) on conflict do nothing; return old; end $$;
create trigger asset_cleanup before delete on public.project_assets for each row execute function public.queue_asset_cleanup();
create function public.reserve_upload(p_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare result public.upload_sessions; begin
 select * into result from public.upload_sessions where token_hash=p_hash for update;
 if not found or result.status<>'active' or result.expires_at<=now() or result.reserved_count>=result.max_count then raise exception 'upload session unavailable'; end if;
 update public.upload_sessions set reserved_count=reserved_count+1,status=case when reserved_count+1>=max_count then 'closed' else 'active' end where id=result.id returning * into result;
 return to_jsonb(result); end $$;
create function public.release_upload(p_id uuid) returns void language sql security definer set search_path='' as $$
 update public.upload_sessions set reserved_count=greatest(0,reserved_count-1),status=case when expires_at>now() and not ended_by_host then 'active' else 'closed' end where id=p_id;
$$;
create function public.check_rate(p_key text,p_limit integer,p_seconds integer) returns boolean language plpgsql security definer set search_path='' as $$
declare n integer; begin
 insert into public.request_limits(key) values(p_key) on conflict(key) do update set
 requests=case when public.request_limits.started_at<now()-make_interval(secs=>p_seconds) then 1 else public.request_limits.requests+1 end,
 started_at=case when public.request_limits.started_at<now()-make_interval(secs=>p_seconds) then now() else public.request_limits.started_at end returning requests into n;
 delete from public.request_limits where started_at<now()-interval '1 day'; return n<=p_limit; end $$;
revoke all on function public.reserve_upload(text),public.release_upload(uuid),public.check_rate(text,integer,integer),public.queue_asset_cleanup() from public,anon,authenticated;
grant execute on function public.reserve_upload(text),public.release_upload(uuid),public.check_rate(text,integer,integer) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('striply-private','striply-private',false,20971520,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
create policy striply_owner_read on storage.objects for select to authenticated using (
 bucket_id='striply-private' and exists(select 1 from public.project_assets a where a.object_path=name and a.owner_id=(select auth.uid()))
);
-- Restrictive policies protect this bucket even if another application has broad permissive policies.
create policy striply_read_guard on storage.objects as restrictive for select to authenticated using (
 bucket_id<>'striply-private' or exists(select 1 from public.project_assets a where a.object_path=name and a.owner_id=(select auth.uid()))
);
create policy striply_anon_guard on storage.objects as restrictive for select to anon using(bucket_id<>'striply-private');
create policy striply_insert_guard on storage.objects as restrictive for insert to anon,authenticated with check(bucket_id<>'striply-private');
create policy striply_update_guard on storage.objects as restrictive for update to anon,authenticated using(bucket_id<>'striply-private') with check(bucket_id<>'striply-private');
create policy striply_delete_guard on storage.objects as restrictive for delete to anon,authenticated using(bucket_id<>'striply-private');
-- No client INSERT/UPDATE/DELETE Storage policy: all writes are decoded/validated server-side.
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  alter publication supabase_realtime add table public.project_assets;
 end if;
end $$;
