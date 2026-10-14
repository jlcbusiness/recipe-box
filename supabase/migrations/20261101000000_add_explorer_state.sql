create table public.explorer_state (
  account_id uuid not null references public.accounts (id) on delete cascade,
  context_key text not null,
  state jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (account_id, context_key),
  constraint explorer_state_payload_is_object check (jsonb_typeof(state) = 'object')
);

create index explorer_state_account_id_idx on public.explorer_state (account_id);

alter table public.explorer_state enable row level security;
revoke all on public.explorer_state from public, anon, authenticated;
grant select on public.explorer_state to authenticated;

create policy "Account owners can read their explorer state"
  on public.explorer_state
  for select
  to authenticated
  using ((select auth.uid()) = account_id);

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
  v_publication_id uuid;
  v_filter jsonb;
  v_field text;
  v_operator text;
  v_recipe_context boolean := p_context_key = 'recipes-find'
    or p_context_key like 'publication-recipes:%';
begin
  if v_account_id is null then
    raise exception 'Authentication required';
  end if;

  if p_context_key is null
    or (
      p_context_key <> 'recipes-find'
      and p_context_key <> 'publications'
      and p_context_key !~ '^publication-recipes:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    ) then
    raise exception 'Unsupported explorer context';
  end if;

  if p_context_key like 'publication-recipes:%' then
    v_publication_id := substring(p_context_key from 21)::uuid;
    if not exists (
      select 1
      from public.publications
      where id = v_publication_id
        and account_id = v_account_id
        and trashed_at is null
    ) then
      raise exception 'Publication is unavailable';
    end if;
  end if;

  if p_state is null
    or jsonb_typeof(p_state) <> 'object'
    or p_state->>'schema_version' <> '1'
    or not (p_state ? 'filters' and p_state ? 'sort' and p_state ? 'direction' and p_state ? 'view')
    or exists (
      select 1
      from jsonb_object_keys(p_state) as key
      where key not in ('schema_version', 'filters', 'sort', 'direction', 'view', 'type')
    )
    or jsonb_typeof(p_state->'filters') <> 'array'
    or jsonb_array_length(p_state->'filters') > 10
    or p_state->>'direction' not in ('asc', 'desc')
    or p_state->>'view' not in ('list', 'grid') then
    raise exception 'Invalid explorer state';
  end if;

  if v_recipe_context and (
    p_state ? 'type'
    or p_state->>'sort' not in ('relevance', 'name', 'state', 'total_time_minutes', 'created_at', 'updated_at')
  ) then
    raise exception 'Invalid recipe explorer state';
  end if;

  if p_context_key = 'publications' and (
    p_state->>'sort' not in ('relevance', 'name', 'type', 'author', 'edition', 'recipe_count', 'created_at', 'updated_at')
    or (p_state ? 'type' and p_state->>'type' not in ('all', 'book', 'magazine', 'site'))
  ) then
    raise exception 'Invalid publication explorer state';
  end if;

  for v_filter in select value from jsonb_array_elements(p_state->'filters')
  loop
    v_field := v_filter->>'field';
    v_operator := v_filter->>'operator';

    if jsonb_typeof(v_filter) <> 'object'
      or not (v_filter ? 'field' and v_filter ? 'operator')
      or exists (
        select 1
        from jsonb_object_keys(v_filter) as key
        where key not in ('field', 'operator', 'value', 'value_to')
      )
      or v_field is null
      or v_operator not in (
        'contains', 'does_not_contain', 'equals', 'starts_with', 'is_empty',
        'is_not_empty', 'contains_any', 'contains_all', 'in', 'not_in', 'is',
        'is_not', 'not_equals', 'greater_than', 'less_than', 'at_least',
        'at_most', 'between'
      ) then
      raise exception 'Invalid explorer filter';
    end if;

    if v_recipe_context and v_field not in (
      'name', 'notes_markdown', 'reason', 'occasion_details', 'publication_author',
      'ingredient', 'state', 'food_type', 'verdict', 'enthusiasm', 'publication_id',
      'meal_type', 'cuisine', 'equipment', 'tag', 'serves', 'prep_time_minutes',
      'mixing_time_minutes', 'marinate_time_minutes', 'chill_time_minutes',
      'freeze_time_minutes', 'cook_time_minutes', 'bake_time_minutes',
      'cooling_time_minutes', 'rest_time_minutes', 'total_time_minutes', 'created_at',
      'updated_at'
    ) then
      raise exception 'Unsupported recipe filter field';
    end if;

    if p_context_key = 'publications' and v_field not in (
      'name', 'author', 'edition', 'isbn', 'retailer_url', 'site_url',
      'publication_type', 'tag', 'recipe_count', 'created_at', 'updated_at'
    ) then
      raise exception 'Unsupported publication filter field';
    end if;
  end loop;

  insert into public.explorer_state (account_id, context_key, state)
  values (v_account_id, p_context_key, p_state)
  on conflict (account_id, context_key)
  do update set state = excluded.state, updated_at = now();
end;
$$;

revoke all on function public.update_explorer_state(text, jsonb) from public, anon;
grant execute on function public.update_explorer_state(text, jsonb) to authenticated;