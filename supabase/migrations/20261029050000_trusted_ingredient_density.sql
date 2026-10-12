create table public.ingredient_densities (
  account_id uuid not null references public.accounts (id) on delete cascade,
  ingredient_id uuid not null,
  volume_amount numeric not null,
  volume_unit_code text not null check (
    volume_unit_code in ('tsp', 'tbsp', 'fl_oz', 'cup', 'pt', 'qt', 'gal', 'ml', 'l')
  ),
  weight_amount numeric not null,
  weight_unit_code text not null check (weight_unit_code in ('oz', 'lb', 'g', 'kg')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (account_id, ingredient_id),
  foreign key (account_id, ingredient_id)
    references public.ingredients (account_id, id) on delete cascade,
  check (
    volume_amount > 0
    and volume_amount not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
    and weight_amount > 0
    and weight_amount not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
  )
);

alter table public.ingredient_densities enable row level security;
revoke all on public.ingredient_densities from public, anon, authenticated;
grant select on public.ingredient_densities to authenticated;

create policy "Account owners can read ingredient densities"
  on public.ingredient_densities
  for select
  to authenticated
  using ((select auth.uid()) = account_id);

alter table public.ingredient_catalog_history
  drop constraint ingredient_catalog_history_event_type_check;

alter table public.ingredient_catalog_history
  add constraint ingredient_catalog_history_event_type_check
  check (
    event_type in (
      'ingredient.added',
      'ingredient.renamed',
      'ingredient.reordered',
      'ingredient.deleted',
      'ingredient.merged',
      'ingredient.density_set',
      'ingredient.density_removed',
      'ingredient.density_reassigned'
    )
  );

create function public.manage_ingredient_density(
  p_action text,
  p_expected_revision integer,
  p_ingredient_id uuid,
  p_volume_amount numeric default null,
  p_volume_unit_code text default null,
  p_weight_amount numeric default null,
  p_weight_unit_code text default null
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
  ingredient_name text;
  before_density jsonb;
  after_density jsonb;
  event_name text;
begin
  if owner_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if p_action not in ('set', 'remove') then
    raise exception 'Ingredient density action is invalid.' using errcode = '22023';
  end if;
  if p_expected_revision is null or p_expected_revision < 1 then
    raise exception 'Ingredient catalog revision is invalid.' using errcode = '22023';
  end if;
  if p_ingredient_id is null then
    raise exception 'Choose an ingredient.' using errcode = '23514';
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

  select name
  into ingredient_name
  from public.ingredients
  where account_id = owner_id and id = p_ingredient_id
  for update;
  if not found then
    raise exception 'Ingredient was not found.' using errcode = 'P0002';
  end if;

  select to_jsonb(density)
  into before_density
  from public.ingredient_densities as density
  where density.account_id = owner_id and density.ingredient_id = p_ingredient_id
  for update;

  if p_action = 'set' then
    if p_volume_amount is null
      or p_volume_amount <= 0
      or p_volume_amount in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
      or p_volume_unit_code not in ('tsp', 'tbsp', 'fl_oz', 'cup', 'pt', 'qt', 'gal', 'ml', 'l')
      or p_weight_amount is null
      or p_weight_amount <= 0
      or p_weight_amount in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
      or p_weight_unit_code not in ('oz', 'lb', 'g', 'kg') then
      raise exception 'Enter valid positive Volume and Weight amounts and units.'
        using errcode = '23514';
    end if;

    insert into public.ingredient_densities (
      account_id,
      ingredient_id,
      volume_amount,
      volume_unit_code,
      weight_amount,
      weight_unit_code
    ) values (
      owner_id,
      p_ingredient_id,
      p_volume_amount,
      p_volume_unit_code,
      p_weight_amount,
      p_weight_unit_code
    )
    on conflict (account_id, ingredient_id) do update
    set volume_amount = excluded.volume_amount,
        volume_unit_code = excluded.volume_unit_code,
        weight_amount = excluded.weight_amount,
        weight_unit_code = excluded.weight_unit_code,
        updated_at = now();
    event_name := 'ingredient.density_set';
  else
    if before_density is null then
      raise exception 'Ingredient density was not found.' using errcode = 'P0002';
    end if;
    delete from public.ingredient_densities
    where account_id = owner_id and ingredient_id = p_ingredient_id;
    event_name := 'ingredient.density_removed';
  end if;

  select to_jsonb(density)
  into after_density
  from public.ingredient_densities as density
  where density.account_id = owner_id and density.ingredient_id = p_ingredient_id;

  update public.ingredient_catalog_revisions
  set revision = revision + 1
  where account_id = owner_id
  returning revision into next_revision;

  insert into public.ingredient_catalog_history (
    account_id,
    actor_user_id,
    event_type,
    ingredient_id,
    before_data,
    after_data
  ) values (
    owner_id,
    owner_id,
    event_name,
    p_ingredient_id,
    jsonb_build_object(
      'ingredient_id', p_ingredient_id,
      'ingredient_name', ingredient_name,
      'density', before_density
    ),
    jsonb_build_object(
      'ingredient_id', p_ingredient_id,
      'ingredient_name', ingredient_name,
      'density', after_density
    )
  );

  return next_revision;
end;
$$;

revoke all on function public.manage_ingredient_density(text, integer, uuid, numeric, text, numeric, text)
  from public, anon;
grant execute on function public.manage_ingredient_density(text, integer, uuid, numeric, text, numeric, text)
  to authenticated;

alter function public.manage_ingredient_catalog(text, integer, uuid, text, uuid[], uuid)
  rename to manage_ingredient_catalog_legacy;

revoke all on function public.manage_ingredient_catalog_legacy(text, integer, uuid, text, uuid[], uuid)
  from public, anon, authenticated;

create function public.manage_ingredient_catalog(
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
        'density', source_density
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