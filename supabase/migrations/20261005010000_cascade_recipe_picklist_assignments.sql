alter table public.recipe_picklist_assignments
  drop constraint if exists recipe_picklist_assignments_account_id_category_picklist_value_id_fkey,
  drop constraint if exists recipe_picklist_assignments_picklist_value_fkey,
  add constraint recipe_picklist_assignments_picklist_value_fkey
    foreign key (account_id, category, picklist_value_id)
    references public.recipe_picklist_values (account_id, category, id)
    on delete cascade;