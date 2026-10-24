create or replace function public.commit_database_import_with_preferences(
  p_account_id uuid,
  p_account_preferences jsonb,
  p_records jsonb,
  p_expected_versions jsonb,
  p_replace_recipe_ids uuid[],
  p_replace_publication_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
  allowed_colors text[] := array[
    'black', 'navy', 'dark_blue', 'dark_green', 'teal', 'dark_red',
    'dark_orange', 'dark_purple', 'none', 'red', 'orange', 'yellow',
    'green', 'blue', 'purple', 'pink'
  ];
  expected_crop_updates integer;
  actual_crop_updates integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'This operation is not available.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_account_preferences) is distinct from 'object' then
    raise exception 'Account preferences are invalid.' using errcode = '23514';
  end if;
  if (p_account_preferences ? 'ingredient_color' and not (
        p_account_preferences->>'ingredient_color' = any(allowed_colors)
      )) or (p_account_preferences ? 'temperature_color' and not (
        p_account_preferences->>'temperature_color' = any(allowed_colors)
      )) or (p_account_preferences ? 'duration_color' and not (
        p_account_preferences->>'duration_color' = any(allowed_colors)
      )) or (p_account_preferences ? 'private_print_uses_colors' and
        jsonb_typeof(p_account_preferences->'private_print_uses_colors') <> 'boolean'
      ) or (p_account_preferences ? 'temperature_system' and not coalesce(
        p_account_preferences->>'temperature_system' = any(array['fahrenheit', 'celsius']),
        false
      ))
  then
    raise exception 'Account emphasis preferences are invalid.' using errcode = '23514';
  end if;

  result := public.commit_database_import(
    p_account_id,
    p_account_preferences,
    p_records,
    p_expected_versions,
    p_replace_recipe_ids,
    p_replace_publication_ids
  );

  update public.accounts as account
  set ingredient_color = coalesce(
        p_account_preferences->>'ingredient_color', account.ingredient_color
      ),
      temperature_color = coalesce(
        p_account_preferences->>'temperature_color', account.temperature_color
      ),
      duration_color = coalesce(
        p_account_preferences->>'duration_color', account.duration_color
      ),
      private_print_uses_colors = coalesce(
        (p_account_preferences->>'private_print_uses_colors')::boolean,
        account.private_print_uses_colors
      ),
      temperature_system = coalesce(
        p_account_preferences->>'temperature_system', account.temperature_system
      )
  where account.id = p_account_id;

  select count(*)::integer
  into expected_crop_updates
  from jsonb_array_elements(coalesce(p_records->'media_assets', '[]'::jsonb)) as item(asset)
  where item.asset->'crop' is not null and item.asset->'crop' <> 'null'::jsonb;

  update public.media_assets as media
  set crop = item.asset->'crop',
      updated_by_user_id = p_account_id,
      updated_at = now()
  from jsonb_array_elements(coalesce(p_records->'media_assets', '[]'::jsonb)) as item(asset)
  where media.id = (item.asset->>'id')::uuid
    and media.account_id = p_account_id
    and media.status = 'ready'
    and item.asset->'crop' is not null
    and item.asset->'crop' <> 'null'::jsonb;
  get diagnostics actual_crop_updates = row_count;

  if actual_crop_updates <> expected_crop_updates then
    raise exception 'Imported image framing could not be restored.' using errcode = '23514';
  end if;

  return result;
end;
$$;

notify pgrst, 'reload schema';
