create function public.expire_cloud_resources() returns void language plpgsql security definer set search_path='' as $$
begin
 update public.upload_sessions set status='closed' where expires_at<=now();
 -- Keep originals referenced by any surviving project; prune abandoned uploads after a grace period.
 delete from public.project_assets a where a.uploaded_at<now()-interval '1 day'
 and not exists(select 1 from public.shares s where (s.asset_id=a.id or s.preview_asset_id=a.id) and s.status='active' and (s.expires_at is null or s.expires_at>now()))
 and not exists(select 1 from public.events e where e.logo_asset_id=a.id)
 and not exists(select 1 from public.projects p where p.thumbnail_asset_id=a.id or p.photo_assets::text like '%'||a.id::text||'%');
 delete from public.request_limits where started_at<now()-interval '1 day';
end $$;
revoke all on function public.expire_cloud_resources() from public,anon,authenticated;
grant execute on function public.expire_cloud_resources() to service_role;
