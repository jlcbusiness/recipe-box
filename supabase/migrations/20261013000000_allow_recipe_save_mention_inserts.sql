grant insert on public.recipe_step_mentions to authenticated;

create policy "Account owners can add recipe step mentions during recipe save"
  on public.recipe_step_mentions
  for insert
  to authenticated
  with check (
    (select auth.uid()) = account_id
    and current_setting('app.recipe_save_context', true) = 'on'
  );