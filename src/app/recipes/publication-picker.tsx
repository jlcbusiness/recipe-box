'use client';

import { type KeyboardEvent, useRef, useState } from 'react';
import type { PublicationOption } from '../../lib/recipes/data';
import { PublicationCreateDialog } from '../publications/publication-create-form';

function publicationLabel(publication: PublicationOption): string {
  if (publication.publication_type === 'magazine' && publication.issue) {
    return `${publication.name} — ${publication.issue}`;
  }
  return publication.name;
}

export function PublicationPicker({
  publications,
  initialPublicationId,
  initialPage,
  initialUrl,
}: {
  publications: PublicationOption[];
  initialPublicationId: string | null;
  initialPage: string | null;
  initialUrl: string | null;
}) {
  const [options, setOptions] = useState(publications);
  const [publicationId, setPublicationId] = useState(initialPublicationId ?? '');
  const initialPublication = publications.find((item) => item.id === initialPublicationId);
  const [query, setQuery] = useState(
    initialPublication ? publicationLabel(initialPublication) : 'Recipe Tin',
  );
  const [page, setPage] = useState(initialPage ?? '');
  const [recipeUrl, setRecipeUrl] = useState(initialUrl ?? '');
  const [isOpen, setIsOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createPublicationName, setCreatePublicationName] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLFieldSetElement>(null);
  const selectedPublication = options.find((item) => item.id === publicationId);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredOptions = options.filter((item) =>
    publicationLabel(item).toLocaleLowerCase().includes(normalizedQuery),
  );
  const showRecipeTin = !normalizedQuery || 'recipe tin'.includes(normalizedQuery);
  const hasExactMatch = options.some(
    (item) => publicationLabel(item).toLocaleLowerCase() === normalizedQuery,
  );
  const showCreatePublication = Boolean(normalizedQuery) && !hasExactMatch;
  const optionCount =
    filteredOptions.length + (showRecipeTin ? 1 : 0) + (showCreatePublication ? 1 : 0);
  const activeOptionIndex = Math.min(activeIndex, Math.max(0, optionCount - 1));
  const activeOptionId = `publication-option-${activeOptionIndex}`;

  function selectPublication(publication: PublicationOption | null) {
    const previousType = selectedPublication?.publication_type ?? null;
    const nextType = publication?.publication_type ?? null;
    setPublicationId(publication?.id ?? '');
    setQuery(publication ? publicationLabel(publication) : 'Recipe Tin');
    if (previousType !== nextType) {
      setPage('');
      setRecipeUrl('');
    }
    setIsOpen(false);
    setActiveIndex(0);
  }

  function addPublication(publication: PublicationOption) {
    setOptions((current) => [...current.filter((item) => item.id !== publication.id), publication]);
    setPublicationId(publication.id);
    setQuery(publicationLabel(publication));
    setPage('');
    setRecipeUrl('');
    setIsOpen(false);
  }

  function closePublicationDialog() {
    setIsCreateOpen(false);
    setQuery(createPublicationName);
    setIsOpen(true);
    setActiveIndex(0);
  }

  function handlePublicationCreated(publication: PublicationOption) {
    addPublication(publication);
    setIsCreateOpen(false);
  }

  function chooseActiveOption() {
    if (showRecipeTin && activeOptionIndex === 0) {
      selectPublication(null);
      return;
    }
    const publicationIndex = activeOptionIndex - (showRecipeTin ? 1 : 0);
    if (showCreatePublication && publicationIndex === filteredOptions.length) {
      openPublicationDialog();
      return;
    }
    const publication = filteredOptions[publicationIndex];
    if (publication) {
      selectPublication(publication);
    }
  }

  function openPublicationDialog() {
    setCreatePublicationName(query.trim());
    setIsOpen(false);
    setIsCreateOpen(true);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' && optionCount > 0) {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((current) => Math.min(current + 1, optionCount - 1));
    } else if (event.key === 'ArrowUp' && optionCount > 0) {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === 'Enter' && isOpen && optionCount > 0) {
      event.preventDefault();
      chooseActiveOption();
    } else if (event.key === 'Escape' && isOpen) {
      event.preventDefault();
      setIsOpen(false);
      setQuery(selectedPublication ? publicationLabel(selectedPublication) : 'Recipe Tin');
    }
  }

  return (
    <div className="publication-picker-fieldset">
      <input name="publication_id" type="hidden" value={publicationId} />
      <input name="publication_page" type="hidden" value={page} />
      <input name="recipe_url" type="hidden" value={recipeUrl} />
      <fieldset
        className="publication-picker"
        ref={containerRef}
        onBlur={(event) => {
          if (!containerRef.current?.contains(event.relatedTarget as Node)) {
            setIsOpen(false);
            setQuery(selectedPublication ? publicationLabel(selectedPublication) : 'Recipe Tin');
          }
        }}
      >
        <legend className="visually-hidden">Publication assignment</legend>
        <label className="publication-picker-label" htmlFor="recipe-publication">
          <span>Publication</span>
          <input
            aria-activedescendant={isOpen && optionCount > 0 ? activeOptionId : undefined}
            aria-autocomplete="list"
            aria-controls="publication-options"
            aria-expanded={isOpen}
            autoComplete="off"
            id="recipe-publication"
            role="combobox"
            type="search"
            value={query}
            onChange={(event) => {
              const nextQuery = event.target.value;
              setQuery(nextQuery);
              if (
                selectedPublication &&
                nextQuery.trim().toLocaleLowerCase() !==
                  publicationLabel(selectedPublication).toLocaleLowerCase()
              ) {
                setPublicationId('');
                setPage('');
                setRecipeUrl('');
              }
              setIsOpen(true);
              setActiveIndex(0);
            }}
            onFocus={() => {
              setQuery('');
              setIsOpen(true);
            }}
            onKeyDown={handleKeyDown}
          />
        </label>
        {isOpen && (
          <div
            aria-label="Publication options"
            className="publication-picker-options"
            id="publication-options"
            role="listbox"
          >
            {showRecipeTin && (
              <button
                aria-selected={!publicationId}
                className="publication-picker-option"
                id="publication-option-0"
                role="option"
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectPublication(null)}
              >
                Recipe Tin
              </button>
            )}
            {filteredOptions.map((publication, index) => {
              const optionIndex = index + (showRecipeTin ? 1 : 0);
              return (
                <button
                  aria-selected={publication.id === publicationId}
                  className="publication-picker-option"
                  id={`publication-option-${optionIndex}`}
                  key={publication.id}
                  role="option"
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectPublication(publication)}
                >
                  <span>{publicationLabel(publication)}</span>
                  <small>
                    {publication.publication_type === 'magazine'
                      ? 'Magazine Issue'
                      : publication.publication_type === 'site'
                        ? 'Site'
                        : 'Book'}
                  </small>
                </button>
              );
            })}
            {showCreatePublication && (
              <button
                aria-selected={false}
                className="publication-picker-option publication-picker-create-option"
                id={`publication-option-${filteredOptions.length + (showRecipeTin ? 1 : 0)}`}
                role="option"
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={openPublicationDialog}
              >
                Add &quot;{query.trim()}&quot;
              </button>
            )}
            {optionCount === 0 && (
              <p className="publication-picker-empty">No matching publications.</p>
            )}
          </div>
        )}
        <PublicationCreateDialog
          initialName={createPublicationName}
          isOpen={isCreateOpen}
          onClose={closePublicationDialog}
          onCreated={handlePublicationCreated}
        />
      </fieldset>
      {selectedPublication?.publication_type === 'book' && (
        <label className="publication-field" htmlFor="recipe-publication-page">
          <span>Page(s)</span>
          <input
            id="recipe-publication-page"
            size={Math.max(4, page.length)}
            value={page}
            onChange={(event) => setPage(event.target.value)}
          />
        </label>
      )}
      {selectedPublication?.publication_type === 'site' && (
        <label className="publication-field" htmlFor="recipe-publication-url">
          <span>Url</span>
          <input
            id="recipe-publication-url"
            inputMode="url"
            type="text"
            value={recipeUrl}
            onChange={(event) => setRecipeUrl(event.target.value)}
          />
        </label>
      )}
    </div>
  );
}
