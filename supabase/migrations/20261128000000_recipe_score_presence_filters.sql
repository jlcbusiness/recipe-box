alter function private.recipe_search_filter_matches(uuid, uuid, jsonb)
  rename to recipe_search_filter_matches_before_score_presence;

create function private.recipe_search_filter_matches(
  target_account_id uuid,
  target_recipe_id uuid,
  filter jsonb
)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  field_name text := filter->>'field';
  operator_name text := filter->>'operator';
  score_value smallint;
  comparison_value numeric;
  upper_value numeric;
begin
  if field_name = 'score' then
    if operator_name in ('is_empty', 'is_not_empty') then
      if filter ? 'value' or filter ? 'value_to' then
        raise exception 'Score existence filters do not accept values.'
          using errcode = '22023';
      end if;
    elsif operator_name not in (
      'equals', 'not_equals', 'greater_than', 'less_than', 'at_least', 'at_most', 'between'
    )
      or pg_catalog.jsonb_typeof(filter->'value') is distinct from 'number'
      or (operator_name = 'between'
        and pg_catalog.jsonb_typeof(filter->'value_to') is distinct from 'number') then
      raise exception 'Score filters require a supported comparison and numeric value.'
        using errcode = '22023';
    end if;

    comparison_value := (filter->>'value')::numeric;
    upper_value := case
      when operator_name = 'between' then (filter->>'value_to')::numeric
      else null
    end;

    select recipe.score
    into score_value
    from public.recipes as recipe
    where recipe.account_id = target_account_id
      and recipe.id = target_recipe_id;

    if not found then
      return false;
    end if;

    if operator_name = 'is_empty' then
      return score_value is null;
    elsif operator_name = 'is_not_empty' then
      return score_value is not null;
    end if;

    return case operator_name
      when 'equals' then score_value = comparison_value
      when 'not_equals' then score_value is not null and score_value <> comparison_value
      when 'greater_than' then score_value > comparison_value
      when 'less_than' then score_value < comparison_value
      when 'at_least' then score_value >= comparison_value
      when 'at_most' then score_value <= comparison_value
      else score_value between comparison_value and upper_value
    end;
  end if;

  return private.recipe_search_filter_matches_before_score_presence(
    target_account_id,
    target_recipe_id,
    filter
  );
end;
$$;

revoke all on function private.recipe_search_filter_matches(uuid, uuid, jsonb)
  from public, anon;
grant execute on function private.recipe_search_filter_matches(uuid, uuid, jsonb)
  to authenticated;
revoke all on function private.recipe_search_filter_matches_before_score_presence(uuid, uuid, jsonb)
  from public, anon;
grant execute on function private.recipe_search_filter_matches_before_score_presence(uuid, uuid, jsonb)
  to authenticated;

do $$
declare
  function_source text;
  old_numeric_validation constant text :=
    $pattern$      if operator_name not in ('equals', 'not_equals', 'greater_than', 'less_than', 'at_least', 'at_most', 'between')
        or pg_catalog.jsonb_typeof(filter->'value') <> 'number' then
        raise exception 'Numeric filters require a supported comparison and numeric value.' using errcode = '22023';
      end if;$pattern$;
  new_numeric_validation constant text :=
    $pattern$      if field_name = 'score' and operator_name in ('is_empty', 'is_not_empty') then
        if filter ? 'value' or filter ? 'value_to' then
          raise exception 'Score existence filters do not accept values.'
            using errcode = '22023';
        end if;
      elsif operator_name not in ('equals', 'not_equals', 'greater_than', 'less_than', 'at_least', 'at_most', 'between')
        or pg_catalog.jsonb_typeof(filter->'value') is distinct from 'number' then
        raise exception 'Numeric filters require a supported comparison and numeric value.' using errcode = '22023';
      end if;$pattern$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.search_recipes(text,integer,integer,jsonb,text,text,uuid)'::regprocedure
  )
  into function_source;

  if pg_catalog.strpos(function_source, old_numeric_validation) = 0 then
    raise exception 'Expected recipe numeric filter validation was not found';
  end if;

  function_source := pg_catalog.replace(
    function_source,
    old_numeric_validation,
    new_numeric_validation
  );
  execute function_source;
end;
$$;

notify pgrst, 'reload schema';
