alter table public.ingredients
  add column sort_order integer;

with ordered_ingredients as (
  select id, row_number() over (partition by account_id order by name, id) - 1 as position
  from public.ingredients
)
update public.ingredients as ingredient
set sort_order = ordered_ingredients.position
from ordered_ingredients
where ingredient.id = ordered_ingredients.id;

alter table public.ingredients
  alter column sort_order set not null,
  alter column sort_order set default null;

create index ingredients_account_order_idx
  on public.ingredients (account_id, sort_order, id);

create table public.ingredient_catalog_revisions (
  account_id uuid primary key references public.accounts (id) on delete cascade,
  revision integer not null default 1 check (revision > 0)
);

insert into public.ingredient_catalog_revisions (account_id)
select account.id
from public.accounts as account
on conflict (account_id) do nothing;

alter table public.ingredient_catalog_revisions enable row level security;
grant select on public.ingredient_catalog_revisions to authenticated;

create policy "Account owners can read ingredient catalog revisions"
  on public.ingredient_catalog_revisions
  for select
  to authenticated
  using ((select auth.uid()) = account_id);

create table public.ingredient_catalog_history (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  actor_user_id uuid references auth.users (id) on delete set null,
  event_type text not null check (
    event_type in (
      'ingredient.added',
      'ingredient.renamed',
      'ingredient.reordered',
      'ingredient.deleted',
      'ingredient.merged'
    )
  ),
  ingredient_id uuid,
  replacement_id uuid,
  affected_recipe_ids uuid[] not null default array[]::uuid[],
  before_data jsonb not null,
  after_data jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.ingredient_catalog_history enable row level security;
grant select on public.ingredient_catalog_history to authenticated;

create index ingredient_catalog_history_owner_created_idx
  on public.ingredient_catalog_history (account_id, created_at desc);

create policy "Account owners can read ingredient catalog history"
  on public.ingredient_catalog_history
  for select
  to authenticated
  using ((select auth.uid()) = account_id);

create function public.seed_ingredient_catalog_revision_after_account_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.ingredient_catalog_revisions (account_id)
  values (new.id);
  return new;
end;
$$;

revoke all on function public.seed_ingredient_catalog_revision_after_account_insert()
  from public, anon, authenticated;

create trigger seed_ingredient_catalog_revision_after_account_insert
  after insert on public.accounts
  for each row execute function public.seed_ingredient_catalog_revision_after_account_insert();

create function private.prepare_ingredient_catalog_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  catalog_revision integer;
begin
  select revision
  into catalog_revision
  from public.ingredient_catalog_revisions
  where account_id = new.account_id
  for update;

  if catalog_revision is null then
    raise exception 'Ingredient catalog was not found.' using errcode = 'P0002';
  end if;

  if new.sort_order is null then
    select coalesce(max(sort_order) + 1, 0)
    into new.sort_order
    from public.ingredients
    where account_id = new.account_id;
  end if;

  return new;
end;
$$;

revoke all on function private.prepare_ingredient_catalog_insert()
  from public, anon, authenticated;

create trigger prepare_ingredient_catalog_insert
  before insert on public.ingredients
  for each row execute function private.prepare_ingredient_catalog_insert();

create function private.record_ingredient_catalog_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  before_catalog jsonb;
  after_catalog jsonb;
begin
  update public.ingredient_catalog_revisions
  set revision = revision + 1
  where account_id = new.account_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object('id', id, 'name', name, 'sort_order', sort_order)
      order by sort_order, id
    ),
    '[]'::jsonb
  )
  into before_catalog
  from public.ingredients
  where account_id = new.account_id and id <> new.id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object('id', id, 'name', name, 'sort_order', sort_order)
      order by sort_order, id
    ),
    '[]'::jsonb
  )
  into after_catalog
  from public.ingredients
  where account_id = new.account_id;

  insert into public.ingredient_catalog_history (
    account_id, actor_user_id, event_type, ingredient_id, before_data, after_data
  ) values (
    new.account_id, auth.uid(), 'ingredient.added', new.id, before_catalog, after_catalog
  );

  return new;
end;
$$;

revoke all on function private.record_ingredient_catalog_insert()
  from public, anon, authenticated;

create trigger record_ingredient_catalog_insert
  after insert on public.ingredients
  for each row execute function private.record_ingredient_catalog_insert();

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
  current_count integer;
  normalized_name text;
  replacement_name text;
  operation_type text;
  affected_recipe_ids uuid[] := array[]::uuid[];
  before_catalog jsonb;
  after_catalog jsonb;
  before_recipe_snapshots jsonb := '{}'::jsonb;
  recipe_id uuid;
begin
  if owner_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if p_action not in ('add', 'rename', 'reorder', 'merge', 'delete') then
    raise exception 'Ingredient catalog action is invalid.' using errcode = '22023';
  end if;

  if p_expected_revision is null or p_expected_revision < 1 then
    raise exception 'Ingredient catalog revision is invalid.' using errcode = '22023';
  end if;

  if p_action in ('rename', 'merge', 'delete') and p_ingredient_id is null then
    raise exception 'Choose an ingredient.' using errcode = '23514';
  end if;

  if p_action = 'merge' and p_replacement_id is null then
    raise exception 'Choose a replacement ingredient.' using errcode = '23514';
  end if;

  if p_action = 'rename' then
    select coalesce(
      array_agg(distinct recipe_ingredient.recipe_id order by recipe_ingredient.recipe_id),
      array[]::uuid[]
    )
    into affected_recipe_ids
    from public.recipe_ingredients as recipe_ingredient
    where recipe_ingredient.account_id = owner_id
      and recipe_ingredient.ingredient_id = p_ingredient_id;
  elsif p_action in ('merge', 'delete') then
    select coalesce(
      array_agg(distinct recipe_ingredient.recipe_id order by recipe_ingredient.recipe_id),
      array[]::uuid[]
    )
    into affected_recipe_ids
    from public.recipe_ingredients as recipe_ingredient
    where recipe_ingredient.account_id = owner_id
      and recipe_ingredient.ingredient_id = p_ingredient_id;
  end if;

  perform recipe.id
  from public.recipes as recipe
  where recipe.account_id = owner_id
    and recipe.id = any(affected_recipe_ids)
  order by recipe.id
  for update;

  select revision
  into current_revision
  from public.ingredient_catalog_revisions
  where account_id = owner_id
  for update;

  if current_revision is null then
    raise exception 'Ingredient catalog was not found.' using errcode = 'P0002';
  end if;
  if current_revision <> p_expected_revision then
    raise exception 'Ingredient catalog changed in another session.' using errcode = '40001';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object('id', id, 'name', name, 'sort_order', sort_order)
      order by sort_order, id
    ),
    '[]'::jsonb
  )
  into before_catalog
  from public.ingredients
  where account_id = owner_id;

  if p_action = 'add' then
    normalized_name := nullif(pg_catalog.btrim(p_name), '');
    if normalized_name is null then
      raise exception 'An ingredient name is required.' using errcode = '23514';
    end if;

    insert into public.ingredients (account_id, name)
    values (owner_id, normalized_name);

    select revision
    into next_revision
    from public.ingredient_catalog_revisions
    where account_id = owner_id;
    return next_revision;
  elsif p_action = 'rename' then
    normalized_name := nullif(pg_catalog.btrim(p_name), '');
    if normalized_name is null then
      raise exception 'An ingredient name is required.' using errcode = '23514';
    end if;
    if not exists (
      select 1 from public.ingredients
      where account_id = owner_id and id = p_ingredient_id
    ) then
      raise exception 'Ingredient was not found.' using errcode = 'P0002';
    end if;
    foreach recipe_id in array affected_recipe_ids loop
      before_recipe_snapshots := before_recipe_snapshots || jsonb_build_object(
        recipe_id::text,
        private.recipe_ingredient_history_snapshot(owner_id, recipe_id)
      );
    end loop;
    update public.ingredients
    set name = normalized_name
    where account_id = owner_id and id = p_ingredient_id;
    operation_type := 'ingredient.renamed';
  elsif p_action = 'reorder' then
    select count(*)
    into current_count
    from public.ingredients
    where account_id = owner_id;

    if coalesce(pg_catalog.cardinality(p_ordered_ids), 0) <> current_count
      or (
        select count(distinct ordered.id)
        from pg_catalog.unnest(coalesce(p_ordered_ids, array[]::uuid[])) as ordered(id)
      ) <> current_count
      or exists (
        select 1
        from pg_catalog.unnest(coalesce(p_ordered_ids, array[]::uuid[])) as ordered(id)
        left join public.ingredients as ingredient
          on ingredient.account_id = owner_id
          and ingredient.id = ordered.id
        where ingredient.id is null
      ) then
      raise exception 'The submitted ingredient order is incomplete or invalid.'
        using errcode = '23514';
    end if;

    update public.ingredients as ingredient
    set sort_order = ordered.position - 1
    from pg_catalog.unnest(p_ordered_ids) with ordinality as ordered(id, position)
    where ingredient.account_id = owner_id
      and ingredient.id = ordered.id;
    operation_type := 'ingredient.reordered';
  else
    if p_replacement_id is not null then
      if p_replacement_id = p_ingredient_id then
        raise exception 'Choose a different replacement ingredient.' using errcode = '23514';
      end if;
      select name
      into replacement_name
      from public.ingredients
      where account_id = owner_id and id = p_replacement_id
      for update;
      if not found then
        raise exception 'Replacement ingredient was not found.' using errcode = 'P0002';
      end if;
    end if;

    if exists (
      select 1
      from public.recipe_ingredients
      where account_id = owner_id and ingredient_id = p_ingredient_id
    ) and p_replacement_id is null then
      raise exception 'Choose a replacement for this referenced ingredient.' using errcode = '23514';
    end if;

    if p_replacement_id is not null then
      select coalesce(
        array_agg(distinct recipe_ingredient.recipe_id order by recipe_ingredient.recipe_id),
        array[]::uuid[]
      )
      into affected_recipe_ids
      from public.recipe_ingredients as recipe_ingredient
      where recipe_ingredient.account_id = owner_id
        and recipe_ingredient.ingredient_id = p_ingredient_id;

      for recipe_id in
        select unnest(affected_recipe_ids)
      loop
        before_recipe_snapshots := before_recipe_snapshots || jsonb_build_object(
          recipe_id::text,
          private.recipe_ingredient_history_snapshot(owner_id, recipe_id)
        );
      end loop;

      update public.recipe_ingredients
      set ingredient_id = p_replacement_id
      where account_id = owner_id and ingredient_id = p_ingredient_id;
    end if;

    delete from public.ingredients
    where account_id = owner_id and id = p_ingredient_id;
    if not found then
      raise exception 'Ingredient was not found.' using errcode = 'P0002';
    end if;

    operation_type := case
      when p_action = 'merge' then 'ingredient.merged'
      else 'ingredient.deleted'
    end;
  end if;

  if cardinality(affected_recipe_ids) > 0 then
    set constraints all immediate;
    foreach recipe_id in array affected_recipe_ids loop
      perform pg_catalog.set_config(
        'app.recipe_ingredients_before',
        coalesce(before_recipe_snapshots->recipe_id::text, '[]'::jsonb)::text,
        true
      );
      update public.recipes
      set version = version + 1
      where account_id = owner_id and id = recipe_id;
    end loop;
    set constraints all deferred;
  end if;

  update public.ingredient_catalog_revisions
  set revision = revision + 1
  where account_id = owner_id
  returning revision into next_revision;

  select coalesce(
    jsonb_agg(
      jsonb_build_object('id', id, 'name', name, 'sort_order', sort_order)
      order by sort_order, id
    ),
    '[]'::jsonb
  )
  into after_catalog
  from public.ingredients
  where account_id = owner_id;

  insert into public.ingredient_catalog_history (
    account_id,
    actor_user_id,
    event_type,
    ingredient_id,
    replacement_id,
    affected_recipe_ids,
    before_data,
    after_data
  ) values (
    owner_id,
    owner_id,
    operation_type,
    p_ingredient_id,
    p_replacement_id,
    affected_recipe_ids,
    before_catalog,
    after_catalog
  );

  return next_revision;
end;
$$;

revoke all on function public.manage_ingredient_catalog(text, integer, uuid, text, uuid[], uuid)
  from public, anon;
grant execute on function public.manage_ingredient_catalog(text, integer, uuid, text, uuid[], uuid)
  to authenticated;