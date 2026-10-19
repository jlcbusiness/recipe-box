create function public.discard_pending_media_upload(
  p_asset_id uuid,
  p_account_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Pending media cancellation requires the trusted server.' using errcode = '42501';
  end if;

  delete from public.media_assets as media
  where media.id = p_asset_id
    and media.account_id = p_account_id
    and media.status = 'pending';

  if not found then
    raise exception 'The pending image upload is no longer available.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.discard_pending_media_upload(uuid, uuid) from public, anon, authenticated;
grant execute on function public.discard_pending_media_upload(uuid, uuid) to service_role;