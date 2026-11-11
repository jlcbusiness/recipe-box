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
  occurrence_count integer;
begin
  select pg_catalog.pg_get_functiondef(
    'public.save_recipe_with_relationships(uuid,integer,text,uuid,text,uuid,uuid,text,text,integer,integer,integer,integer,integer,integer,integer,integer,integer,integer,integer,text,uuid[],uuid[],uuid[],jsonb,jsonb,uuid,text,text,jsonb)'::regprocedure
  )
  into function_definition;

  occurrence_count :=
    (pg_catalog.length(function_definition)
      - pg_catalog.length(pg_catalog.replace(function_definition, old_reference_fields, '')))
      / pg_catalog.length(old_reference_fields);
  if occurrence_count <> 1 then
    raise exception 'Expected exactly one recipe relationship reference field allow-list.';
  end if;

  execute pg_catalog.replace(function_definition, old_reference_fields, new_reference_fields);
end;
$$;
