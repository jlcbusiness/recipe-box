create function public.populate_linked_pairing_display_text()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.linked_recipe_id is not null then
    select recipe.name into new.display_text
    from public.recipes as recipe
    where recipe.account_id = new.account_id
      and recipe.id = new.linked_recipe_id;
  end if;

  return new;
end;
$$;

revoke all on function public.populate_linked_pairing_display_text() from public, anon, authenticated;

create trigger populate_linked_pairing_display_text
  before insert on public.recipe_pairings
  for each row execute function public.populate_linked_pairing_display_text();