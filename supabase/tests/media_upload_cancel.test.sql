begin;

set local role postgres;
set local search_path = extensions, public;

select plan(4);

select ok(
  has_function_privilege(
    'service_role',
    'public.discard_pending_media_upload(uuid, uuid)',
    'EXECUTE'
  ),
  'the trusted server can cancel pending media uploads'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.discard_pending_media_upload(uuid, uuid)',
    'EXECUTE'
  ),
  'authenticated users cannot call the internal cancellation function'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.discard_pending_media_upload(uuid, uuid)',
    'EXECUTE'
  ),
  'anonymous users cannot call the internal cancellation function'
);

select ok(
  has_column_privilege('service_role', 'public.media_assets', 'id', 'SELECT')
    and has_column_privilege('service_role', 'public.media_assets', 'account_id', 'SELECT')
    and has_column_privilege('service_role', 'public.media_assets', 'asset_type', 'SELECT')
    and has_column_privilege('service_role', 'public.media_assets', 'recipe_id', 'SELECT')
    and has_column_privilege('service_role', 'public.media_assets', 'publication_id', 'SELECT')
    and has_column_privilege('service_role', 'public.media_assets', 'status', 'SELECT')
    and has_column_privilege('service_role', 'public.media_assets', 'staging_path', 'SELECT')
    and has_column_privilege('service_role', 'public.media_assets', 'full_path', 'SELECT')
    and has_column_privilege('service_role', 'public.media_assets', 'thumbnail_path', 'SELECT')
    and has_column_privilege('service_role', 'public.media_assets', 'created_by_user_id', 'SELECT')
    and has_column_privilege('service_role', 'public.media_assets', 'created_at', 'SELECT'),
  'the trusted server can read only the media metadata needed to process uploads'
);

select * from finish();
rollback;