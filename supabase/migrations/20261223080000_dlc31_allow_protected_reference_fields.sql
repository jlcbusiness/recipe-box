do $$
declare
  function_definition text;
  old_reference_fields constant text := $old$
      where fields.key not in (
        'id', 'reference_type', 'display_text', 'linked_recipe_id', 'publication_id', 'url'
      )
$old$;
  new_reference_fields constant text := $new$
      where fields.key not in (
        'id', 'reference_type', 'display_text', 'linked_recipe_id', 'publication_id', 'url',
        'is_protected_source', 'source_public_id'
      )
$new$;
  old_occurrence_count integer;
  new_occurrence_count integer;
begin
  select pg_catalog.pg_get_functiondef(
    'public.save_recipe_with_relationships(uuid,integer,text,uuid,text,uuid,uuid,text,text,integer,integer,integer,integer,integer,integer,integer,integer,integer,integer,integer,text,uuid[],uuid[],uuid[],jsonb,jsonb,uuid,text,text,jsonb)'::regprocedure
  )
  into function_definition;

  old_occurrence_count :=
    (pg_catalog.length(function_definition)
      - pg_catalog.length(pg_catalog.replace(function_definition, old_reference_fields, '')))
      / pg_catalog.length(old_reference_fields);
  new_occurrence_count :=
    (pg_catalog.length(function_definition)
      - pg_catalog.length(pg_catalog.replace(function_definition, new_reference_fields, '')))
      / pg_catalog.length(new_reference_fields);

  if old_occurrence_count = 1 and new_occurrence_count = 0 then
    execute pg_catalog.replace(function_definition, old_reference_fields, new_reference_fields);
  elsif old_occurrence_count = 0 and new_occurrence_count = 1 then
    null;
  else
    raise exception 'Expected exactly one recipe relationship reference field allow-list.';
  end if;
end;
$$;
