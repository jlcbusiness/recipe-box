alter table public.recipe_ingredients
  drop constraint recipe_ingredients_account_set_ingredient_key,
  add constraint recipe_ingredients_account_set_ingredient_detail_key
    unique (account_id, ingredient_set_id, ingredient_id, detail)
    deferrable initially deferred;
