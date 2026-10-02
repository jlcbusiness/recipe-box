alter table public.accounts
  add column is_admin boolean not null default false,
  add column sign_in_method text not null default 'email_password',
  add constraint accounts_sign_in_method_check
    check (sign_in_method in ('email_password', 'google'));

revoke update on public.accounts from authenticated;
grant update (id) on public.accounts to authenticated;