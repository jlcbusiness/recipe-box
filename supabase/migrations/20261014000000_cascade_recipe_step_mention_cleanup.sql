alter table public.recipe_step_mentions
  drop constraint recipe_step_mentions_account_id_recipe_id_recipe_ingredien_fkey,
  add constraint recipe_step_mentions_account_id_recipe_id_recipe_ingredien_fkey
    foreign key (account_id, recipe_id, recipe_ingredient_id)
    references public.recipe_ingredients (account_id, recipe_id, id) on delete cascade;