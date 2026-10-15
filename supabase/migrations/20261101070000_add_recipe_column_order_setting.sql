alter table public.accounts
  add column recipe_column_order text[] not null default array[
    'name', 'publication', 'publication_page', 'recipe_url', 'state', 'enthusiasm',
    'verdict', 'reason', 'occasion_details', 'serves', 'equipment', 'food_type',
    'meal_type', 'cuisine', 'tags', 'main_ingredients', 'prep_time_minutes',
    'mixing_time_minutes', 'marinate_time_minutes', 'chill_time_minutes',
    'freeze_time_minutes', 'cook_time_minutes', 'bake_time_minutes',
    'cooling_time_minutes', 'rest_time_minutes', 'total_time_minutes', 'created_at',
    'updated_at', 'pairs_with', 'opinion', 'publication_source'
  ]::text[];

alter table public.accounts
  add constraint accounts_recipe_column_order_check
  check (
    pg_catalog.cardinality(recipe_column_order) = 31
    and pg_catalog.array_position(recipe_column_order, null) is null
    and recipe_column_order @> array[
      'name', 'publication', 'publication_page', 'recipe_url', 'state', 'enthusiasm',
      'verdict', 'reason', 'occasion_details', 'serves', 'equipment', 'food_type',
      'meal_type', 'cuisine', 'tags', 'main_ingredients', 'prep_time_minutes',
      'mixing_time_minutes', 'marinate_time_minutes', 'chill_time_minutes',
      'freeze_time_minutes', 'cook_time_minutes', 'bake_time_minutes',
      'cooling_time_minutes', 'rest_time_minutes', 'total_time_minutes', 'created_at',
      'updated_at', 'pairs_with', 'opinion', 'publication_source'
    ]::text[]
    and recipe_column_order <@ array[
      'name', 'publication', 'publication_page', 'recipe_url', 'state', 'enthusiasm',
      'verdict', 'reason', 'occasion_details', 'serves', 'equipment', 'food_type',
      'meal_type', 'cuisine', 'tags', 'main_ingredients', 'prep_time_minutes',
      'mixing_time_minutes', 'marinate_time_minutes', 'chill_time_minutes',
      'freeze_time_minutes', 'cook_time_minutes', 'bake_time_minutes',
      'cooling_time_minutes', 'rest_time_minutes', 'total_time_minutes', 'created_at',
      'updated_at', 'pairs_with', 'opinion', 'publication_source'
    ]::text[]
  );

create function public.update_recipe_column_order(p_column_order text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account_id uuid := (select auth.uid());
  v_allowed_columns text[] := array[
    'name', 'publication', 'publication_page', 'recipe_url', 'state', 'enthusiasm',
    'verdict', 'reason', 'occasion_details', 'serves', 'equipment', 'food_type',
    'meal_type', 'cuisine', 'tags', 'main_ingredients', 'prep_time_minutes',
    'mixing_time_minutes', 'marinate_time_minutes', 'chill_time_minutes',
    'freeze_time_minutes', 'cook_time_minutes', 'bake_time_minutes',
    'cooling_time_minutes', 'rest_time_minutes', 'total_time_minutes', 'created_at',
    'updated_at', 'pairs_with', 'opinion', 'publication_source'
  ];
begin
  if v_account_id is null then
    raise exception 'Authentication required';
  end if;

  if p_column_order is null
    or pg_catalog.cardinality(p_column_order) <> pg_catalog.cardinality(v_allowed_columns)
    or pg_catalog.array_position(p_column_order, null) is not null
    or not (p_column_order @> v_allowed_columns and p_column_order <@ v_allowed_columns) then
    raise exception 'Invalid recipe column order';
  end if;

  update public.accounts
  set recipe_column_order = p_column_order
  where id = v_account_id;

  if not found then
    raise exception 'Account not found';
  end if;
end;
$$;

revoke all on function public.update_recipe_column_order(text[]) from public, anon;
grant execute on function public.update_recipe_column_order(text[]) to authenticated;