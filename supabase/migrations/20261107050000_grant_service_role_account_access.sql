grant select on table public.accounts to service_role;
grant update (is_admin, sign_in_method) on table public.accounts to service_role;