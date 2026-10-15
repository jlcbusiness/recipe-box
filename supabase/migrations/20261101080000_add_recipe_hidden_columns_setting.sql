create function public.is_valid_recipe_hidden_columns(p_hidden_columns text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_hidden_columns is not null
    and pg_catalog.array_position(p_hidden_columns, null) is null
    and p_hidden_columns <@ array[
      'name', 'publication', 'publication_page', 'recipe_url', 'state', 'enthusiasm',
      'verdict', 'reason', 'occasion_details', 'serves', 'equipment', 'food_type',
      'meal_type', 'cuisine', 'tags', 'main_ingredients', 'prep_time_minutes',
      'mixing_time_minutes', 'marinate_time_minutes', 'chill_time_minutes',
      'freeze_time_minutes', 'cook_time_minutes', 'bake_time_minutes',
      'cooling_time_minutes', 'rest_time_minutes', 'total_time_minutes', 'created_at',
      'updated_at', 'pairs_with', 'opinion', 'publication_source'
    ]::text[]
    and pg_catalog.cardinality(p_hidden_columns) = (
      select pg_catalog.count(distinct hidden_column.value)
      from pg_catalog.unnest(p_hidden_columns) as hidden_column(value)
    );
$$;

revoke all on function public.is_valid_recipe_hidden_columns(text[]) from public, anon;
grant execute on function public.is_valid_recipe_hidden_columns(text[]) to authenticated;

alter table public.accounts
  add column recipe_hidden_columns text[] not null default array[]::text[];

alter table public.accounts
  add constraint accounts_recipe_hidden_columns_check
  check (public.is_valid_recipe_hidden_columns(recipe_hidden_columns));

create function public.update_recipe_hidden_columns(p_hidden_columns text[])
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

  if not public.is_valid_recipe_hidden_columns(p_hidden_columns) then
    raise exception 'Invalid hidden recipe columns';
  end if;

  update public.accounts
  set recipe_hidden_columns = p_hidden_columns
  where id = v_account_id;

  if not found then
    raise exception 'Account not found';
  end if;
end;
$$;

revoke all on function public.update_recipe_hidden_columns(text[]) from public, anon;
grant execute on function public.update_recipe_hidden_columns(text[]) to authenticated;