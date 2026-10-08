alter table public.recipe_history
  alter column after_data drop not null,
  drop constraint recipe_history_event_type_check,
  add constraint recipe_history_event_type_check
    check (
      event_type in (
        'recipe.created',
        'recipe.updated',
        'recipe.trashed',
        'recipe.restored',
        'recipe.photo_added',
        'recipe.photo_updated',
        'recipe.photo_removed'
      )
    );

alter table public.publication_history
  alter column after_data drop not null,
  drop constraint publication_history_event_type_check,
  add constraint publication_history_event_type_check
    check (
      event_type in (
        'publication.created',
        'publication.trashed',
        'publication.restored',
        'publication.cover_added',
        'publication.cover_updated',
        'publication.cover_removed'
      )
    );
