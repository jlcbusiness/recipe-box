'use client';

import { ChevronDown, Trash2 } from 'lucide-react';
import { type KeyboardEvent, useRef, useState } from 'react';
import { trashPublication } from './actions';

type PublicationDisposition = '' | 'delete' | 'recipe_tin' | 'another_publication';

type DestinationPublication = {
  id: string;
  name: string;
  publication_type: 'book' | 'magazine' | 'site';
};

const publicationTypeLabels = {
  book: 'Book',
  magazine: 'Magazine Issue',
  site: 'Site',
} as const;

export function PublicationDeleteAction({
  publicationId,
  publicationName,
  version,
  destinations,
  hasRecipes,
}: {
  publicationId: string;
  publicationName: string;
  version: number;
  destinations: DestinationPublication[];
  hasRecipes: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [disposition, setDisposition] = useState<PublicationDisposition>('');
  const [destinationPublicationId, setDestinationPublicationId] = useState('');
  const [isDestinationOpen, setIsDestinationOpen] = useState(false);
  const formId = `publication-delete-form-${publicationId}`;
  const destinationPickerRef = useRef<HTMLFieldSetElement>(null);
  const destinationButtonRef = useRef<HTMLButtonElement>(null);
  const selectedDestination = destinations.find(
    (destination) => destination.id === destinationPublicationId,
  );

  function handleDestinationKeyDown(event: KeyboardEvent<HTMLFieldSetElement>) {
    if (event.key === 'Escape') {
      setIsDestinationOpen(false);
      destinationButtonRef.current?.focus();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const options =
        destinationPickerRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]');
      if (!options?.length) {
        return;
      }
      event.preventDefault();
      const currentIndex = Array.from(options).indexOf(document.activeElement as HTMLButtonElement);
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      const nextIndex =
        currentIndex < 0 ? 0 : (currentIndex + direction + options.length) % options.length;
      options[nextIndex]?.focus();
    }
  }

  return (
    <>
      <button
        className="recipe-secondary-button recipe-detail-action recipe-delete-action publication-delete-action"
        title="Delete publication"
        type="button"
        onClick={() => dialogRef.current?.showModal()}
      >
        <Trash2 aria-hidden="true" size={16} strokeWidth={2} />
        Delete publication
      </button>
      <dialog
        aria-describedby="publication-trash-description"
        aria-labelledby="publication-trash-title"
        className="recipe-confirmation-dialog publication-delete-dialog"
        ref={dialogRef}
      >
        <h2 id="publication-trash-title">Move publication to Trash?</h2>
        <p id="publication-trash-description">
          <strong>{publicationName}</strong> can be restored for 30 days.{' '}
          {hasRecipes ? 'Choose what happens to its recipes.' : 'It has no active recipes to move.'}
        </p>
        <form action={trashPublication} id={formId}>
          <input name="publication_id" type="hidden" value={publicationId} />
          <input name="expected_version" type="hidden" value={version} />
          {hasRecipes ? (
            <fieldset className="publication-delete-dispositions">
              <legend>Recipe disposition</legend>
              <label>
                <input
                  checked={disposition === 'delete'}
                  name="recipe_disposition"
                  required
                  type="radio"
                  value="delete"
                  onChange={() => setDisposition('delete')}
                />
                Move all recipes to Trash
              </label>
              <label>
                <input
                  checked={disposition === 'recipe_tin'}
                  name="recipe_disposition"
                  required
                  type="radio"
                  value="recipe_tin"
                  onChange={() => setDisposition('recipe_tin')}
                />
                Move recipes to the Recipe Tin
              </label>
              <label>
                <input
                  checked={disposition === 'another_publication'}
                  disabled={destinations.length === 0}
                  name="recipe_disposition"
                  required
                  type="radio"
                  value="another_publication"
                  onChange={() => setDisposition('another_publication')}
                />
                Move recipes to another publication
              </label>
              {disposition === 'another_publication' && destinations.length > 0 && (
                <fieldset
                  aria-labelledby="destination-publication-label"
                  className="publication-delete-destination"
                  onBlur={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                      setIsDestinationOpen(false);
                    }
                  }}
                  onKeyDown={handleDestinationKeyDown}
                  ref={destinationPickerRef}
                >
                  <legend id="destination-publication-label">Destination publication</legend>
                  <input
                    name="destination_publication_id"
                    type="hidden"
                    value={destinationPublicationId}
                  />
                  <button
                    aria-controls="destination-publication-options"
                    aria-expanded={isDestinationOpen}
                    aria-haspopup="listbox"
                    aria-labelledby="destination-publication-label destination-publication-value"
                    className="publication-delete-destination-button"
                    ref={destinationButtonRef}
                    type="button"
                    onClick={() => setIsDestinationOpen((open) => !open)}
                  >
                    <span id="destination-publication-value">
                      {selectedDestination
                        ? `${selectedDestination.name} (${publicationTypeLabels[selectedDestination.publication_type]})`
                        : 'Choose a publication'}
                    </span>
                    <ChevronDown aria-hidden="true" size={17} />
                  </button>
                  {isDestinationOpen && (
                    <div
                      aria-labelledby="destination-publication-label"
                      className="publication-delete-destination-options"
                      id="destination-publication-options"
                      role="listbox"
                    >
                      {destinations.map((destination) => (
                        <button
                          aria-selected={destination.id === destinationPublicationId}
                          className="publication-delete-destination-option"
                          key={destination.id}
                          role="option"
                          type="button"
                          onClick={() => {
                            setDestinationPublicationId(destination.id);
                            setIsDestinationOpen(false);
                            destinationButtonRef.current?.focus();
                          }}
                        >
                          <span>{destination.name}</span>
                          <small>{publicationTypeLabels[destination.publication_type]}</small>
                        </button>
                      ))}
                    </div>
                  )}
                </fieldset>
              )}
              {destinations.length === 0 && (
                <p className="publication-delete-no-destination">
                  Add another publication before moving recipes to a different publication.
                </p>
              )}
            </fieldset>
          ) : (
            <input name="recipe_disposition" type="hidden" value="delete" />
          )}
        </form>
        <div className="recipe-confirmation-actions">
          <form method="dialog">
            <button
              className="recipe-secondary-button"
              type="submit"
              onClick={() => setDisposition('')}
            >
              Cancel
            </button>
          </form>
          <button
            className="recipe-primary-button"
            disabled={
              hasRecipes &&
              (!disposition || (disposition === 'another_publication' && !destinationPublicationId))
            }
            form={formId}
            type="submit"
          >
            Move to Trash
          </button>
        </div>
      </dialog>
    </>
  );
}
