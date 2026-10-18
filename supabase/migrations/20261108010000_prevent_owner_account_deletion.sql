create function public.prevent_owner_account_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.is_owner then
    raise exception using
      errcode = 'P0001',
      message = 'The owner must transfer ownership before this account can be deleted.';
  end if;

  return old;
end;
$$;

create trigger accounts_prevent_owner_deletion
  before delete on public.accounts
  for each row execute function public.prevent_owner_account_deletion();