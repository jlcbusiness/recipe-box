create or replace function public.purge_expired_recipes(p_cutoff timestamptz)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  purged_count integer;
begin
  if p_cutoff is null then
    raise exception 'A purge cutoff is required.' using errcode = '22004';
  end if;

  delete from public.media_assets as media
  using public.recipes as recipe
  where media.account_id = recipe.account_id
    and media.recipe_id = recipe.id
    and recipe.trashed_at <= p_cutoff;

  delete from public.recipe_history as history
  using public.recipes as recipe
  where history.account_id = recipe.account_id
    and history.record_id = recipe.id
    and recipe.trashed_at <= p_cutoff;

  delete from public.recipes as recipe
  where recipe.trashed_at <= p_cutoff;
  get diagnostics purged_count = row_count;

  return purged_count;
end;
$$;

create or replace function public.purge_expired_publications(p_cutoff timestamptz)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  purged_count integer;
begin
  if p_cutoff is null then
    raise exception 'A purge cutoff is required.' using errcode = '22004';
  end if;

  delete from public.media_assets as media
  using public.recipes as recipe, public.publications as publication
  where media.account_id = recipe.account_id
    and media.recipe_id = recipe.id
    and recipe.account_id = publication.account_id
    and recipe.publication_id = publication.id
    and recipe.trashed_at <= p_cutoff
    and publication.trashed_at <= p_cutoff;

  delete from public.media_assets as media
  using public.publications as publication
  where media.account_id = publication.account_id
    and media.publication_id = publication.id
    and publication.trashed_at <= p_cutoff;

  delete from public.recipe_history as history
  using public.recipes as recipe, public.publications as publication
  where history.account_id = recipe.account_id
    and history.record_id = recipe.id
    and recipe.account_id = publication.account_id
    and recipe.publication_id = publication.id
    and recipe.trashed_at <= p_cutoff
    and publication.trashed_at <= p_cutoff;

  delete from public.recipes as recipe
  using public.publications as publication
  where recipe.account_id = publication.account_id
    and recipe.publication_id = publication.id
    and recipe.trashed_at <= p_cutoff
    and publication.trashed_at <= p_cutoff;

  delete from public.publication_history as history
  using public.publications as publication
  where history.account_id = publication.account_id
    and history.record_id = publication.id
    and publication.trashed_at <= p_cutoff;

  delete from public.publications as publication
  where publication.trashed_at <= p_cutoff;
  get diagnostics purged_count = row_count;

  return purged_count;
end;
$$;
