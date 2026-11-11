create function private.delete_recipe_time_entries_before_account_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.recipe_time_entries
  where account_id = old.id;

  return old;
end;
$$;

revoke all on function private.delete_recipe_time_entries_before_account_delete()
  from public, anon, authenticated;

create trigger accounts_delete_recipe_time_entries
  before delete on public.accounts
  for each row execute function private.delete_recipe_time_entries_before_account_delete();
