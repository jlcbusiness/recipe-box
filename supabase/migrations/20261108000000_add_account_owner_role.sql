alter table public.accounts
  add column is_owner boolean not null default false;

update public.accounts
set is_owner = true
where id = (
  select id
  from public.accounts
  where is_admin
  order by created_at, id
  limit 1
);

alter table public.accounts
  add constraint accounts_owner_must_be_admin
  check (not is_owner or is_admin);

create unique index accounts_single_owner_idx
  on public.accounts (is_owner)
  where is_owner;

grant update (is_owner) on table public.accounts to service_role;

create or replace function public.claim_first_admin(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.accounts where is_admin) then
    return false;
  end if;

  insert into public.first_admin_claims (singleton, user_id)
  values (true, p_user_id)
  on conflict (singleton) do nothing;

  if not found then
    return false;
  end if;

  update public.accounts
  set is_admin = true, is_owner = true
  where id = p_user_id and is_admin = false;

  if not found then
    raise exception 'The first administrator account is unavailable.';
  end if;

  return true;
end;
$$;

create function public.transfer_account_owner(
  p_current_owner_id uuid,
  p_new_owner_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_current_owner_id is null
    or p_new_owner_id is null
    or p_current_owner_id = p_new_owner_id then
    return false;
  end if;

  perform id
  from public.accounts
  where id in (p_current_owner_id, p_new_owner_id)
  order by id
  for update;

  if not exists (
    select 1 from public.accounts
    where id = p_current_owner_id and is_owner
  ) or not exists (
    select 1 from public.accounts where id = p_new_owner_id
  ) then
    return false;
  end if;

  update public.accounts
  set is_owner = false
  where id = p_current_owner_id;

  update public.accounts
  set is_admin = true, is_owner = true
  where id = p_new_owner_id;

  return true;
end;
$$;

revoke all on function public.transfer_account_owner(uuid, uuid) from public, anon, authenticated;
grant execute on function public.transfer_account_owner(uuid, uuid) to service_role;