-- Return stable JSON objects rather than PostgREST composite arrays.
drop function public.save_project(uuid,text,jsonb,jsonb,jsonb,integer,uuid);
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
drop function public.reserve_upload(text);
create function public.reserve_upload(p_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare result public.upload_sessions; begin
 select * into result from public.upload_sessions where token_hash=p_hash for update;
 if not found or result.status<>'active' or result.expires_at<=now() or result.reserved_count>=result.max_count then raise exception 'upload session unavailable'; end if;
 update public.upload_sessions set reserved_count=reserved_count+1,status=case when reserved_count+1>=max_count then 'closed' else 'active' end where id=result.id returning * into result;
 return to_jsonb(result); end $$;
revoke all on function public.reserve_upload(text) from public,anon,authenticated;
grant execute on function public.reserve_upload(text) to service_role;
