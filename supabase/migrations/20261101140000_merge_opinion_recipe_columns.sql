alter table public.accounts
  drop constraint accounts_recipe_column_order_check;

update public.accounts as account
set recipe_column_order = array(
      select column_key
      from unnest(account.recipe_column_order) with ordinality as column_entry(column_key, position)
      where column_key not in ('enthusiasm', 'verdict', 'reason')
      order by position
    ),
    recipe_hidden_columns = array_remove(
      array_remove(
        array_remove(
          case
            when exists (
              select 1
              from unnest(array['enthusiasm', 'verdict', 'reason']::text[]) as old_column(column_key)
              where not (old_column.column_key = any(account.recipe_hidden_columns))
            ) then array_remove(account.recipe_hidden_columns, 'opinion')
            else account.recipe_hidden_columns
          end,
          'enthusiasm'
        ),
        'verdict'
      ),
      'reason'
    );

with preference_states as (
  select
    account_id,
    context_key,
    state #> '{display_preferences,visible_columns}' as visible_columns,
    state #> '{display_preferences,column_widths}' as column_widths,
    context_key like 'publication-recipes:%' as publication_context
  from public.explorer_state
  where (context_key = 'recipes-find' or context_key like 'publication-recipes:%')
    and state->>'schema_version' = '2'
    and jsonb_typeof(state #> '{display_preferences,visible_columns}') = 'array'
    and jsonb_typeof(state #> '{display_preferences,column_widths}') = 'object'
), mapped_visible_columns as (
  select
    preferences.account_id,
    preferences.context_key,
    coalesce((
      select jsonb_agg(to_jsonb(mapped.column_key) order by mapped.first_position)
      from (
        select
          case
            when selected.column_key in ('enthusiasm', 'verdict', 'reason') then 'opinion'
            else selected.column_key
          end as column_key,
          min(selected.position) as first_position
        from jsonb_array_elements_text(preferences.visible_columns)
          with ordinality as selected(column_key, position)
        where not (preferences.publication_context and selected.column_key = 'publication')
        group by case
          when selected.column_key in ('enthusiasm', 'verdict', 'reason') then 'opinion'
          else selected.column_key
        end
      ) as mapped
    ), '[]'::jsonb) as visible_columns
  from preference_states as preferences
), mapped_column_widths as (
  select
    account_id,
    context_key,
    case
      when publication_context then column_widths - 'enthusiasm' - 'verdict' - 'reason' - 'publication'
      else column_widths - 'enthusiasm' - 'verdict' - 'reason'
    end as cleaned_widths,
    coalesce(
      column_widths->'opinion',
      column_widths->'enthusiasm',
      column_widths->'verdict',
      column_widths->'reason'
    ) as opinion_width
  from preference_states
), final_column_widths as (
  select
    account_id,
    context_key,
    case
      when cleaned_widths ? 'opinion' or opinion_width is null then cleaned_widths
      else cleaned_widths || jsonb_build_object('opinion', opinion_width)
    end as column_widths
  from mapped_column_widths
)
update public.explorer_state as saved_state
set state = jsonb_set(
  jsonb_set(
    saved_state.state,
    '{display_preferences,visible_columns}',
    mapped_visible_columns.visible_columns
  ),
  '{display_preferences,column_widths}',
  final_column_widths.column_widths
)
from mapped_visible_columns
join final_column_widths using (account_id, context_key)
where saved_state.account_id = mapped_visible_columns.account_id
  and saved_state.context_key = mapped_visible_columns.context_key;

create or replace function public.is_valid_recipe_hidden_columns(p_hidden_columns text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_hidden_columns is not null
    and pg_catalog.array_position(p_hidden_columns, null) is null
    and p_hidden_columns <@ array[
      'name', 'publication', 'publication_page', 'recipe_url', 'state',
      'occasion_details', 'serves', 'equipment', 'food_type', 'meal_type', 'cuisine',
      'tags', 'main_ingredients', 'prep_time_minutes', 'mixing_time_minutes',
      'marinate_time_minutes', 'chill_time_minutes', 'freeze_time_minutes',
      'cook_time_minutes', 'bake_time_minutes', 'cooling_time_minutes',
      'rest_time_minutes', 'total_time_minutes', 'created_at', 'updated_at',
      'pairs_with', 'opinion', 'citation'
    ]::text[]
    and pg_catalog.cardinality(p_hidden_columns) = (
      select pg_catalog.count(distinct hidden_column.value)
      from pg_catalog.unnest(p_hidden_columns) as hidden_column(value)
    );
$$;

alter table public.accounts
  alter column recipe_column_order set default array[
    'name', 'publication', 'publication_page', 'recipe_url', 'state',
    'occasion_details', 'serves', 'equipment', 'food_type', 'meal_type', 'cuisine',
    'tags', 'main_ingredients', 'prep_time_minutes', 'mixing_time_minutes',
    'marinate_time_minutes', 'chill_time_minutes', 'freeze_time_minutes',
    'cook_time_minutes', 'bake_time_minutes', 'cooling_time_minutes',
    'rest_time_minutes', 'total_time_minutes', 'created_at', 'updated_at',
    'pairs_with', 'opinion', 'citation'
  ]::text[],
  alter column recipe_hidden_columns set default array[
    'publication_page', 'recipe_url', 'occasion_details', 'serves', 'equipment',
    'food_type', 'meal_type', 'cuisine', 'tags', 'main_ingredients',
    'prep_time_minutes', 'mixing_time_minutes', 'marinate_time_minutes',
    'chill_time_minutes', 'freeze_time_minutes', 'cook_time_minutes',
    'bake_time_minutes', 'cooling_time_minutes', 'rest_time_minutes',
    'total_time_minutes', 'created_at', 'updated_at', 'pairs_with', 'opinion', 'citation'
  ]::text[];

alter table public.accounts
  add constraint accounts_recipe_column_order_check
  check (
    pg_catalog.cardinality(recipe_column_order) = 28
    and pg_catalog.array_position(recipe_column_order, null) is null
    and recipe_column_order @> array[
      'name', 'publication', 'publication_page', 'recipe_url', 'state',
      'occasion_details', 'serves', 'equipment', 'food_type', 'meal_type', 'cuisine',
      'tags', 'main_ingredients', 'prep_time_minutes', 'mixing_time_minutes',
      'marinate_time_minutes', 'chill_time_minutes', 'freeze_time_minutes',
      'cook_time_minutes', 'bake_time_minutes', 'cooling_time_minutes',
      'rest_time_minutes', 'total_time_minutes', 'created_at', 'updated_at',
      'pairs_with', 'opinion', 'citation'
    ]::text[]
    and recipe_column_order <@ array[
      'name', 'publication', 'publication_page', 'recipe_url', 'state',
      'occasion_details', 'serves', 'equipment', 'food_type', 'meal_type', 'cuisine',
      'tags', 'main_ingredients', 'prep_time_minutes', 'mixing_time_minutes',
      'marinate_time_minutes', 'chill_time_minutes', 'freeze_time_minutes',
      'cook_time_minutes', 'bake_time_minutes', 'cooling_time_minutes',
      'rest_time_minutes', 'total_time_minutes', 'created_at', 'updated_at',
      'pairs_with', 'opinion', 'citation'
    ]::text[]
  );

create or replace function public.update_recipe_column_order(p_column_order text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account_id uuid := (select auth.uid());
  v_allowed_columns text[] := array[
    'name', 'publication', 'publication_page', 'recipe_url', 'state',
    'occasion_details', 'serves', 'equipment', 'food_type', 'meal_type', 'cuisine',
    'tags', 'main_ingredients', 'prep_time_minutes', 'mixing_time_minutes',
    'marinate_time_minutes', 'chill_time_minutes', 'freeze_time_minutes',
    'cook_time_minutes', 'bake_time_minutes', 'cooling_time_minutes',
    'rest_time_minutes', 'total_time_minutes', 'created_at', 'updated_at',
    'pairs_with', 'opinion', 'citation'
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

do $$
declare
  function_source text;
  old_expression constant text :=
    'if p_context_key like ''publication-recipes:%''' || E'\n' ||
    '    and v_legacy_state->>''view'' = ''details'' then';
  new_expression constant text :=
    'if (p_context_key = ''recipes-find'' or p_context_key like ''publication-recipes:%'')' ||
    E'\n' || '    and v_legacy_state->>''view'' = ''details'' then';
begin
  select pg_catalog.pg_get_functiondef(
    'public.update_explorer_state(text,jsonb)'::regprocedure
  )
  into function_source;

  if pg_catalog.strpos(function_source, old_expression) = 0 then
    raise exception 'Expected explorer view compatibility condition was not found';
  end if;

  execute pg_catalog.replace(function_source, old_expression, new_expression);
end;
$$;