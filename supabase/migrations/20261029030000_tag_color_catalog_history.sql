create function private.remember_deleted_tag_color()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform pg_catalog.set_config('app.tag_deleted_color', old.color_key, true);
  return old;
end;
$$;

revoke all on function private.remember_deleted_tag_color() from public, anon, authenticated;

create trigger remember_deleted_tag_color
  before delete on public.tags
  for each row execute function private.remember_deleted_tag_color();

create function private.add_tag_colors_to_catalog_history()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  deleted_color text := nullif(current_setting('app.tag_deleted_color', true), '');
begin
  if pg_catalog.jsonb_typeof(new.before_data) = 'array' then
    select coalesce(
      pg_catalog.jsonb_agg(
        (entry.value - 'color_key') || pg_catalog.jsonb_build_object(
          'color_key',
          coalesce(
            tag.color_key,
            case when entry.value ->> 'id' = new.tag_id::text then deleted_color end
          )
        )
        order by lower(entry.value ->> 'name'), entry.value ->> 'id'
      ),
      '[]'::jsonb
    ) into new.before_data
    from pg_catalog.jsonb_array_elements(new.before_data) as entry(value)
    left join public.tags as tag
      on tag.account_id = new.account_id and tag.id = (entry.value ->> 'id')::uuid;
  end if;

  if pg_catalog.jsonb_typeof(new.after_data) = 'array' then
    select coalesce(
      pg_catalog.jsonb_agg(
        (entry.value - 'color_key') || pg_catalog.jsonb_build_object('color_key', tag.color_key)
        order by lower(entry.value ->> 'name'), entry.value ->> 'id'
      ),
      '[]'::jsonb
    ) into new.after_data
    from pg_catalog.jsonb_array_elements(new.after_data) as entry(value)
    left join public.tags as tag
      on tag.account_id = new.account_id and tag.id = (entry.value ->> 'id')::uuid;
  end if;
  return new;
end;
$$;

revoke all on function private.add_tag_colors_to_catalog_history() from public, anon, authenticated;

create trigger add_tag_colors_to_catalog_history
  before insert on public.tag_catalog_history
  for each row execute function private.add_tag_colors_to_catalog_history();