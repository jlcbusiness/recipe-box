create function public.recipe_history_capture_mentions_before_recipe_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  mention_snapshot jsonb;
begin
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'recipe_step_id', mention.recipe_step_id,
        'position', mention.position,
        'recipe_ingredient_id', mention.recipe_ingredient_id
      ) order by step.position, mention.position
    ),
    '[]'::jsonb
  )
  into mention_snapshot
  from public.recipe_step_mentions as mention
  join public.recipe_steps as step
    on step.account_id = mention.account_id
    and step.recipe_id = mention.recipe_id
    and step.id = mention.recipe_step_id
  where mention.account_id = old.account_id
    and mention.recipe_id = old.id;

  perform pg_catalog.set_config('app.recipe_mentions_before', mention_snapshot::text, true);
  return new;
end;
$$;

create trigger recipe_history_capture_mentions_before_recipe_update
  before update on public.recipes
  for each row execute function public.recipe_history_capture_mentions_before_recipe_update();

create or replace function public.recipe_history_add_instruction_steps()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  before_setting text := nullif(current_setting('app.recipe_steps_before', true), '');
  before_mentions_setting text := nullif(current_setting('app.recipe_mentions_before', true), '');
  raw_before_steps jsonb;
  before_mentions jsonb := coalesce(before_mentions_setting::jsonb, '[]'::jsonb);
  before_steps jsonb;
  after_steps jsonb;
begin
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', step.id,
        'position', step.position,
        'content_markdown', step.content_markdown,
        'plain_text', step.plain_text,
        'mentions', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'position', mention.position,
              'recipe_ingredient_id', mention.recipe_ingredient_id
            ) order by mention.position
          )
          from public.recipe_step_mentions as mention
          where mention.account_id = step.account_id
            and mention.recipe_id = step.recipe_id
            and mention.recipe_step_id = step.id
        ), '[]'::jsonb)
      ) order by step.position
    ),
    '[]'::jsonb
  )
  into after_steps
  from public.recipe_steps as step
  where step.account_id = new.account_id
    and step.recipe_id = new.record_id;

  if before_setting is not null then
    raw_before_steps := before_setting::jsonb;
  elsif new.before_data is not null then
    raw_before_steps := after_steps;
  else
    raw_before_steps := '[]'::jsonb;
  end if;

  select coalesce(
    jsonb_agg(
      step_entry.value || jsonb_build_object(
        'mentions', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'position', mention_entry.value->'position',
              'recipe_ingredient_id', mention_entry.value->'recipe_ingredient_id'
            ) order by (mention_entry.value->>'position')::integer
          )
          from jsonb_array_elements(before_mentions) as mention_entry(value)
          where mention_entry.value->>'recipe_step_id' = step_entry.value->>'id'
        ), '[]'::jsonb)
      ) order by step_entry.ordinal
    ),
    '[]'::jsonb
  )
  into before_steps
  from jsonb_array_elements(raw_before_steps) with ordinality as step_entry(value, ordinal);

  if new.before_data is not null then
    new.before_data := new.before_data || jsonb_build_object('steps', before_steps);
  end if;
  new.after_data := new.after_data || jsonb_build_object('steps', after_steps);
  return new;
end;
$$;