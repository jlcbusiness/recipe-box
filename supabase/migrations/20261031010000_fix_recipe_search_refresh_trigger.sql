create or replace function private.refresh_recipe_search_after_source_change()
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
