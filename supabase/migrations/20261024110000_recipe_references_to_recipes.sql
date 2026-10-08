alter table public.recipe_references
  add column linked_recipe_id uuid,
  add constraint recipe_references_linked_recipe_fk
    foreign key (account_id, linked_recipe_id)
    references public.recipes (account_id, id)
    on delete set null (linked_recipe_id);

alter table public.recipe_references
  drop constraint recipe_references_check,
  add constraint recipe_references_check check (
    (reference_type = 'recipe' and publication_id is null and url is null)
    or (reference_type = 'publication' and linked_recipe_id is null and url is null)
    or (reference_type = 'external_url'
      and linked_recipe_id is null and publication_id is null and url is not null)
    or (reference_type = 'printed_citation'
      and linked_recipe_id is null and publication_id is null and url is null)
  );

create index recipe_references_linked_recipe_idx
  on public.recipe_references (account_id, linked_recipe_id)
  where linked_recipe_id is not null;

grant update on public.recipe_references to authenticated;
create policy "Account owners can update recipe references during recipe save"
  on public.recipe_references for update to authenticated
  using ((select auth.uid()) = account_id
    and current_setting('app.recipe_save_context', true) = 'on')
  with check ((select auth.uid()) = account_id
    and current_setting('app.recipe_save_context', true) = 'on');

create or replace function public.recipe_relationship_snapshot(p_account_id uuid, p_recipe_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  snapshot jsonb;
begin
  if p_account_id is distinct from auth.uid()
    and auth.role() is distinct from 'service_role'
    and current_setting('app.recipe_lifecycle_context', true) is distinct from 'on'
  then
    raise exception 'Recipe relationship snapshot is not available.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'site_listing', (
      select jsonb_build_object(
        'site_publication_id', listing.site_publication_id,
        'recipe_url', listing.recipe_url
      )
      from public.recipe_site_listings as listing
      where listing.account_id = p_account_id and listing.recipe_id = p_recipe_id
    ),
    'pairings', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pairing.id,
        'display_text', pairing.display_text,
        'linked_recipe_id', pairing.linked_recipe_id,
        'position', pairing.position
      ) order by pairing.position)
      from public.recipe_pairings as pairing
      where pairing.account_id = p_account_id and pairing.source_recipe_id = p_recipe_id
    ), '[]'::jsonb),
    'references', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', recipe_reference.id,
        'reference_type', recipe_reference.reference_type,
        'display_text', recipe_reference.display_text,
        'linked_recipe_id', recipe_reference.linked_recipe_id,
        'publication_id', recipe_reference.publication_id,
        'url', recipe_reference.url,
        'position', recipe_reference.position
      ) order by recipe_reference.position)
      from public.recipe_references as recipe_reference
      where recipe_reference.account_id = p_account_id and recipe_reference.recipe_id = p_recipe_id
    ), '[]'::jsonb)
  ) into snapshot;

  return snapshot;
end;
$$;

create function public.save_recipe_with_relationships(
  p_recipe_id uuid,
  p_expected_version integer,
  p_name text,
  p_food_type_id uuid,
  p_state text,
  p_verdict_id uuid,
  p_enthusiasm_id uuid,
  p_occasion_details text,
  p_reason text,
  p_serves integer,
  p_prep_time_minutes integer,
  p_mixing_time_minutes integer,
  p_marinate_time_minutes integer,
  p_chill_time_minutes integer,
  p_freeze_time_minutes integer,
  p_cook_time_minutes integer,
  p_bake_time_minutes integer,
  p_cooling_time_minutes integer,
  p_rest_time_minutes integer,
  p_total_time_minutes integer,
  p_notes_markdown text,
  p_meal_type_ids uuid[],
  p_cuisine_ids uuid[],
  p_equipment_ids uuid[],
  p_ingredient_rows jsonb,
  p_instruction_steps jsonb,
  p_publication_id uuid,
  p_publication_page text,
  p_recipe_url text,
  p_recipe_relationships jsonb
)
returns table (id uuid, version integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  entry jsonb;
  entry_id uuid;
  reference_kind text;
  target_id uuid;
  target_name text;
  publication_id uuid;
  translated_references jsonb := '[]'::jsonb;
  reference_rewrites jsonb := '[]'::jsonb;
  translated_relationships jsonb;
  rewrite jsonb;
  saved_id uuid;
  saved_version integer;
begin
  if owner_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if p_recipe_relationships is null
    or jsonb_typeof(p_recipe_relationships) <> 'object'
    or jsonb_typeof(p_recipe_relationships->'references') <> 'array'
  then
    raise exception 'Recipe relationships must include references.' using errcode = '23514';
  end if;

  for entry in
    select item.value
    from jsonb_array_elements(p_recipe_relationships->'references')
      with ordinality as item(value, ordinal)
    order by item.ordinal
  loop
    if jsonb_typeof(entry) <> 'object' or exists (
      select 1 from jsonb_object_keys(entry) as fields(key)
      where fields.key not in (
        'id', 'reference_type', 'display_text', 'linked_recipe_id', 'publication_id', 'url'
      )
    ) then
      raise exception 'Reference contains an unknown field.' using errcode = '23514';
    end if;

    reference_kind := entry->>'reference_type';
    entry_id := nullif(entry->>'id', '')::uuid;
    target_id := nullif(entry->>'linked_recipe_id', '')::uuid;

    if reference_kind = 'publication' then
      select old_reference.publication_id, old_reference.display_text
      into publication_id, target_name
      from public.recipe_references as old_reference
      where old_reference.account_id = owner_id
        and old_reference.recipe_id = p_recipe_id
        and old_reference.id = entry_id
        and old_reference.reference_type = 'publication';
      if not found then
        raise exception 'Legacy publication references cannot be created or changed.'
          using errcode = '23514';
      end if;
      translated_references := translated_references || jsonb_build_array(jsonb_build_object(
        'id', entry_id,
        'reference_type', 'printed_citation',
        'display_text', target_name,
        'publication_id', null,
        'url', null
      ));
      reference_rewrites := reference_rewrites || jsonb_build_array(jsonb_build_object(
        'id', entry_id,
        'reference_type', 'publication',
        'display_text', target_name,
        'publication_id', publication_id,
        'linked_recipe_id', null
      ));
    elsif reference_kind = 'recipe' then
      if entry_id is null then
        raise exception 'Recipe references require an ID.' using errcode = '23514';
      end if;
      if target_id is not null then
        if target_id = p_recipe_id then
          raise exception 'A recipe cannot reference itself.' using errcode = '23514';
        end if;
        select recipe.name into target_name
        from public.recipes as recipe
        where recipe.account_id = owner_id
          and recipe.id = target_id
          and recipe.trashed_at is null;
        if not found then
          select old_reference.display_text into target_name
          from public.recipe_references as old_reference
          where old_reference.account_id = owner_id
            and old_reference.recipe_id = p_recipe_id
            and old_reference.id = entry_id
            and old_reference.reference_type = 'recipe'
            and old_reference.linked_recipe_id = target_id;
          if not found then
            raise exception 'Referenced recipe is not available.' using errcode = 'P0002';
          end if;
        end if;
      else
        select old_reference.display_text into target_name
        from public.recipe_references as old_reference
        where old_reference.account_id = owner_id
          and old_reference.recipe_id = p_recipe_id
          and old_reference.id = entry_id
          and old_reference.reference_type = 'recipe'
          and old_reference.linked_recipe_id is null;
        if not found then
          raise exception 'Choose a recipe reference.' using errcode = '23514';
        end if;
      end if;
      translated_references := translated_references || jsonb_build_array(jsonb_build_object(
        'id', entry_id,
        'reference_type', 'printed_citation',
        'display_text', target_name,
        'publication_id', null,
        'url', null
      ));
      reference_rewrites := reference_rewrites || jsonb_build_array(jsonb_build_object(
        'id', entry_id,
        'reference_type', 'recipe',
        'display_text', target_name,
        'publication_id', null,
        'linked_recipe_id', target_id
      ));
    else
      translated_references := translated_references || jsonb_build_array(entry - 'linked_recipe_id');
    end if;
  end loop;

  translated_relationships := jsonb_set(
    p_recipe_relationships,
    '{references}',
    translated_references,
    true
  );

  select saved_recipe.id, saved_recipe.version
  into saved_id, saved_version
  from public.save_recipe_with_publication(
    p_recipe_id, p_expected_version, p_name, p_food_type_id, p_state,
    p_verdict_id, p_enthusiasm_id, p_occasion_details, p_reason, p_serves,
    p_prep_time_minutes, p_mixing_time_minutes, p_marinate_time_minutes,
    p_chill_time_minutes, p_freeze_time_minutes, p_cook_time_minutes,
    p_bake_time_minutes, p_cooling_time_minutes, p_rest_time_minutes,
    p_total_time_minutes, p_notes_markdown, p_meal_type_ids, p_cuisine_ids,
    p_equipment_ids, p_ingredient_rows, p_instruction_steps, p_publication_id,
    p_publication_page, p_recipe_url, translated_relationships
  ) as saved_recipe;

  for rewrite in
    select item.value
    from jsonb_array_elements(reference_rewrites) as item(value)
  loop
    update public.recipe_references as recipe_reference
    set reference_type = rewrite->>'reference_type',
        display_text = rewrite->>'display_text',
        publication_id = nullif(rewrite->>'publication_id', '')::uuid,
        linked_recipe_id = nullif(rewrite->>'linked_recipe_id', '')::uuid
    where recipe_reference.account_id = owner_id
      and recipe_reference.recipe_id = saved_id
      and recipe_reference.id = (rewrite->>'id')::uuid;
  end loop;

  return query select saved_id, saved_version;
end;
$$;

revoke all on function public.save_recipe_with_relationships(
  uuid, integer, text, uuid, text, uuid, uuid, text, text, integer,
  integer, integer, integer, integer, integer, integer, integer, integer,
  integer, integer, text, uuid[], uuid[], uuid[], jsonb, jsonb, uuid, text, text, jsonb
) from public, anon;
grant execute on function public.save_recipe_with_relationships(
  uuid, integer, text, uuid, text, uuid, uuid, text, text, integer,
  integer, integer, integer, integer, integer, integer, integer, integer,
  integer, integer, text, uuid[], uuid[], uuid[], jsonb, jsonb, uuid, text, text, jsonb
) to authenticated;