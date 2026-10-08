drop policy "Account owners can read active publications" on public.publications;

create policy "Account owners can read active or linked publications"
  on public.publications
  for select
  to authenticated
  using (
    (select auth.uid()) = account_id
    and (
      trashed_at is null
      or exists (
        select 1
        from public.recipe_site_listings as listing
        where listing.account_id = publications.account_id
          and listing.site_publication_id = publications.id
      )
      or exists (
        select 1
        from public.recipe_references as recipe_reference
        where recipe_reference.account_id = publications.account_id
          and recipe_reference.publication_id = publications.id
      )
    )
  );