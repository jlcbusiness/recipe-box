alter table public.recipe_references
  drop constraint recipe_references_check,
  add constraint recipe_references_check check (
    (reference_type = 'publication' and url is null)
    or (reference_type = 'external_url' and publication_id is null and url is not null)
    or (reference_type = 'printed_citation' and publication_id is null and url is null)
  );