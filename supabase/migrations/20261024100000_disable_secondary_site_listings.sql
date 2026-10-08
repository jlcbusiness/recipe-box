delete from public.recipe_site_listings;

create function public.reject_secondary_recipe_site_listing()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Assign Site publications as the recipe primary publication.'
    using errcode = '23514';
end;
$$;

create trigger recipe_site_listings_primary_only
  before insert or update on public.recipe_site_listings
  for each row execute function public.reject_secondary_recipe_site_listing();