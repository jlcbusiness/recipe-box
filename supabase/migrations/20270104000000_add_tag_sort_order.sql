alter table public.tags
  add column sort_order integer not null default 0;

with ordered_tags as (
  select
    tag.id,
    row_number() over (
      partition by tag.account_id
      order by lower(tag.name), tag.id
    ) - 1 as sort_order
  from public.tags as tag
)
update public.tags as tag
set sort_order = ordered_tags.sort_order
from ordered_tags
where ordered_tags.id = tag.id;
