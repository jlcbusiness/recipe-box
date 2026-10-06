create or replace function public.recipe_history_after_save()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  before_ingredients jsonb := coalesce(
    nullif(current_setting('app.recipe_ingredients_before', true), '')::jsonb,
    '[]'::jsonb
  );
  after_ingredients jsonb;
begin
  if session_user = 'supabase_auth_admin'
    and old.trashed_at is not null
    and old.trashed_at is not distinct from new.trashed_at
    and old.trashed_by_user_id is not null
    and new.trashed_by_user_id is null
  then
    return new;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'ingredient_id', recipe_ingredient.ingredient_id,
        'name', ingredient.name,
        'position', recipe_ingredient.position,
        'is_main', recipe_ingredient.is_main,
        'detail', recipe_ingredient.detail,
        'preparation', recipe_ingredient.preparation,
        'measurements', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'measurement_type', measurement.measurement_type,
              'amount_min', measurement.amount_min,
              'amount_max', measurement.amount_max,
              'unit_code', measurement.unit_code,
              'picklist_value_id', measurement.picklist_value_id,
              'picklist_value', picklist.value
            ) order by measurement.position
          )
          from public.recipe_ingredient_measurements as measurement
          left join public.recipe_picklist_values as picklist
            on picklist.account_id = measurement.account_id
            and picklist.id = measurement.picklist_value_id
          where measurement.account_id = recipe_ingredient.account_id
            and measurement.recipe_ingredient_id = recipe_ingredient.id
        ), '[]'::jsonb)
      ) order by recipe_ingredient.position
    ),
    '[]'::jsonb
  )
  into after_ingredients
  from public.recipe_ingredients as recipe_ingredient
  join public.ingredients as ingredient
    on ingredient.account_id = recipe_ingredient.account_id
    and ingredient.id = recipe_ingredient.ingredient_id
  where recipe_ingredient.account_id = new.account_id
    and recipe_ingredient.recipe_id = new.id;

  insert into public.recipe_history (
    account_id,
    actor_user_id,
    record_id,
    event_type,
    before_data,
    after_data
  )
  values (
    new.account_id,
    auth.uid(),
    new.id,
    case
      when tg_op = 'INSERT' then 'recipe.created'
      when old.trashed_at is null and new.trashed_at is not null then 'recipe.trashed'
      when old.trashed_at is not null and new.trashed_at is null then 'recipe.restored'
      else 'recipe.updated'
    end,
    case
      when tg_op = 'INSERT' then null
      else to_jsonb(old) || jsonb_build_object('ingredients', before_ingredients)
    end,
    to_jsonb(new) || jsonb_build_object('ingredients', after_ingredients)
  );

  return new;
end;
$$;

drop trigger recipe_history_after_insert on public.recipes;
drop trigger recipe_history_after_update on public.recipes;
create constraint trigger recipe_history_after_save
  after insert or update on public.recipes
  deferrable initially deferred
  for each row execute function public.recipe_history_after_save();