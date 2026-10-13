create table public.recipe_search_documents (
  account_id uuid not null,
  recipe_id uuid not null,
  search_vector tsvector not null,
  primary key (account_id, recipe_id),
  foreign key (account_id, recipe_id)
    references public.recipes (account_id, id) on delete cascade
);

create index recipe_search_documents_vector_idx
  on public.recipe_search_documents using gin (search_vector);

alter table public.recipe_search_documents enable row level security;
revoke all on public.recipe_search_documents from public, anon, authenticated;
grant select on public.recipe_search_documents to authenticated;

create policy "Account owners can read recipe search documents"
  on public.recipe_search_documents
  for select
  to authenticated
  using ((select auth.uid()) = account_id);

create function private.refresh_recipe_search_document(
  target_account_id uuid,
  target_recipe_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  document tsvector;
begin
  select
    setweight(to_tsvector('english', coalesce(recipe.name, '')), 'A')
    || setweight(to_tsvector('english', coalesce(publication.name, '')), 'A')
    || setweight(to_tsvector('english', coalesce(publication.author, '')), 'B')
    || setweight(to_tsvector('english', coalesce(recipe.notes_markdown, '')), 'B')
    || setweight(
      to_tsvector(
        'english',
        coalesce((
          select string_agg(concat_ws(' ', ingredient.name, recipe_ingredient.detail), ' ')
          from public.recipe_ingredients as recipe_ingredient
          join public.ingredients as ingredient
            on ingredient.account_id = recipe_ingredient.account_id
            and ingredient.id = recipe_ingredient.ingredient_id
          where recipe_ingredient.account_id = recipe.account_id
            and recipe_ingredient.recipe_id = recipe.id
        ), '')
      ),
      'C'
    )
    || setweight(
      to_tsvector(
        'english',
        coalesce((
          select string_agg(step.plain_text, ' ' order by step.position)
          from public.recipe_steps as step
          where step.account_id = recipe.account_id
            and step.recipe_id = recipe.id
        ), '')
      ),
      'C'
    )
    || setweight(
      to_tsvector(
        'english',
        coalesce((
          select string_agg(tag.name, ' ' order by lower(tag.name), tag.id)
          from public.recipe_tags as assignment
          join public.tags as tag
            on tag.account_id = assignment.account_id
            and tag.id = assignment.tag_id
          where assignment.account_id = recipe.account_id
            and assignment.recipe_id = recipe.id
        ), '')
      ),
      'C'
    )
  into document
  from public.recipes as recipe
  left join public.publications as publication
    on publication.account_id = recipe.account_id
    and publication.id = recipe.publication_id
  where recipe.account_id = target_account_id
    and recipe.id = target_recipe_id;

  if not found then
    delete from public.recipe_search_documents
    where account_id = target_account_id and recipe_id = target_recipe_id;
    return;
  end if;

  insert into public.recipe_search_documents (account_id, recipe_id, search_vector)
  values (target_account_id, target_recipe_id, document)
  on conflict (account_id, recipe_id)
  do update set search_vector = excluded.search_vector;
end;
$$;

revoke all on function private.refresh_recipe_search_document(uuid, uuid)
  from public, anon, authenticated;

create function private.refresh_recipe_search_after_source_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_account_id uuid;
  source_id uuid;
  source_recipe_id uuid;
  related_recipe_id uuid;
begin
  if tg_op = 'DELETE' then
    source_account_id := old.account_id;
  else
    source_account_id := new.account_id;
  end if;

  if tg_table_name = 'recipes' then
    if tg_op = 'DELETE' then
      source_recipe_id := old.id;
    else
      source_recipe_id := new.id;
    end if;
  elsif tg_table_name in ('recipe_ingredients', 'recipe_steps', 'recipe_tags') then
    if tg_op = 'DELETE' then
      source_recipe_id := old.recipe_id;
    else
      source_recipe_id := new.recipe_id;
    end if;
  elsif tg_table_name in ('ingredients', 'publications', 'tags') then
    if tg_op = 'DELETE' then
      source_id := old.id;
    else
      source_id := new.id;
    end if;
  end if;

  if tg_table_name = 'ingredients' then
    for related_recipe_id in
      select distinct recipe_ingredient.recipe_id
      from public.recipe_ingredients as recipe_ingredient
      where recipe_ingredient.account_id = source_account_id
        and recipe_ingredient.ingredient_id = source_id
    loop
      perform private.refresh_recipe_search_document(source_account_id, related_recipe_id);
    end loop;
  elsif tg_table_name = 'publications' then
    for related_recipe_id in
      select recipe.id
      from public.recipes as recipe
      where recipe.account_id = source_account_id
        and recipe.publication_id = source_id
    loop
      perform private.refresh_recipe_search_document(source_account_id, related_recipe_id);
    end loop;
  elsif tg_table_name = 'tags' then
    for related_recipe_id in
      select assignment.recipe_id
      from public.recipe_tags as assignment
      where assignment.account_id = source_account_id
        and assignment.tag_id = source_id
    loop
      perform private.refresh_recipe_search_document(source_account_id, related_recipe_id);
    end loop;
  else
    perform private.refresh_recipe_search_document(source_account_id, source_recipe_id);
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.refresh_recipe_search_after_source_change()
  from public, anon, authenticated;

create trigger refresh_recipe_search_after_recipe_change
  after insert or update or delete on public.recipes
  for each row execute function private.refresh_recipe_search_after_source_change();

create trigger refresh_recipe_search_after_ingredient_row_change
  after insert or update or delete on public.recipe_ingredients
  for each row execute function private.refresh_recipe_search_after_source_change();

create trigger refresh_recipe_search_after_instruction_change
  after insert or update or delete on public.recipe_steps
  for each row execute function private.refresh_recipe_search_after_source_change();

create trigger refresh_recipe_search_after_recipe_tag_change
  after insert or update or delete on public.recipe_tags
  for each row execute function private.refresh_recipe_search_after_source_change();

create trigger refresh_recipe_search_after_ingredient_name_change
  after update of name on public.ingredients
  for each row execute function private.refresh_recipe_search_after_source_change();

create trigger refresh_recipe_search_after_publication_name_change
  after update of name, author on public.publications
  for each row execute function private.refresh_recipe_search_after_source_change();

create trigger refresh_recipe_search_after_tag_name_change
  after update of name on public.tags
  for each row execute function private.refresh_recipe_search_after_source_change();

insert into public.recipe_search_documents (account_id, recipe_id, search_vector)
select recipe.account_id, recipe.id, document.search_vector
from public.recipes as recipe
cross join lateral (
  select
    setweight(to_tsvector('english', coalesce(recipe.name, '')), 'A')
    || setweight(to_tsvector('english', coalesce(publication.name, '')), 'A')
    || setweight(to_tsvector('english', coalesce(publication.author, '')), 'B')
    || setweight(to_tsvector('english', coalesce(recipe.notes_markdown, '')), 'B')
    || setweight(
      to_tsvector(
        'english',
        coalesce((
          select string_agg(concat_ws(' ', ingredient.name, recipe_ingredient.detail), ' ')
          from public.recipe_ingredients as recipe_ingredient
          join public.ingredients as ingredient
            on ingredient.account_id = recipe_ingredient.account_id
            and ingredient.id = recipe_ingredient.ingredient_id
          where recipe_ingredient.account_id = recipe.account_id
            and recipe_ingredient.recipe_id = recipe.id
        ), '')
      ),
      'C'
    )
    || setweight(
      to_tsvector(
        'english',
        coalesce((
          select string_agg(step.plain_text, ' ' order by step.position)
          from public.recipe_steps as step
          where step.account_id = recipe.account_id
            and step.recipe_id = recipe.id
        ), '')
      ),
      'C'
    )
    || setweight(
      to_tsvector(
        'english',
        coalesce((
          select string_agg(tag.name, ' ' order by lower(tag.name), tag.id)
          from public.recipe_tags as assignment
          join public.tags as tag
            on tag.account_id = assignment.account_id
            and tag.id = assignment.tag_id
          where assignment.account_id = recipe.account_id
            and assignment.recipe_id = recipe.id
        ), '')
      ),
      'C'
    ) as search_vector
  from public.publications as publication
  where publication.account_id = recipe.account_id
    and publication.id = recipe.publication_id
  union all
  select
    setweight(to_tsvector('english', coalesce(recipe.name, '')), 'A')
    || setweight(to_tsvector('english', ''), 'A')
    || setweight(to_tsvector('english', ''), 'B')
    || setweight(to_tsvector('english', coalesce(recipe.notes_markdown, '')), 'B')
    || setweight(
      to_tsvector(
        'english',
        coalesce((
          select string_agg(concat_ws(' ', ingredient.name, recipe_ingredient.detail), ' ')
          from public.recipe_ingredients as recipe_ingredient
          join public.ingredients as ingredient
            on ingredient.account_id = recipe_ingredient.account_id
            and ingredient.id = recipe_ingredient.ingredient_id
          where recipe_ingredient.account_id = recipe.account_id
            and recipe_ingredient.recipe_id = recipe.id
        ), '')
      ),
      'C'
    )
    || setweight(
      to_tsvector(
        'english',
        coalesce((
          select string_agg(step.plain_text, ' ' order by step.position)
          from public.recipe_steps as step
          where step.account_id = recipe.account_id
            and step.recipe_id = recipe.id
        ), '')
      ),
      'C'
    )
    || setweight(
      to_tsvector(
        'english',
        coalesce((
          select string_agg(tag.name, ' ' order by lower(tag.name), tag.id)
          from public.recipe_tags as assignment
          join public.tags as tag
            on tag.account_id = assignment.account_id
            and tag.id = assignment.tag_id
          where assignment.account_id = recipe.account_id
            and assignment.recipe_id = recipe.id
        ), '')
      ),
      'C'
    ) as search_vector
  where recipe.publication_id is null
) as document;

create function public.search_recipes(
  p_query text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  recipe_id uuid,
  recipe_name text,
  state text,
  total_time_minutes integer,
  publication_name text,
  rank real,
  total_count bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  normalized_query text := nullif(pg_catalog.btrim(coalesce(p_query, '')), '');
  parsed_query tsquery;
begin
  if pg_catalog.char_length(coalesce(p_query, '')) > 500 then
    raise exception 'Search text exceeds 500 characters.' using errcode = '22023';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'Search page size must be between 1 and 100.' using errcode = '22023';
  end if;
  if p_offset is null or p_offset < 0 then
    raise exception 'Search offset cannot be negative.' using errcode = '22023';
  end if;

  if normalized_query is not null then
    parsed_query := websearch_to_tsquery('english', normalized_query);
  end if;

  return query
  select
    recipe.id,
    recipe.name,
    recipe.state,
    recipe.total_time_minutes,
    publication.name,
    case
      when normalized_query is null then 0::real
      else ts_rank(search_document.search_vector, parsed_query)
    end,
    count(*) over ()
  from public.recipes as recipe
  join public.recipe_search_documents as search_document
    on search_document.account_id = recipe.account_id
    and search_document.recipe_id = recipe.id
  left join public.publications as publication
    on publication.account_id = recipe.account_id
    and publication.id = recipe.publication_id
  where recipe.trashed_at is null
    and (
      normalized_query is null
      or search_document.search_vector @@ parsed_query
    )
  order by
    case
      when normalized_query is null then 0::real
      else ts_rank(search_document.search_vector, parsed_query)
    end desc,
    recipe.name,
    recipe.id
  limit p_limit
  offset p_offset;
end;
$$;

revoke all on function public.search_recipes(text, integer, integer) from public, anon;
grant execute on function public.search_recipes(text, integer, integer) to authenticated;