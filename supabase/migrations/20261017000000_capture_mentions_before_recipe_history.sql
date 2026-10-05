drop trigger if exists recipe_history_capture_step_mentions_before_delete on public.recipe_steps;
drop function if exists public.recipe_history_capture_step_mentions_before_delete();
drop trigger if exists recipe_history_capture_mentions_before_recipe_update on public.recipes;

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
