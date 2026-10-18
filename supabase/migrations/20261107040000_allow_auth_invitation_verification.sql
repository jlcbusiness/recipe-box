drop trigger if exists auth_users_enforce_google_account_has_no_password on auth.users;
drop function if exists public.enforce_google_account_has_no_password();