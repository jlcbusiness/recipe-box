alter table public.accounts
  add column last_database_export_at timestamptz;

insert into storage.buckets (id, name, public, file_size_limit)
values ('recipe-exports', 'recipe-exports', false, 1258291200)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit;

create table public.export_deletion_queue (
  id bigint generated always as identity primary key,
  account_id uuid not null references public.accounts (id) on delete cascade,
  object_path text not null unique,
  queued_at timestamptz not null default now(),
  delete_after timestamptz not null,
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  check (delete_after >= queued_at + interval '24 hours')
);

create index export_deletion_queue_ready_idx
  on public.export_deletion_queue (delete_after, id);

alter table public.export_deletion_queue enable row level security;
revoke all on public.export_deletion_queue from public, anon, authenticated;

create function public.read_export_snapshot(p_account_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'accountPreferences', to_jsonb(account_row),
    'records', jsonb_build_object(
      'recipes', coalesce((
        select jsonb_agg(to_jsonb(record_row))
        from public.recipes as record_row
        where record_row.account_id = account_row.id
      ), '[]'::jsonb),
      'publications', coalesce((
        select jsonb_agg(to_jsonb(record_row))
        from public.publications as record_row
        where record_row.account_id = account_row.id
      ), '[]'::jsonb),
      'recipe_picklist_values', coalesce((
        select jsonb_agg(to_jsonb(record_row))
        from public.recipe_picklist_values as record_row
        where record_row.account_id = account_row.id
      ), '[]'::jsonb),
      'recipe_picklist_assignments', coalesce((
        select jsonb_agg(to_jsonb(record_row))
        from public.recipe_picklist_assignments as record_row
        where record_row.account_id = account_row.id
      ), '[]'::jsonb),
      'ingredients', coalesce((
        select jsonb_agg(to_jsonb(record_row))
        from public.ingredients as record_row
        where record_row.account_id = account_row.id
      ), '[]'::jsonb),
      'recipe_ingredients', coalesce((
        select jsonb_agg(to_jsonb(record_row))
        from public.recipe_ingredients as record_row
        where record_row.account_id = account_row.id
      ), '[]'::jsonb),
      'recipe_ingredient_measurements', coalesce((
        select jsonb_agg(to_jsonb(record_row))
        from public.recipe_ingredient_measurements as record_row
        where record_row.account_id = account_row.id
      ), '[]'::jsonb),
      'recipe_steps', coalesce((
        select jsonb_agg(to_jsonb(record_row))
        from public.recipe_steps as record_row
        where record_row.account_id = account_row.id
      ), '[]'::jsonb),
      'recipe_step_mentions', coalesce((
        select jsonb_agg(to_jsonb(record_row))
        from public.recipe_step_mentions as record_row
        where record_row.account_id = account_row.id
      ), '[]'::jsonb),
      'recipe_site_listings', coalesce((
        select jsonb_agg(to_jsonb(record_row))
        from public.recipe_site_listings as record_row
        where record_row.account_id = account_row.id
      ), '[]'::jsonb),
      'recipe_pairings', coalesce((
        select jsonb_agg(to_jsonb(record_row))
        from public.recipe_pairings as record_row
        where record_row.account_id = account_row.id
      ), '[]'::jsonb),
      'recipe_references', coalesce((
        select jsonb_agg(to_jsonb(record_row))
        from public.recipe_references as record_row
        where record_row.account_id = account_row.id
      ), '[]'::jsonb),
      'ingredient_densities', coalesce((
        select jsonb_agg(to_jsonb(record_row))
        from public.ingredient_densities as record_row
        where record_row.account_id = account_row.id
      ), '[]'::jsonb),
      'tags', coalesce((
        select jsonb_agg(to_jsonb(record_row))
        from public.tags as record_row
        where record_row.account_id = account_row.id
      ), '[]'::jsonb),
      'recipe_tags', coalesce((
        select jsonb_agg(to_jsonb(record_row))
        from public.recipe_tags as record_row
        where record_row.account_id = account_row.id
      ), '[]'::jsonb),
      'publication_tags', coalesce((
        select jsonb_agg(to_jsonb(record_row))
        from public.publication_tags as record_row
        where record_row.account_id = account_row.id
      ), '[]'::jsonb),
      'explorer_state', coalesce((
        select jsonb_agg(to_jsonb(record_row))
        from public.explorer_state as record_row
        where record_row.account_id = account_row.id
      ), '[]'::jsonb),
      'media_assets', coalesce((
        select jsonb_agg(to_jsonb(record_row))
        from public.media_assets as record_row
        where record_row.account_id = account_row.id
      ), '[]'::jsonb)
    )
  )
  from public.accounts as account_row
  where account_row.id = p_account_id;
$$;

revoke all on function public.read_export_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.read_export_snapshot(uuid) to service_role;
