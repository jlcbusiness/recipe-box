create table public.recipe_steps (
  id uuid primary key,
  account_id uuid not null,
  recipe_id uuid not null,
  position smallint not null check (position >= 0),
  content_markdown text not null check (length(trim(content_markdown)) > 0),
  plain_text text not null,
  unique (account_id, recipe_id, id),
  unique (account_id, recipe_id, position),
  foreign key (account_id, recipe_id)
    references public.recipes (account_id, id) on delete cascade
);

create index recipe_steps_owner_order_idx
  on public.recipe_steps (account_id, recipe_id, position);

alter table public.recipe_steps enable row level security;
grant select, insert, delete on public.recipe_steps to authenticated;

create policy "Account owners can read recipe instruction steps"
  on public.recipe_steps
  for select
  to authenticated
  using ((select auth.uid()) = account_id);

create policy "Account owners can add instruction steps during recipe save"
  on public.recipe_steps
  for insert
  to authenticated
  with check (
    (select auth.uid()) = account_id
    and current_setting('app.recipe_save_context', true) = 'on'
  );

create policy "Account owners can remove instruction steps during recipe save"
  on public.recipe_steps
  for delete
  to authenticated
  using (
    (select auth.uid()) = account_id
    and current_setting('app.recipe_save_context', true) = 'on'
  );

create function public.recipe_history_add_instruction_steps()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  before_setting text := nullif(current_setting('app.recipe_steps_before', true), '');
  before_steps jsonb;
  after_steps jsonb;
begin
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', step.id,
        'position', step.position,
        'content_markdown', step.content_markdown,
        'plain_text', step.plain_text
      ) order by step.position
    ),
    '[]'::jsonb
  )
  into after_steps
  from public.recipe_steps as step
  where step.account_id = new.account_id
    and step.recipe_id = new.record_id;

  if before_setting is not null then
    before_steps := before_setting::jsonb;
  elsif new.before_data is not null then
    before_steps := after_steps;
  else
    before_steps := '[]'::jsonb;
  end if;

  if new.before_data is not null then
    new.before_data := new.before_data || jsonb_build_object('steps', before_steps);
  end if;
  new.after_data := new.after_data || jsonb_build_object('steps', after_steps);
  return new;
end;
$$;

create trigger recipe_history_add_instruction_steps
  before insert on public.recipe_history
  for each row execute function public.recipe_history_add_instruction_steps();

create function public.save_recipe(
  p_recipe_id uuid,
  p_expected_version integer,
  p_name text,
  p_food_type_id uuid,
  p_state text,
  p_verdict_id uuid,
  p_enthusiasm_id uuid,
  p_occasion_details text,
  p_reason text,
  p_serves integer,
  p_prep_time_minutes integer,
  p_mixing_time_minutes integer,
  p_marinate_time_minutes integer,
  p_chill_time_minutes integer,
  p_freeze_time_minutes integer,
  p_cook_time_minutes integer,
  p_bake_time_minutes integer,
  p_cooling_time_minutes integer,
  p_rest_time_minutes integer,
  p_total_time_minutes integer,
  p_notes_markdown text,
  p_meal_type_ids uuid[],
  p_cuisine_ids uuid[],
  p_equipment_ids uuid[],
  p_ingredient_rows jsonb,
  p_instruction_steps jsonb
)
returns table (id uuid, version integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  saved_id uuid;
  saved_version integer;
  before_steps jsonb;
  step_data jsonb;
  step_id uuid;
  step_position integer := 0;
  content_markdown text;
  plain_text text;
  unknown_step_key text;
begin
  if owner_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if p_instruction_steps is null or jsonb_typeof(p_instruction_steps) <> 'array' then
    raise exception 'Instruction steps must be an array.' using errcode = '23514';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', step.id,
        'position', step.position,
        'content_markdown', step.content_markdown,
        'plain_text', step.plain_text
      ) order by step.position
    ),
    '[]'::jsonb
  )
  into before_steps
  from public.recipe_steps as step
  where step.account_id = owner_id
    and step.recipe_id = p_recipe_id;

  perform pg_catalog.set_config('app.recipe_steps_before', before_steps::text, true);

  select saved_recipe.id, saved_recipe.version
  into saved_id, saved_version
  from public.save_recipe(
    p_recipe_id,
    p_expected_version,
    p_name,
    p_food_type_id,
    p_state,
    p_verdict_id,
    p_enthusiasm_id,
    p_occasion_details,
    p_reason,
    p_serves,
    p_prep_time_minutes,
    p_mixing_time_minutes,
    p_marinate_time_minutes,
    p_chill_time_minutes,
    p_freeze_time_minutes,
    p_cook_time_minutes,
    p_bake_time_minutes,
    p_cooling_time_minutes,
    p_rest_time_minutes,
    p_total_time_minutes,
    p_notes_markdown,
    p_ingredient_rows,
    p_meal_type_ids,
    p_cuisine_ids,
    p_equipment_ids
  ) as saved_recipe;

  delete from public.recipe_steps as step
  where step.account_id = owner_id
    and step.recipe_id = saved_id;

  for step_data in
    select step_entry.value
    from jsonb_array_elements(p_instruction_steps) with ordinality as step_entry(value, ordinal)
    order by step_entry.ordinal
  loop
    if jsonb_typeof(step_data) <> 'object' then
      raise exception 'Each instruction step must be an object.' using errcode = '23514';
    end if;

    select object_key.key
    into unknown_step_key
    from jsonb_object_keys(step_data) as object_key(key)
    where object_key.key not in ('id', 'position', 'content_markdown', 'plain_text')
    limit 1;
    if unknown_step_key is not null then
      raise exception 'Instruction step contains an unknown field.' using errcode = '23514';
    end if;

    step_id := nullif(step_data->>'id', '')::uuid;
    content_markdown := nullif(trim(step_data->>'content_markdown'), '');
    plain_text := trim(coalesce(step_data->>'plain_text', ''));
    if step_id is null or content_markdown is null then
      raise exception 'Instruction step ID and Markdown are required.' using errcode = '23514';
    end if;
    if nullif(step_data->>'position', '')::integer is distinct from step_position then
      raise exception 'Instruction step positions must be contiguous and ordered.' using errcode = '23514';
    end if;

    insert into public.recipe_steps (
      id, account_id, recipe_id, position, content_markdown, plain_text
    )
    values (
      step_id, owner_id, saved_id, step_position, content_markdown, plain_text
    );
    step_position := step_position + 1;
  end loop;

  return query select saved_id, saved_version;
end;
$$;

revoke all on function public.save_recipe(
  uuid, integer, text, uuid, text, uuid, uuid, text, text, integer,
  integer, integer, integer, integer, integer, integer, integer, integer,
  integer, integer, text, uuid[], uuid[], uuid[], jsonb, jsonb
) from public, anon;
grant execute on function public.save_recipe(
  uuid, integer, text, uuid, text, uuid, uuid, text, text, integer,
  integer, integer, integer, integer, integer, integer, integer, integer,
  integer, integer, text, uuid[], uuid[], uuid[], jsonb, jsonb
) to authenticated;