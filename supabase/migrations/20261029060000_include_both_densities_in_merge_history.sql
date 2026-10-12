create or replace function public.manage_ingredient_catalog(
  p_action text,
  p_expected_revision integer,
  p_ingredient_id uuid default null,
  p_name text default null,
  p_ordered_ids uuid[] default null,
  p_replacement_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  current_revision integer;
  next_revision integer;
  source_density jsonb;
  replacement_density jsonb;
  replacement_density_before jsonb;
  source_name text;
  replacement_name text;
  density_event text;
begin
  if p_action in ('merge', 'delete') then
    if owner_id is null then
      raise exception 'Authentication is required.' using errcode = '42501';
    end if;
    if p_expected_revision is null or p_expected_revision < 1 then
      raise exception 'Ingredient catalog revision is invalid.' using errcode = '22023';
    end if;

    select revision
    into current_revision
    from public.ingredient_catalog_revisions
    where account_id = owner_id
    for update;
    if current_revision is null then
      raise exception 'Ingredient catalog was not found.' using errcode = 'P0002';
    end if;
    if current_revision <> p_expected_revision then
      raise exception 'The ingredient catalog changed in another session.' using errcode = '40001';
    end if;

    select ingredient.name, to_jsonb(density)
    into source_name, source_density
    from public.ingredients as ingredient
    left join public.ingredient_densities as density
      on density.account_id = ingredient.account_id
      and density.ingredient_id = ingredient.id
    where ingredient.account_id = owner_id and ingredient.id = p_ingredient_id
    for update of ingredient;

    if source_density is not null and p_replacement_id is not null then
      if p_replacement_id = p_ingredient_id then
        raise exception 'Choose a different replacement ingredient.' using errcode = '23514';
      end if;

      select ingredient.name, to_jsonb(density)
      into replacement_name, replacement_density
      from public.ingredients as ingredient
      left join public.ingredient_densities as density
        on density.account_id = ingredient.account_id
        and density.ingredient_id = ingredient.id
      where ingredient.account_id = owner_id and ingredient.id = p_replacement_id
      for update of ingredient;
      if not found then
        raise exception 'Replacement ingredient was not found.' using errcode = 'P0002';
      end if;

      replacement_density_before := replacement_density;
      if replacement_density is null then
        update public.ingredient_densities
        set ingredient_id = p_replacement_id,
            updated_at = now()
        where account_id = owner_id and ingredient_id = p_ingredient_id;
        select to_jsonb(density)
        into replacement_density
        from public.ingredient_densities as density
        where density.account_id = owner_id and density.ingredient_id = p_replacement_id;
      else
        delete from public.ingredient_densities
        where account_id = owner_id and ingredient_id = p_ingredient_id;
      end if;
      density_event := 'ingredient.density_reassigned';
    elsif source_density is not null then
      delete from public.ingredient_densities
      where account_id = owner_id and ingredient_id = p_ingredient_id;
      density_event := 'ingredient.density_removed';
    end if;
  end if;

  next_revision := public.manage_ingredient_catalog_legacy(
    p_action,
    p_expected_revision,
    p_ingredient_id,
    p_name,
    p_ordered_ids,
    p_replacement_id
  );

  if density_event is not null then
    insert into public.ingredient_catalog_history (
      account_id,
      actor_user_id,
      event_type,
      ingredient_id,
      replacement_id,
      before_data,
      after_data
    ) values (
      owner_id,
      owner_id,
      density_event,
      p_ingredient_id,
      p_replacement_id,
      jsonb_build_object(
        'ingredient_id', p_ingredient_id,
        'ingredient_name', source_name,
        'density', source_density,
        'replacement_density', replacement_density_before
      ),
      jsonb_build_object(
        'ingredient_id', case when p_replacement_id is null then p_ingredient_id else p_replacement_id end,
        'ingredient_name', case when p_replacement_id is null then source_name else replacement_name end,
        'density', replacement_density
      )
    );
  end if;

  return next_revision;
end;
$$;

revoke all on function public.manage_ingredient_catalog(text, integer, uuid, text, uuid[], uuid)
  from public, anon;
grant execute on function public.manage_ingredient_catalog(text, integer, uuid, text, uuid[], uuid)
  to authenticated;