create function public.set_recipe_rating(
  p_recipe_id uuid,
  p_expected_version integer,
  p_score smallint
)
returns table (version integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  current_version integer;
  current_state text;
  current_score smallint;
  updated_version integer;
begin
  if owner_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if p_recipe_id is null or p_expected_version is null or p_expected_version < 1 then
    raise exception 'A valid recipe and version are required.' using errcode = '22023';
  end if;
  if p_score is not null and p_score not in (-5, -3, -1, 0, 1, 2, 3, 4, 5) then
    raise exception 'Rating must be one of the allowed values.' using errcode = '22023';
  end if;

  select recipe.version, recipe.state, recipe.score
  into current_version, current_state, current_score
  from public.recipes as recipe
  where recipe.account_id = owner_id
    and recipe.id = p_recipe_id
    and recipe.trashed_at is null
  for update;

  if not found then
    raise exception 'This recipe is no longer available.' using errcode = 'P0002';
  end if;
  if current_version <> p_expected_version then
    raise exception 'This recipe changed in another session.' using errcode = 'PT409';
  end if;
  if current_state <> 'tried' then
    raise exception 'Rating is available only for Tried recipes.' using errcode = '22023';
  end if;
  if current_score is not distinct from p_score then
    return query select current_version;
    return;
  end if;

  update public.recipes as recipe
  set score = p_score,
      version = recipe.version + 1
  where recipe.account_id = owner_id
    and recipe.id = p_recipe_id
    and recipe.version = current_version
    and recipe.trashed_at is null
  returning recipe.version into updated_version;

  if updated_version is null then
    raise exception 'This recipe changed in another session.' using errcode = 'PT409';
  end if;

  return query select updated_version;
end;
$$;

revoke all on function public.set_recipe_rating(uuid, integer, smallint)
  from public, anon;
grant execute on function public.set_recipe_rating(uuid, integer, smallint)
  to authenticated;

notify pgrst, 'reload schema';
