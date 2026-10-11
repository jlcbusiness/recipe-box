create function private.normalize_ingredient_name()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.name := pg_catalog.initcap(pg_catalog.btrim(new.name));
  if new.name = '' then
    raise exception 'An ingredient name is required.' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function private.normalize_ingredient_name()
  from public, anon, authenticated;

create trigger normalize_ingredient_name
  before insert or update of name on public.ingredients
  for each row execute function private.normalize_ingredient_name();

with changed_accounts as (
  update public.ingredients
  set name = pg_catalog.initcap(pg_catalog.btrim(name))
  where name is distinct from pg_catalog.initcap(pg_catalog.btrim(name))
  returning account_id
)
update public.ingredient_catalog_revisions as revision
set revision = revision.revision + 1
where revision.account_id in (select distinct account_id from changed_accounts);