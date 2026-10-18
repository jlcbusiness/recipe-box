create table public.first_admin_claims (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null unique,
  claimed_at timestamptz not null default now()
);

alter table public.first_admin_claims enable row level security;

create function public.claim_first_admin(p_user_id uuid)
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
  set is_admin = true
  where id = p_user_id and is_admin = false;

  if not found then
    raise exception 'The first administrator account is unavailable.';
  end if;

  return true;
end;
$$;

revoke all on function public.claim_first_admin(uuid) from public, anon, authenticated;
grant execute on function public.claim_first_admin(uuid) to service_role;

create function public.enforce_account_sign_in_method()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_encrypted_password text;
begin
  if new.sign_in_method = old.sign_in_method then
    return new;
  end if;

  if new.sign_in_method = 'google' then
    select encrypted_password
    into v_encrypted_password
    from auth.users
    where id = new.id;

    if coalesce(nullif(v_encrypted_password, ''), '') <> '' then
      raise exception 'An email-and-password account cannot be changed to Google sign-in.';
    end if;
  elsif exists (
    select 1
    from auth.identities
    where user_id = new.id and provider = 'google'
  ) then
    raise exception 'A Google account cannot be changed to email and password sign-in.';
  end if;

  return new;
end;
$$;

create trigger accounts_enforce_sign_in_method
  before update of sign_in_method on public.accounts
  for each row execute procedure public.enforce_account_sign_in_method();

create function public.enforce_google_identity_sign_in_method()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.provider = 'google' and not exists (
    select 1
    from public.accounts
    where id = new.user_id and sign_in_method = 'google'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'This account uses email and password sign-in.';
  end if;

  return new;
end;
$$;

create trigger auth_identities_enforce_google_sign_in_method
  before insert or update of provider, user_id on auth.identities
  for each row execute procedure public.enforce_google_identity_sign_in_method();
