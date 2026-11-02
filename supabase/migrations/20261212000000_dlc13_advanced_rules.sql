create function private.recipe_advanced_rules_compile(p_envelope jsonb)
returns text[]
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  token_pattern constant text :=
    '(\(|\)|[0-9]+|&&|&|\|\||\||!|-(?:and|or|not)\y|\y(?:and|or|not)\y)';
  expression_text text;
  rule_list jsonb;
  token_matches text[];
  tokens text[];
  output_tokens text[] := array[]::text[];
  operator_stack text[] := array[]::text[];
  seen_references boolean[];
  validation_filters jsonb;
  token text;
  normalized_operator text;
  stack_operator text;
  reference_number integer;
  token_count integer;
  index_number integer;
  nesting_depth integer := 0;
  expected_operand boolean := true;
  operator_precedence integer;
  stack_precedence integer;
begin
  if p_envelope is null or pg_catalog.jsonb_typeof(p_envelope) <> 'object' then
    raise exception 'Invalid advanced rules envelope.' using errcode = '22023';
  end if;

  if (
      select pg_catalog.count(*)
      from pg_catalog.jsonb_object_keys(p_envelope) as key_name(key)
    ) <> 3
    or not (p_envelope ? 'version' and p_envelope ? 'text' and p_envelope ? 'rules')
    or pg_catalog.jsonb_typeof(p_envelope->'version') <> 'number'
    or p_envelope->>'version' <> '1'
    or pg_catalog.jsonb_typeof(p_envelope->'text') <> 'string'
    or pg_catalog.jsonb_typeof(p_envelope->'rules') <> 'array' then
    raise exception 'Invalid advanced rules envelope.' using errcode = '22023';
  end if;

  if pg_catalog.octet_length(p_envelope::text) > 131072 then
    raise exception 'Advanced rules envelope is too large.' using errcode = '22023';
  end if;

  expression_text := p_envelope->>'text';
  if pg_catalog.char_length(expression_text) = 0
    or pg_catalog.char_length(expression_text) > 1024
    or pg_catalog.btrim(expression_text) = '' then
    raise exception 'Advanced rules text must contain between 1 and 1024 characters.'
      using errcode = '22023';
  end if;

  rule_list := p_envelope->'rules';
  if pg_catalog.jsonb_array_length(rule_list) < 1
    or pg_catalog.jsonb_array_length(rule_list) > 10 then
    raise exception 'Advanced rules must contain between 1 and 10 rules.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(rule_list) as rule(value)
    where pg_catalog.jsonb_typeof(rule.value) <> 'object'
      or not (rule.value ? 'id' and rule.value ? 'field' and rule.value ? 'operator')
      or exists (
        select 1
        from pg_catalog.jsonb_object_keys(rule.value) as key_name(key)
        where key_name.key not in ('id', 'field', 'operator', 'value', 'value_to')
      )
      or pg_catalog.jsonb_typeof(rule.value->'id') <> 'string'
      or (rule.value->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or pg_catalog.jsonb_typeof(rule.value->'field') <> 'string'
      or pg_catalog.jsonb_typeof(rule.value->'operator') <> 'string'
  ) then
    raise exception 'Each advanced rule must be a leaf filter with a UUID id.'
      using errcode = '22023';
  end if;

  if (
    select pg_catalog.count(*) <> pg_catalog.count(distinct pg_catalog.lower(rule.value->>'id'))
    from pg_catalog.jsonb_array_elements(rule_list) as rule(value)
  ) then
    raise exception 'Advanced rule IDs must be unique.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(rule_list) as rule(value)
    where rule.value->>'operator' not in ('is_empty', 'is_not_empty')
      and (
        not (rule.value ? 'value')
        or pg_catalog.jsonb_typeof(rule.value->'value') = 'null'
      )
  ) then
    raise exception 'Advanced rules require a value for each non-empty leaf operator.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(rule_list) as rule(value)
    where rule.value->>'operator' = 'between'
      and not (rule.value ? 'value_to')
  ) then
    raise exception 'Advanced between rules require an upper value.'
      using errcode = '22023';
  end if;

  begin
    select pg_catalog.jsonb_agg(rule.value - 'id' order by rule.ordinality)
    into validation_filters
    from pg_catalog.jsonb_array_elements(rule_list) with ordinality as rule(value, ordinality);

    perform public.search_recipes_before_advanced_rules(
      null, 1, 0, validation_filters, 'name', 'asc', null
    );
  exception
    when sqlstate '22023' then
      raise;
    when others then
      raise exception 'Advanced rule leaves are invalid: %', sqlerrm
        using errcode = '22023';
  end;

  if pg_catalog.regexp_replace(expression_text, token_pattern, '', 'gi') ~ '[^[:space:]]' then
    raise exception 'Advanced rules text contains an unsupported token.'
      using errcode = '22023';
  end if;

  select coalesce(
    pg_catalog.array_agg(match.token[1] order by match.ordinality),
    array[]::text[]
  )
  into tokens
  from pg_catalog.regexp_matches(expression_text, token_pattern, 'gi')
    with ordinality as match(token, ordinality);

  token_count := coalesce(pg_catalog.cardinality(tokens), 0);
  if token_count = 0 or token_count > 256 then
    raise exception 'Advanced rules text must contain between 1 and 256 tokens.'
      using errcode = '22023';
  end if;

  seen_references := pg_catalog.array_fill(false, array[pg_catalog.jsonb_array_length(rule_list)]);

  for index_number in 1..token_count loop
    token := tokens[index_number];

    if token = '(' then
      if not expected_operand then
        raise exception 'Advanced rules text has an unexpected opening parenthesis.'
          using errcode = '22023';
      end if;
      nesting_depth := nesting_depth + 1;
      if nesting_depth > 16 then
        raise exception 'Advanced rules text cannot nest parentheses more than 16 levels.'
          using errcode = '22023';
      end if;
      operator_stack := pg_catalog.array_append(operator_stack, '(');
    elsif token = ')' then
      if expected_operand or nesting_depth = 0 then
        raise exception 'Advanced rules text has an unmatched closing parenthesis.'
          using errcode = '22023';
      end if;
      while coalesce(pg_catalog.cardinality(operator_stack), 0) > 0
        and operator_stack[pg_catalog.cardinality(operator_stack)] <> '('
      loop
        output_tokens := pg_catalog.array_append(
          output_tokens,
          operator_stack[pg_catalog.cardinality(operator_stack)]
        );
        operator_stack := operator_stack[1:pg_catalog.cardinality(operator_stack) - 1];
      end loop;
      if coalesce(pg_catalog.cardinality(operator_stack), 0) = 0 then
        raise exception 'Advanced rules text has an unmatched closing parenthesis.'
          using errcode = '22023';
      end if;
      operator_stack := operator_stack[1:pg_catalog.cardinality(operator_stack) - 1];
      nesting_depth := nesting_depth - 1;
      expected_operand := false;
    elsif token ~ '^[0-9]+$' then
      if not expected_operand or token !~ '^[1-9][0-9]*$' then
        raise exception 'Advanced rules text has an unexpected rule reference.'
          using errcode = '22023';
      end if;
      begin
        reference_number := token::integer;
      exception when others then
        raise exception 'Advanced rules text has an invalid rule reference.'
          using errcode = '22023';
      end;
      if reference_number < 1
        or reference_number > pg_catalog.jsonb_array_length(rule_list) then
        raise exception 'Advanced rules text references a rule that does not exist.'
          using errcode = '22023';
      end if;
      seen_references[reference_number] := true;
      output_tokens := pg_catalog.array_append(output_tokens, token);
      expected_operand := false;
    else
      normalized_operator := case pg_catalog.lower(token)
        when 'and' then 'AND'
        when '&' then 'AND'
        when '&&' then 'AND'
        when '-and' then 'AND'
        when 'or' then 'OR'
        when '|' then 'OR'
        when '||' then 'OR'
        when '-or' then 'OR'
        when 'not' then 'NOT'
        when '!' then 'NOT'
        when '-not' then 'NOT'
      end;

      if normalized_operator = 'NOT' then
        if not expected_operand then
          raise exception 'Advanced rules text has an unexpected NOT operator.'
            using errcode = '22023';
        end if;
        operator_stack := pg_catalog.array_append(operator_stack, normalized_operator);
      elsif normalized_operator in ('AND', 'OR') then
        if expected_operand then
          raise exception 'Advanced rules text requires a rule before AND or OR.'
            using errcode = '22023';
        end if;
        operator_precedence := case normalized_operator when 'AND' then 2 else 1 end;
        while coalesce(pg_catalog.cardinality(operator_stack), 0) > 0
          and operator_stack[pg_catalog.cardinality(operator_stack)] <> '('
        loop
          stack_operator := operator_stack[pg_catalog.cardinality(operator_stack)];
          stack_precedence := case stack_operator
            when 'NOT' then 3
            when 'AND' then 2
            else 1
          end;
          exit when stack_precedence < operator_precedence;
          output_tokens := pg_catalog.array_append(output_tokens, stack_operator);
          operator_stack := operator_stack[1:pg_catalog.cardinality(operator_stack) - 1];
        end loop;
        operator_stack := pg_catalog.array_append(operator_stack, normalized_operator);
        expected_operand := true;
      else
        raise exception 'Advanced rules text contains an unsupported operator.'
          using errcode = '22023';
      end if;
    end if;
  end loop;

  if expected_operand or nesting_depth <> 0 then
    raise exception 'Advanced rules text ends before its expression is complete.'
      using errcode = '22023';
  end if;

  while coalesce(pg_catalog.cardinality(operator_stack), 0) > 0
  loop
    stack_operator := operator_stack[pg_catalog.cardinality(operator_stack)];
    if stack_operator = '(' then
      raise exception 'Advanced rules text has an unmatched opening parenthesis.'
        using errcode = '22023';
    end if;
    output_tokens := pg_catalog.array_append(output_tokens, stack_operator);
    operator_stack := operator_stack[1:pg_catalog.cardinality(operator_stack) - 1];
  end loop;

  if exists (select 1 from pg_catalog.unnest(seen_references) as reference(used) where not reference.used) then
    raise exception 'Every advanced rule must be referenced at least once.'
      using errcode = '22023';
  end if;

  return output_tokens;
end;
$$;

alter function private.recipe_search_filter_matches(uuid, uuid, jsonb)
  rename to recipe_search_filter_matches_before_advanced_rules;

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
begin
  if filter->>'field' = 'advanced_rules' then
    return false;
  end if;

  return coalesce(
    private.recipe_search_filter_matches_before_advanced_rules(
      target_account_id,
      target_recipe_id,
      filter
    ),
    false
  );
end;
$$;

create function private.recipe_advanced_rules_matches(
  target_account_id uuid,
  target_recipe_id uuid,
  p_envelope jsonb,
  p_program text[]
)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  rule_list jsonb;
  rule_filter jsonb;
  boolean_stack boolean[] := array[]::boolean[];
  token text;
  rule_index integer;
  left_value boolean;
  right_value boolean;
begin
  if p_envelope is null then
    return true;
  end if;
  if p_program is null or pg_catalog.cardinality(p_program) = 0 then
    raise exception 'Advanced rules expression was not compiled.' using errcode = '22023';
  end if;

  rule_list := p_envelope->'rules';
  foreach token in array p_program
  loop
    if token ~ '^[0-9]+$' then
      rule_index := token::integer;
      rule_filter := rule_list->(rule_index - 1);
      rule_filter := rule_filter - 'id';
      boolean_stack := pg_catalog.array_append(
        boolean_stack,
        coalesce(
          private.recipe_search_filter_matches(
            target_account_id,
            target_recipe_id,
            rule_filter
          ),
          false
        )
      );
    elsif token = 'NOT' then
      if coalesce(pg_catalog.cardinality(boolean_stack), 0) < 1 then
        raise exception 'Invalid advanced rules program.' using errcode = '22023';
      end if;
      boolean_stack[pg_catalog.cardinality(boolean_stack)] :=
        not boolean_stack[pg_catalog.cardinality(boolean_stack)];
    else
      if coalesce(pg_catalog.cardinality(boolean_stack), 0) < 2 then
        raise exception 'Invalid advanced rules program.' using errcode = '22023';
      end if;
      right_value := boolean_stack[pg_catalog.cardinality(boolean_stack)];
      boolean_stack := boolean_stack[1:pg_catalog.cardinality(boolean_stack) - 1];
      left_value := boolean_stack[pg_catalog.cardinality(boolean_stack)];
      boolean_stack := boolean_stack[1:pg_catalog.cardinality(boolean_stack) - 1];
      boolean_stack := pg_catalog.array_append(
        boolean_stack,
        case token when 'AND' then left_value and right_value else left_value or right_value end
      );
    end if;
  end loop;

  if pg_catalog.cardinality(boolean_stack) <> 1 then
    raise exception 'Invalid advanced rules program.' using errcode = '22023';
  end if;
  return boolean_stack[1];
end;
$$;

create function private.recipe_advanced_rules_validate(p_envelope jsonb)
returns void
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  perform private.recipe_advanced_rules_compile(p_envelope);
end;
$$;

revoke all on function private.recipe_advanced_rules_compile(jsonb)
  from public, anon, authenticated;
grant execute on function private.recipe_advanced_rules_compile(jsonb)
  to authenticated;
revoke all on function private.recipe_advanced_rules_matches(uuid, uuid, jsonb, text[])
  from public, anon, authenticated;
grant execute on function private.recipe_advanced_rules_matches(uuid, uuid, jsonb, text[])
  to authenticated;
revoke all on function private.recipe_advanced_rules_validate(jsonb)
  from public, anon, authenticated;
grant execute on function private.recipe_advanced_rules_validate(jsonb)
  to authenticated;
revoke all on function private.recipe_search_filter_matches(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function private.recipe_search_filter_matches(uuid, uuid, jsonb)
  to authenticated;
revoke all on function private.recipe_search_filter_matches_before_advanced_rules(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function private.recipe_search_filter_matches_before_advanced_rules(uuid, uuid, jsonb)
  to authenticated;

alter function public.search_recipes(text, integer, integer, jsonb, text, text, uuid)
  rename to search_recipes_before_advanced_rules;

do $$
declare
  function_source text;
  old_filter_loop constant text :=
    'for filter in select value from pg_catalog.jsonb_array_elements(p_filters)';
  new_filter_loop constant text :=
    $replacement$
  select
    pg_catalog.count(*)::integer,
    (pg_catalog.array_agg(filter_row.value))[1]
  into advanced_count, advanced_filter
  from pg_catalog.jsonb_array_elements(p_filters) as filter_row(value)
  where filter_row.value->>'field' = 'advanced_rules';

  if advanced_count > 1 then
    raise exception 'Only one advanced rules filter is allowed.' using errcode = '22023';
  end if;
  if advanced_count = 1 then
    if pg_catalog.jsonb_typeof(advanced_filter) <> 'object'
      or exists (
        select 1 from pg_catalog.jsonb_object_keys(advanced_filter) as key_name(key)
        where key_name.key not in ('field', 'operator', 'value')
      )
      or advanced_filter->>'operator' is distinct from 'matches'
      or pg_catalog.jsonb_typeof(advanced_filter->'value') is distinct from 'string' then
      raise exception 'Advanced rules filter must contain a matches envelope.'
        using errcode = '22023';
    end if;
    if pg_catalog.octet_length(advanced_filter->>'value') > 65536 then
      raise exception 'Advanced rules value exceeds 65536 bytes.' using errcode = '22023';
    end if;
    begin
      advanced_filter := (advanced_filter->>'value')::jsonb;
    exception when others then
      raise exception 'Advanced rules value must contain valid JSON.'
        using errcode = '22023';
    end;
    advanced_program := private.recipe_advanced_rules_compile(advanced_filter);
    p_filters := coalesce(
      (
        select pg_catalog.jsonb_agg(filter_row.value order by filter_row.ordinality)
        from pg_catalog.jsonb_array_elements(p_filters)
          with ordinality as filter_row(value, ordinality)
        where filter_row.value->>'field' <> 'advanced_rules'
      ),
      '[]'::jsonb
    );
  end if;

$replacement$
    || old_filter_loop;
  old_match_filter constant text :=
    $pattern$
        where not private.recipe_search_filter_matches(recipe.account_id, recipe.id, filter_row.value)
      )
  )
  select
$pattern$;
  new_match_filter constant text :=
    $pattern$
        where not private.recipe_search_filter_matches(recipe.account_id, recipe.id, filter_row.value)
      )
      and (
        advanced_filter is null
        or private.recipe_advanced_rules_matches(
          recipe.account_id,
          recipe.id,
          advanced_filter,
          advanced_program
        )
      )
  )
  select
$pattern$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.search_recipes_before_advanced_rules(text,integer,integer,jsonb,text,text,uuid)'
      ::regprocedure
  )
  into function_source;

  if pg_catalog.strpos(function_source, 'allowed_field boolean;') = 0
    or pg_catalog.strpos(function_source, old_filter_loop) = 0
    or pg_catalog.strpos(function_source, old_match_filter) = 0 then
    raise exception 'Expected recipe search validation or matching anchors were not found';
  end if;

  function_source := pg_catalog.replace(
    function_source,
    'allowed_field boolean;',
    'allowed_field boolean;' || pg_catalog.chr(10)
      || '  advanced_filter jsonb;' || pg_catalog.chr(10)
      || '  advanced_program text[];' || pg_catalog.chr(10)
      || '  advanced_count integer;'
  );
  function_source := pg_catalog.replace(
    function_source,
    old_filter_loop,
    new_filter_loop
  );
  function_source := pg_catalog.replace(
    function_source,
    old_match_filter,
    new_match_filter
  );
  function_source := pg_catalog.replace(
    function_source,
    'public.search_recipes_before_advanced_rules(',
    'public.search_recipes('
  );

  execute function_source;
end;
$$;

revoke all on function public.search_recipes_before_advanced_rules(
  text, integer, integer, jsonb, text, text, uuid
) from public, anon;
grant execute on function public.search_recipes_before_advanced_rules(
  text, integer, integer, jsonb, text, text, uuid
) to authenticated;
revoke all on function public.search_recipes(
  text, integer, integer, jsonb, text, text, uuid
) from public, anon, authenticated;
grant execute on function public.search_recipes(
  text, integer, integer, jsonb, text, text, uuid
) to authenticated;

do $$
declare
  function_source text;
  old_facet_filters constant text :=
    $pattern$
        where coalesce(filter_row.value->>'field', '')
            <> 'column_' || requested_columns.value
          and not private.recipe_search_filter_matches(
$pattern$;
  new_facet_filters constant text :=
    $pattern$
        where coalesce(filter_row.value->>'field', '') <> 'advanced_rules'
          and coalesce(filter_row.value->>'field', '')
            <> 'column_' || requested_columns.value
          and not private.recipe_search_filter_matches(
$pattern$;
  old_facet_close constant text :=
    $pattern$
          )
      )
  )
  select
$pattern$;
  new_facet_close constant text :=
    $pattern$
          )
      )
      and (
        advanced_filter is null
        or private.recipe_advanced_rules_matches(
          recipe.account_id,
          recipe.id,
          advanced_filter,
          advanced_program
        )
      )
  )
  select
$pattern$;
  old_facet_validate constant text :=
    $pattern$from public.search_recipes(p_query, 1, 0, p_filters, 'name', 'asc', p_publication_id) as result;$pattern$;
  new_facet_validate constant text :=
    $pattern$from public.search_recipes(p_query, 1, 0, p_filters, 'name', 'asc', p_publication_id) as result;

  select filter_row.value into advanced_filter
  from pg_catalog.jsonb_array_elements(p_filters) as filter_row(value)
  where filter_row.value->>'field' = 'advanced_rules';
  if advanced_filter is not null then
    advanced_filter := (advanced_filter->>'value')::jsonb;
    advanced_program := private.recipe_advanced_rules_compile(advanced_filter);
  end if;$pattern$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.recipe_search_column_facet_values(text,jsonb,text[],uuid)'::regprocedure
  )
  into function_source;

  if pg_catalog.strpos(function_source, 'parsed_query tsquery;') = 0
    or pg_catalog.strpos(function_source, old_facet_filters) = 0
    or pg_catalog.strpos(function_source, old_facet_close) = 0
    or pg_catalog.strpos(function_source, old_facet_validate) = 0 then
    raise exception 'Expected recipe column facet anchors were not found';
  end if;

  function_source := pg_catalog.replace(
    function_source,
    'parsed_query tsquery;',
    'parsed_query tsquery;' || pg_catalog.chr(10)
      || '  advanced_filter jsonb;' || pg_catalog.chr(10)
      || '  advanced_program text[];'
  );
  function_source := pg_catalog.replace(
    function_source,
    old_facet_filters,
    new_facet_filters
  );
  function_source := pg_catalog.replace(
    function_source,
    old_facet_close,
    new_facet_close
  );
  function_source := pg_catalog.replace(
    function_source,
    old_facet_validate,
    new_facet_validate
  );
  execute function_source;
end;
$$;

do $$
declare
  function_source text;
  old_operator_validation constant text :=
    $pattern$or v_operator not in ($pattern$;
  new_operator_validation constant text :=
    $pattern$or v_field <> 'advanced_rules' and v_operator not in ($pattern$;
  old_recipe_filter_scope constant text :=
    $pattern$    if v_recipe_context and v_field not in ($pattern$;
  new_recipe_filter_scope constant text :=
    $pattern$    if v_field = 'advanced_rules' then
      if p_context_key <> 'recipes-find'
        or v_operator is distinct from 'matches'
        or pg_catalog.jsonb_typeof(v_filter->'value') is distinct from 'string'
        or pg_catalog.octet_length(coalesce(v_filter->>'value', '')) > 65536
        or v_filter ? 'value_to' then
        raise exception 'Advanced rules are only valid in recipes-find state.'
          using errcode = '22023';
      end if;
      v_advanced_filter_count := v_advanced_filter_count + 1;
      if v_advanced_filter_count > 1 then
        raise exception 'Only one advanced rules filter is allowed.' using errcode = '22023';
      end if;
      begin
        perform private.recipe_advanced_rules_validate((v_filter->>'value')::jsonb);
      exception when others then
        if sqlstate = '22023' then
          raise;
        end if;
        raise exception 'Advanced rules value must contain a valid envelope.'
          using errcode = '22023';
      end;
      continue;
    end if;

    if v_recipe_context and v_field not in ($pattern$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.update_explorer_state_v1(text,jsonb)'::regprocedure
  )
  into function_source;

  if pg_catalog.strpos(function_source, old_operator_validation) = 0
    or pg_catalog.strpos(function_source, old_recipe_filter_scope) = 0
    or pg_catalog.strpos(function_source, 'v_operator text;') = 0 then
    raise exception 'Expected explorer state filter validation anchors were not found';
  end if;

  function_source := pg_catalog.replace(
    function_source,
    'v_operator text;',
    'v_operator text;' || pg_catalog.chr(10) || '  v_advanced_filter_count integer := 0;'
  );
  function_source := pg_catalog.replace(
    function_source,
    old_operator_validation,
    new_operator_validation
  );
  function_source := pg_catalog.replace(
    function_source,
    old_recipe_filter_scope,
    new_recipe_filter_scope
  );
  execute function_source;
end;
$$;

notify pgrst, 'reload schema';
