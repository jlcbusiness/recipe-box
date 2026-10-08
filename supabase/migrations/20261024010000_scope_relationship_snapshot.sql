create or replace function public.recipe_relationship_snapshot(p_account_id uuid, p_recipe_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  snapshot jsonb;
begin
  if p_account_id is distinct from auth.uid() then
    raise exception 'Recipe relationship snapshot is not available.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'site_listing', (
      select jsonb_build_object(
        'site_publication_id', listing.site_publication_id,
        'recipe_url', listing.recipe_url
      )
      from public.recipe_site_listings as listing
      where listing.account_id = p_account_id and listing.recipe_id = p_recipe_id
    ),
    'pairings', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pairing.id,
        'display_text', pairing.display_text,
        'linked_recipe_id', pairing.linked_recipe_id,
        'position', pairing.position
      ) order by pairing.position)
      from public.recipe_pairings as pairing
      where pairing.account_id = p_account_id and pairing.source_recipe_id = p_recipe_id
    ), '[]'::jsonb),
    'references', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', recipe_reference.id,
        'reference_type', recipe_reference.reference_type,
        'display_text', recipe_reference.display_text,
        'publication_id', recipe_reference.publication_id,
        'url', recipe_reference.url,
        'position', recipe_reference.position
      ) order by recipe_reference.position)
      from public.recipe_references as recipe_reference
      where recipe_reference.account_id = p_account_id and recipe_reference.recipe_id = p_recipe_id
    ), '[]'::jsonb)
  ) into snapshot;

  return snapshot;
end;
$$;

revoke all on function public.recipe_relationship_snapshot(uuid, uuid) from public, anon;
grant execute on function public.recipe_relationship_snapshot(uuid, uuid) to authenticated;