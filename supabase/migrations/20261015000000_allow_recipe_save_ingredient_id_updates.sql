grant update on public.recipe_ingredients to authenticated;

create policy "Account owners can update recipe ingredients during recipe save"
  on public.recipe_ingredients
  for update
  to authenticated
  using (
    (select auth.uid()) = account_id
    and current_setting('app.recipe_save_context', true) = 'on'
  )
  with check (
    (select auth.uid()) = account_id
    and current_setting('app.recipe_save_context', true) = 'on'
  );