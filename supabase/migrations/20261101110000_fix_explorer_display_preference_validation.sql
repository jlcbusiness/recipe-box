alter table public.accounts
  alter column recipe_hidden_columns set default array[
    'publication_page', 'recipe_url', 'enthusiasm', 'verdict', 'reason',
    'occasion_details', 'serves', 'equipment', 'food_type', 'meal_type', 'cuisine',
    'tags', 'main_ingredients', 'prep_time_minutes', 'mixing_time_minutes',
    'marinate_time_minutes', 'chill_time_minutes', 'freeze_time_minutes',
    'cook_time_minutes', 'bake_time_minutes', 'cooling_time_minutes',
    'rest_time_minutes', 'total_time_minutes', 'created_at', 'updated_at',
    'pairs_with', 'opinion', 'citation'
  ]::text[];

alter function public.update_explorer_state(text, jsonb)
  rename to update_explorer_state_with_legacy_validation;

revoke all on function public.update_explorer_state_with_legacy_validation(text, jsonb)
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
  v_legacy_preferences jsonb;
  v_legacy_widths jsonb;
  v_legacy_visible_columns jsonb;
  v_legacy_state jsonb := p_state;
  v_final_state jsonb;
  v_legacy_filters jsonb;
  v_filter jsonb;
  v_field text;
  v_operator text;
  v_column_filter record;
  v_source_fields text[] := array['publication_page', 'recipe_url', 'citation'];
  v_recipe_context boolean := p_context_key = 'recipes-find'
    or p_context_key like 'publication-recipes:%';
begin
  if v_account_id is null then
    raise exception 'Authentication required';
  end if;
  if p_state is null
    or jsonb_typeof(p_state) <> 'object'
    or p_state->>'schema_version' not in ('1', '2') then
    raise exception 'Invalid explorer state';
  end if;
  if jsonb_typeof(p_state->'filters') <> 'array'
    or jsonb_array_length(p_state->'filters') > 10 then
    raise exception 'Invalid explorer filters';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_account_id::text || ':' || coalesce(p_context_key, ''), 0)
  );

  if p_state->>'schema_version' = '1' then
    select state->'display_preferences'
    into v_preferences
    from public.explorer_state
    where account_id = v_account_id and context_key = p_context_key
    for update;
  elsif jsonb_typeof(p_state->'display_preferences') <> 'object' then
    raise exception 'Invalid explorer display preferences';
  end if;

  if p_state ? 'column_filters' then
    if jsonb_typeof(p_state->'column_filters') <> 'object' then
      raise exception 'Invalid explorer column filters';
    end if;
    for v_column_filter in
      select key, value from jsonb_each(p_state->'column_filters')
    loop
      if v_column_filter.key = any(v_source_fields) then
        if not v_recipe_context
          or jsonb_typeof(v_column_filter.value) <> 'array'
          or jsonb_array_length(v_column_filter.value) > 500
          or exists (
            select 1
            from jsonb_array_elements(v_column_filter.value) as selection(value)
            where jsonb_typeof(selection.value) <> 'string'
          ) then
          raise exception 'Invalid explorer source column filters';
        end if;
      end if;
    end loop;
  end if;

  for v_filter in
    select value from jsonb_array_elements(p_state->'filters') as filter_row(value)
  loop
    v_field := v_filter->>'field';
    v_operator := v_filter->>'operator';
    if v_field = any(v_source_fields) then
      if not v_recipe_context
        or jsonb_typeof(v_filter) <> 'object'
        or not (v_filter ? 'field' and v_filter ? 'operator')
        or exists (
          select 1 from jsonb_object_keys(v_filter) as filter_key(key)
          where filter_key.key not in ('field', 'operator', 'value', 'value_to')
        )
        or v_operator not in (
          'contains', 'does_not_contain', 'equals', 'starts_with', 'is_empty',
          'is_not_empty', 'in', 'not_in', 'not_equals'
        ) then
        raise exception 'Invalid explorer source filter';
      end if;
    end if;
  end loop;

  if p_state->>'schema_version' = '2' then
    if not (
      p_state->'display_preferences' ? 'visible_columns'
      and p_state->'display_preferences' ? 'column_widths'
    ) then
      raise exception 'Invalid explorer display preferences';
    end if;

    v_preferences := p_state->'display_preferences';
    if jsonb_typeof(v_preferences->'visible_columns') <> 'array'
      or jsonb_typeof(v_preferences->'column_widths') <> 'object' then
      raise exception 'Invalid explorer display preferences';
    end if;

    select coalesce(
      jsonb_agg(
        to_jsonb(case column_name.value when 'citation' then 'publication_source' else column_name.value end)
        order by column_name.ordinality
      ),
      '[]'::jsonb
    )
    into v_legacy_visible_columns
    from jsonb_array_elements_text(v_preferences->'visible_columns')
      with ordinality as column_name(value, ordinality);

    v_legacy_widths := v_preferences->'column_widths' - 'citation';
    if v_preferences->'column_widths' ? 'citation'
      and not (v_preferences->'column_widths' ? 'publication_source') then
      v_legacy_widths := v_legacy_widths || jsonb_build_object(
        'publication_source', v_preferences->'column_widths'->'citation'
      );
    end if;
    v_legacy_preferences := jsonb_set(
      jsonb_set(v_preferences, '{visible_columns}', v_legacy_visible_columns),
      '{column_widths}',
      v_legacy_widths
    );
    v_legacy_state := jsonb_set(p_state, '{display_preferences}', v_legacy_preferences);
  end if;

  if p_state ? 'column_filters' then
    v_legacy_state := jsonb_set(
      v_legacy_state,
      '{column_filters}',
      p_state->'column_filters' - v_source_fields
    );
  end if;

  select coalesce(jsonb_agg(filter_row.value order by filter_row.ordinality), '[]'::jsonb)
  into v_legacy_filters
  from jsonb_array_elements(p_state->'filters') with ordinality as filter_row(value, ordinality)
  where not ((filter_row.value->>'field') = any(v_source_fields));
  v_legacy_state := jsonb_set(v_legacy_state, '{filters}', v_legacy_filters);

  if p_context_key like 'publication-recipes:%'
    and v_legacy_state->>'view' = 'details' then
    v_legacy_state := jsonb_set(v_legacy_state, '{view}', '"list"'::jsonb);
  end if;

  perform public.update_explorer_state_with_legacy_validation(p_context_key, v_legacy_state);

  if p_state->>'schema_version' = '1' and v_preferences is not null then
    v_final_state := p_state || jsonb_build_object(
      'schema_version', 2,
      'display_preferences', v_preferences
    );
  else
    v_final_state := p_state;
  end if;

  update public.explorer_state
  set state = v_final_state,
      updated_at = now()
  where account_id = v_account_id and context_key = p_context_key;

  if not found then
    raise exception 'Explorer preference could not be saved';
  end if;
end;
$$;

revoke all on function public.update_explorer_state(text, jsonb) from public, anon;
grant execute on function public.update_explorer_state(text, jsonb) to authenticated;