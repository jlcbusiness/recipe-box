alter function public.update_explorer_state(text, jsonb)
  rename to update_explorer_state_v1;

revoke all on function public.update_explorer_state_v1(text, jsonb)
  from public, anon, authenticated;

create function public.update_explorer_state(
  p_context_key text,
  p_state jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account_id uuid := (select auth.uid());
  v_preferences jsonb;
  v_allowed_visible text[];
  v_allowed_widths text[];
  v_column record;
  v_width integer;
  v_state_v1 jsonb;
begin
  if v_account_id is null then
    raise exception 'Authentication required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_account_id::text || ':' || coalesce(p_context_key, ''), 0)
  );

  if p_state is null
    or jsonb_typeof(p_state) <> 'object'
    or p_state->>'schema_version' not in ('1', '2') then
    raise exception 'Invalid explorer state';
  end if;

  if p_state->>'schema_version' = '1' then
    select state->'display_preferences'
    into v_preferences
    from public.explorer_state
    where account_id = v_account_id
      and context_key = p_context_key
    for update;

    perform public.update_explorer_state_v1(p_context_key, p_state);
    if v_preferences is not null then
      update public.explorer_state
      set state = p_state || jsonb_build_object(
        'schema_version', 2,
        'display_preferences', v_preferences
      ),
          updated_at = now()
      where account_id = v_account_id
        and context_key = p_context_key;
    end if;
    return;
  end if;

  if not (p_state ? 'display_preferences') then
    raise exception 'Invalid explorer display preferences';
  end if;

  v_preferences := p_state->'display_preferences';
  if jsonb_typeof(v_preferences) <> 'object'
    or not (v_preferences ? 'visible_columns' and v_preferences ? 'column_widths')
    or exists (
      select 1
      from jsonb_object_keys(v_preferences) as preference_key(key)
      where preference_key.key not in ('visible_columns', 'column_widths')
    )
    or jsonb_typeof(v_preferences->'visible_columns') <> 'array'
    or jsonb_array_length(v_preferences->'visible_columns') > 6
    or jsonb_typeof(v_preferences->'column_widths') <> 'object' then
    raise exception 'Invalid explorer display preferences';
  end if;

  if p_context_key = 'recipes-find' then
    v_allowed_visible := array['publication', 'state', 'total_time_minutes'];
  elsif p_context_key = 'publications' then
    v_allowed_visible := array[
      'author', 'edition', 'recipe_count', 'tags', 'created_at', 'updated_at'
    ];
  else
    v_allowed_visible := array[
      'state', 'opinion', 'meal_type', 'food_type', 'total_time_minutes', 'publication_source'
    ];
  end if;
  v_allowed_widths := v_allowed_visible || array['name'];

  if exists (
    select 1
    from jsonb_array_elements(v_preferences->'visible_columns') as visible_column(value)
    where jsonb_typeof(visible_column.value) <> 'string'
      or (visible_column.value #>> '{}') <> all(v_allowed_visible)
  ) or (
    select count(*)
    from jsonb_array_elements(v_preferences->'visible_columns') as visible_column(value)
  ) <> (
    select count(distinct visible_column.value #>> '{}')
    from jsonb_array_elements(v_preferences->'visible_columns') as visible_column(value)
  ) then
    raise exception 'Invalid explorer visible columns';
  end if;

  for v_column in
    select key, value
    from jsonb_each(v_preferences->'column_widths')
  loop
    if v_column.key <> all(v_allowed_widths)
      or jsonb_typeof(v_column.value) <> 'number'
      or v_column.value::text !~ '^[0-9]{1,3}$' then
      raise exception 'Invalid explorer column width';
    end if;

    v_width := (v_column.value::text)::integer;
    if (v_column.key = 'name' and (v_width < 180 or v_width > 720))
      or (v_column.key <> 'name' and (v_width < 96 or v_width > 600)) then
      raise exception 'Invalid explorer column width';
    end if;
  end loop;

  v_state_v1 := (p_state - 'display_preferences' - 'schema_version')
    || jsonb_build_object('schema_version', 1);
  perform public.update_explorer_state_v1(p_context_key, v_state_v1);

  update public.explorer_state
  set state = p_state,
      updated_at = now()
  where account_id = v_account_id
    and context_key = p_context_key;

  if not found then
    raise exception 'Explorer preference could not be saved';
  end if;
end;
$$;

revoke all on function public.update_explorer_state(text, jsonb) from public, anon;
grant execute on function public.update_explorer_state(text, jsonb) to authenticated;