alter table public.accounts
  add column include_private_details_in_private_print boolean not null default false;

alter function public.update_account_unit_preferences(
  text, text, text, text, text, text, text, boolean, text, boolean, boolean
)
rename to update_account_unit_preferences_without_private_details;

create function public.update_account_unit_preferences(
  p_volume_system text default null,
  p_weight_system text default null,
  p_ingredient_presentation text default null,
  p_hand_preference text default null,
  p_ingredient_color text default null,
  p_temperature_color text default null,
  p_duration_color text default null,
  p_private_print_uses_colors boolean default null,
  p_temperature_system text default null,
  p_include_instruction_photos_in_private_print boolean default null,
  p_repeat_ingredients_in_private_print boolean default null,
  p_include_private_details_in_private_print boolean default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account_id uuid := (select auth.uid());
begin
  if v_account_id is null then
    raise exception 'Authentication required';
  end if;

  perform public.update_account_unit_preferences_without_private_details(
    p_volume_system,
    p_weight_system,
    p_ingredient_presentation,
    p_hand_preference,
    p_ingredient_color,
    p_temperature_color,
    p_duration_color,
    p_private_print_uses_colors,
    p_temperature_system,
    p_include_instruction_photos_in_private_print,
    p_repeat_ingredients_in_private_print
  );

  if p_include_private_details_in_private_print is not null then
    update public.accounts
    set include_private_details_in_private_print = p_include_private_details_in_private_print
    where id = v_account_id;

    if not found then
      raise exception 'Account not found';
    end if;
  end if;
end;
$$;

revoke all on function public.update_account_unit_preferences_without_private_details(
  text, text, text, text, text, text, text, boolean, text, boolean, boolean
) from public, anon, authenticated, service_role;
revoke all on function public.update_account_unit_preferences(
  text, text, text, text, text, text, text, boolean, text, boolean, boolean, boolean
) from public, anon;
grant execute on function public.update_account_unit_preferences(
  text, text, text, text, text, text, text, boolean, text, boolean, boolean, boolean
) to authenticated;

alter function public.read_export_snapshot(uuid)
rename to read_export_snapshot_without_private_details;

create function public.read_export_snapshot(p_account_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  snapshot jsonb;
  include_private_details boolean;
begin
  snapshot := public.read_export_snapshot_without_private_details(p_account_id);
  if snapshot is null then
    return null;
  end if;

  select account.include_private_details_in_private_print
  into include_private_details
  from public.accounts as account
  where account.id = p_account_id;
  if not found then
    return null;
  end if;

  return jsonb_set(
    snapshot,
    '{accountPreferences,include_private_details_in_private_print}',
    to_jsonb(include_private_details),
    true
  );
end;
$$;

revoke all on function public.read_export_snapshot_without_private_details(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.read_export_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.read_export_snapshot(uuid) to service_role;

alter function public.commit_database_import_with_preferences(
  uuid, jsonb, jsonb, jsonb, uuid[], uuid[]
)
rename to commit_database_import_with_preferences_without_private_details;

create function public.commit_database_import_with_preferences(
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
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'This operation is not available.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_account_preferences) is distinct from 'object' then
    raise exception 'Account preferences are invalid.' using errcode = '23514';
  end if;
  if p_account_preferences ? 'include_private_details_in_private_print'
    and jsonb_typeof(p_account_preferences->'include_private_details_in_private_print') <>
      'boolean'
  then
    raise exception 'Account preferences are invalid.' using errcode = '23514';
  end if;

  result := public.commit_database_import_with_preferences_without_private_details(
    p_account_id,
    p_account_preferences,
    p_records,
    p_expected_versions,
    p_replace_recipe_ids,
    p_replace_publication_ids
  );

  update public.accounts as account
  set include_private_details_in_private_print = coalesce(
        (p_account_preferences->>'include_private_details_in_private_print')::boolean,
        account.include_private_details_in_private_print
      )
  where account.id = p_account_id;

  if not found then
    raise exception 'Account not found.' using errcode = '23514';
  end if;

  return result;
end;
$$;

revoke all on function public.commit_database_import_with_preferences_without_private_details(
  uuid, jsonb, jsonb, jsonb, uuid[], uuid[]
) from public, anon, authenticated, service_role;
revoke all on function public.commit_database_import_with_preferences(
  uuid, jsonb, jsonb, jsonb, uuid[], uuid[]
) from public, anon, authenticated;
grant execute on function public.commit_database_import_with_preferences(
  uuid, jsonb, jsonb, jsonb, uuid[], uuid[]
) to service_role;

notify pgrst, 'reload schema';
