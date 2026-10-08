drop policy "Account owners can read active recipes" on public.recipes;

create policy "Account owners can read active or linked recipes"
  on public.recipes
  for select
  to authenticated
  using (
    (select auth.uid()) = account_id
    and (
      trashed_at is null
      or exists (
        select 1
        from public.recipe_pairings as pairing
        where pairing.account_id = recipes.account_id
          and pairing.linked_recipe_id = recipes.id
      )
    )
  );