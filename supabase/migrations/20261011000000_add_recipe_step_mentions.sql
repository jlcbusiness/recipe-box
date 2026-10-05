alter table public.recipe_ingredients
  add constraint recipe_ingredients_account_recipe_id_id_key unique (account_id, recipe_id, id);

create table public.recipe_step_mentions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  recipe_id uuid not null,
  recipe_step_id uuid not null,
  recipe_ingredient_id uuid not null,
  position smallint not null check (position >= 0),
  unique (recipe_step_id, position),
  foreign key (account_id, recipe_id, recipe_step_id)
    references public.recipe_steps (account_id, recipe_id, id) on delete cascade,
  foreign key (account_id, recipe_id, recipe_ingredient_id)
    references public.recipe_ingredients (account_id, recipe_id, id) on delete restrict
);

create index recipe_step_mentions_recipe_order_idx
  on public.recipe_step_mentions (account_id, recipe_id, recipe_step_id, position);

alter table public.recipe_step_mentions enable row level security;
grant select on public.recipe_step_mentions to authenticated;

create policy "Account owners can read recipe step mentions"
  on public.recipe_step_mentions
  for select
  to authenticated
  using ((select auth.uid()) = account_id);

create function public.recipe_step_mentions_after_insert()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  mention_match text[];
  mention_position smallint := 0;
  mentioned_ingredient_id uuid;
  marker_pattern constant text := '\[\[ingredient:([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})\|[^\]\r\n]+\]\]';
begin
  if regexp_replace(new.content_markdown, marker_pattern, '', 'gi') ~ '\[\[ingredient:' then
    raise exception 'Instruction contains an invalid ingredient mention.' using errcode = '23514';
  end if;

  for mention_match in
    select regexp_matches(new.content_markdown, marker_pattern, 'gi')
  loop
    mentioned_ingredient_id := mention_match[1]::uuid;
    if not exists (
      select 1
      from public.recipe_ingredients as ingredient
      where ingredient.account_id = new.account_id
        and ingredient.recipe_id = new.recipe_id
        and ingredient.id = mentioned_ingredient_id
    ) then
      raise exception 'Instruction mentions must reference an ingredient row in this recipe.'
        using errcode = '23514';
    end if;

    insert into public.recipe_step_mentions (
      account_id, recipe_id, recipe_step_id, recipe_ingredient_id, position
    )
    values (
      new.account_id, new.recipe_id, new.id, mentioned_ingredient_id, mention_position
    );
    mention_position := mention_position + 1;
  end loop;

  return new;
end;
$$;

create trigger recipe_step_mentions_after_insert
  after insert on public.recipe_steps
  for each row execute function public.recipe_step_mentions_after_insert();