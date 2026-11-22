do $$
declare
  function_source text;
  old_daily_guard constant text :=
    $pattern$if current_last_made_at is not null$pattern$;
  new_daily_guard constant text :=
    $pattern$if current_state <> 'want_to_try' and current_last_made_at is not null$pattern$;
  old_overflow_guard constant text :=
    $pattern$if current_made_count = 2147483647 then$pattern$;
  new_overflow_guard constant text :=
    $pattern$if current_state <> 'want_to_try' and current_made_count = 2147483647 then$pattern$;
  old_increment constant text :=
    $pattern$made_count = current_made_count + 1,$pattern$;
  new_increment constant text :=
    $pattern$made_count = case
        when current_state = 'want_to_try' then 1
        else current_made_count + 1
      end,$pattern$;
begin
  select pg_catalog.pg_get_functiondef(
    'private.mark_recipe_made_at(uuid,integer,text,timestamptz)'::regprocedure
  )
  into function_source;

  if pg_catalog.strpos(function_source, old_daily_guard) = 0
    or pg_catalog.strpos(function_source, old_overflow_guard) = 0
    or pg_catalog.strpos(function_source, old_increment) = 0 then
    raise exception 'Expected Made action transition anchors were not found';
  end if;

  function_source := pg_catalog.replace(function_source, old_daily_guard, new_daily_guard);
  function_source := pg_catalog.replace(function_source, old_overflow_guard, new_overflow_guard);
  function_source := pg_catalog.replace(function_source, old_increment, new_increment);
  execute function_source;
end;
$$;

do $$
declare
  function_source text;
  old_want_count constant text :=
    $pattern$      if recipe_state = 'will_not_try' then return false; end if;$pattern$;
  new_want_count constant text :=
    $pattern$      if recipe_state = 'will_not_try' then return false; end if;
      if recipe_state = 'want_to_try' then made_count := 0; end if;$pattern$;
  old_empty_date constant text :=
    $pattern$if recipe_state = 'will_not_try' or last_made_at is null then$pattern$;
  new_empty_date constant text :=
    $pattern$if recipe_state in ('will_not_try', 'want_to_try') or last_made_at is null then$pattern$;
begin
  select pg_catalog.pg_get_functiondef(
    'private.recipe_search_filter_matches(uuid,uuid,jsonb)'::regprocedure
  )
  into function_source;

  if pg_catalog.strpos(function_source, old_want_count) = 0
    or pg_catalog.strpos(function_source, old_empty_date) = 0 then
    raise exception 'Expected Made search filter anchors were not found';
  end if;

  function_source := pg_catalog.replace(function_source, old_want_count, new_want_count);
  function_source := pg_catalog.replace(function_source, old_empty_date, new_empty_date);
  execute function_source;
end;
$$;

do $$
declare
  function_source text;
  old_count_sort constant text :=
    $pattern$when 'made_count' then case
          when recipe.state = 'will_not_try' then null
          else recipe.made_count::numeric
        end$pattern$;
  new_count_sort constant text :=
    $pattern$when 'made_count' then case
          when recipe.state = 'will_not_try' then null
          when recipe.state = 'want_to_try' then 0::numeric
          else recipe.made_count::numeric
        end$pattern$;
  old_date_sort constant text :=
    $pattern$when 'last_made_at' then case
          when recipe.state = 'will_not_try' then null
          else recipe.last_made_at
        end$pattern$;
  new_date_sort constant text :=
    $pattern$when 'last_made_at' then case
          when recipe.state in ('will_not_try', 'want_to_try') then null
          else recipe.last_made_at
        end$pattern$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.search_recipes(text,integer,integer,jsonb,text,text,uuid)'::regprocedure
  )
  into function_source;

  if pg_catalog.strpos(function_source, old_count_sort) = 0
    or pg_catalog.strpos(function_source, old_date_sort) = 0 then
    raise exception 'Expected Made search sort anchors were not found';
  end if;

  function_source := pg_catalog.replace(function_source, old_count_sort, new_count_sort);
  function_source := pg_catalog.replace(function_source, old_date_sort, new_date_sort);
  execute function_source;
end;
$$;

notify pgrst, 'reload schema';
