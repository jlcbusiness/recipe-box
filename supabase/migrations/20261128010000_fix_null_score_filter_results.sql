do $$
declare
  function_source text;
  old_score_comparison constant text :=
    $pattern$    if operator_name = 'is_empty' then
      return score_value is null;
    elsif operator_name = 'is_not_empty' then
      return score_value is not null;
    end if;

    return case operator_name$pattern$;
  new_score_comparison constant text :=
    $pattern$    if operator_name = 'is_empty' then
      return score_value is null;
    elsif operator_name = 'is_not_empty' then
      return score_value is not null;
    end if;

    if score_value is null then
      return false;
    end if;

    return case operator_name$pattern$;
begin
  select pg_catalog.pg_get_functiondef(
    'private.recipe_search_filter_matches(uuid,uuid,jsonb)'::regprocedure
  )
  into function_source;

  if pg_catalog.strpos(function_source, old_score_comparison) = 0 then
    raise exception 'Expected Rating comparison branch was not found';
  end if;

  execute pg_catalog.replace(function_source, old_score_comparison, new_score_comparison);
end;
$$;
