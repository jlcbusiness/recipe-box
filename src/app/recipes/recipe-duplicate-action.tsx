'use client';

import { Copy } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, useId, useRef, useState } from 'react';
import type { PublicationOption } from '../../lib/recipes/data';

type RecipeDuplicateActionProps = {
  recipeId: string;
  recipeName: string;
  sourcePublicationId: string | null;
  publications: PublicationOption[];
};

function defaultPublicationId(
  publications: PublicationOption[],
  sourcePublicationId: string | null,
) {
  return (
    publications.find((publication) => publication.id === sourcePublicationId)?.id ??
    publications.find((publication) => publication.publication_type === 'collection')?.id ??
    ''
  );
}

export function RecipeDuplicateAction({
  recipeId,
  recipeName,
  sourcePublicationId,
  publications,
}: RecipeDuplicateActionProps) {
  const router = useRouter();
  const actionId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(`${recipeName} (Copy)`);
  const [publicationId, setPublicationId] = useState(() =>
    defaultPublicationId(publications, sourcePublicationId),
  );
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  function openDialog() {
    setName(`${recipeName} (Copy)`);
    setPublicationId(defaultPublicationId(publications, sourcePublicationId));
    setStatusMessage('');
    setErrorMessage('');
    dialogRef.current?.showModal();
    nameInputRef.current?.focus();
  }

  function closeDialog() {
    if (isDuplicating) return;
    dialogRef.current?.close();
    requestAnimationFrame(() => triggerRef.current?.focus());
  }

  async function submitDuplicate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isDuplicating || !publicationId) return;

    setIsDuplicating(true);
    setStatusMessage('Copying recipe…');
    setErrorMessage('');
    try {
      const response = await fetch(`/api/recipes/${encodeURIComponent(recipeId)}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, publicationId }),
      });
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new Error('The server returned an invalid response.');
      }

      if (!response.ok) {
        const message =
          typeof payload === 'object' &&
          payload !== null &&
          'error' in payload &&
          typeof payload.error === 'string'
            ? payload.error
            : 'Unable to duplicate this recipe. Please try again.';
        throw new Error(message);
      }
      if (
        typeof payload !== 'object' ||
        payload === null ||
        !('recipeId' in payload) ||
        typeof payload.recipeId !== 'string'
      ) {
        throw new Error('The copy could not be opened. Please try again.');
      }

      setStatusMessage('Recipe copied. Opening the editor…');
      router.push(`/recipes/${payload.recipeId}/edit`);
    } catch (error) {
      console.error('Recipe duplication failed.', {
        operation: 'request',
        code: error instanceof Error ? error.name : 'unknown',
      });
      setStatusMessage('');
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Unable to duplicate this recipe. Please try again.',
      );
    } finally {
      setIsDuplicating(false);
    }
  }

  const nameId = `${actionId}-name`;
  const publicationIdField = `${actionId}-publication`;
  const descriptionId = `${actionId}-description`;
  const errorId = `${actionId}-error`;

  return (
    <div className="recipe-duplicate-action">
      <button
        aria-label="Duplicate recipe"
        className="recipe-secondary-button recipe-detail-action recipe-icon-action recipe-duplicate-trigger"
        onClick={openDialog}
        ref={triggerRef}
        title="Duplicate recipe"
        type="button"
      >
        <Copy aria-hidden="true" size={16} strokeWidth={2} />
      </button>
      <dialog
        aria-describedby={descriptionId}
        aria-labelledby={`${actionId}-title`}
        className="recipe-confirmation-dialog recipe-duplicate-dialog"
        onCancel={(event) => {
          event.preventDefault();
          closeDialog();
        }}
        ref={dialogRef}
      >
        <h2 id={`${actionId}-title`}>Duplicate recipe</h2>
        <p id={descriptionId}>
          Create a separate private copy. The original recipe will not change.
        </p>
        <form className="recipe-duplicate-form" onSubmit={submitDuplicate}>
          <div className="recipe-duplicate-field">
            <label htmlFor={nameId}>Name</label>
            <input
              autoComplete="off"
              id={nameId}
              onChange={(event) => setName(event.currentTarget.value)}
              ref={nameInputRef}
              required
              type="text"
              value={name}
            />
          </div>
          <div className="recipe-duplicate-field">
            <label htmlFor={publicationIdField}>Publication</label>
            <select
              id={publicationIdField}
              onChange={(event) => setPublicationId(event.currentTarget.value)}
              required
              value={publicationId}
            >
              <option disabled value="">
                Choose a publication
              </option>
              {publications.map((publication) => (
                <option key={publication.id} value={publication.id}>
                  {publication.name}
                </option>
              ))}
            </select>
          </div>
          <p className="recipe-duplicate-status" role="status" aria-live="polite">
            {statusMessage}
          </p>
          {errorMessage && (
            <p className="recipe-duplicate-error" id={errorId} role="alert">
              {errorMessage}
            </p>
          )}
          <div className="recipe-confirmation-actions">
            <button
              className="recipe-secondary-button"
              disabled={isDuplicating}
              onClick={closeDialog}
              type="button"
            >
              Cancel
            </button>
            <button
              className="recipe-primary-button"
              disabled={isDuplicating || !publicationId}
              type="submit"
            >
              {isDuplicating ? 'Copying…' : 'Duplicate recipe'}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
