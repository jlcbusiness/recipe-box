grant select (
  id,
  account_id,
  asset_type,
  recipe_id,
  publication_id,
  status,
  staging_path,
  full_path,
  thumbnail_path,
  created_by_user_id,
  created_at
)
on public.media_assets to service_role;