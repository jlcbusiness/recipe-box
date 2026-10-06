drop trigger recipe_history_after_save on public.recipes;

create trigger recipe_history_after_insert
  after insert on public.recipes
  for each row execute function public.recipe_history_after_save();

create trigger recipe_history_after_update
  after update on public.recipes
  for each row
  when (
    session_user <> 'supabase_auth_admin'
    or old.trashed_by_user_id is not distinct from new.trashed_by_user_id
  )
  execute function public.recipe_history_after_save();