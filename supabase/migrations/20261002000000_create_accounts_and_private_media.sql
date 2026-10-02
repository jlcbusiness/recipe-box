create table public.accounts (
  id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.accounts enable row level security;

grant select, update on public.accounts to authenticated;

create policy "Account owners can read their account"
  on public.accounts
  for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "Account owners can update their account"
  on public.accounts
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create function public.create_account_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.accounts (id)
  values (new.id);

  return new;
end;
$$;

create trigger on_auth_user_created_create_account
  after insert on auth.users
  for each row execute procedure public.create_account_for_auth_user();

insert into storage.buckets (id, name, public)
values ('recipe-media', 'recipe-media', false)
on conflict (id) do update
set public = false;

create policy "Account owners can read their recipe media"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'recipe-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Account owners can upload their recipe media"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'recipe-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Account owners can update their recipe media"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'recipe-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'recipe-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Account owners can delete their recipe media"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'recipe-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );