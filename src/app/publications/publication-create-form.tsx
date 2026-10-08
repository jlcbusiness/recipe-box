'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatIsbnInput, normalizeIsbn } from '../../lib/publications/validation';
import type { PublicationOption } from '../../lib/recipes/data';
import { createPublication } from './actions';

const publicationTypes = [
  ['book', 'Book'],
  ['magazine', 'Magazine'],
  ['site', 'Site'],
] as const;

type PublicationType = (typeof publicationTypes)[number][0];

export function PublicationCreateForm({
  onCreated,
  onCancel,
  cancelHref,
  initialName,
}: {
  onCreated?: (publication: PublicationOption) => void;
  onCancel?: () => void;
  cancelHref?: string;
  initialName?: string;
}) {
  const [actionState, formAction, pending] = useActionState(createPublication, undefined);
  const [publicationType, setPublicationType] = useState<PublicationType>('book');
  const [isbn, setIsbn] = useState('');
  const [isbnError, setIsbnError] = useState('');
  const isbnInputRef = useRef<HTMLInputElement>(null);
  const handledId = useRef('');
  const router = useRouter();

  useEffect(() => {
    const publication = actionState?.publication;
    if (!publication || handledId.current === publication.id) {
      return;
    }
    handledId.current = publication.id;
    if (onCreated) {
      onCreated(publication);
    } else {
      router.push(`/publications/${publication.id}`);
    }
  }, [actionState, onCreated, router]);

  return (
    <form
      action={formAction}
      className="publication-form"
      onSubmit={(event) => {
        if (publicationType === 'book' && isbn.trim() && !normalizeIsbn(isbn)) {
          event.preventDefault();
          setIsbnError('Enter a valid ISBN-10 or ISBN-13.');
          return;
        }
        setIsbnError('');
      }}
    >
      <fieldset className="publication-type-choice">
        <legend>Publication type</legend>
        <div>
          {publicationTypes.map(([value, label]) => (
            <label key={value}>
              <input
                checked={publicationType === value}
                name="publication_type"
                required
                type="radio"
                value={value}
                onChange={() => {
                  setPublicationType(value);
                  if (value !== 'book') {
                    setIsbn('');
                  }
                }}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="publication-field publication-field-full-width" htmlFor="publication-name">
        <span>{publicationType === 'magazine' ? 'Magazine name' : 'Name'}</span>
        <input
          autoComplete="off"
          defaultValue={initialName}
          id="publication-name"
          name="name"
          required
        />
      </label>
      {publicationType === 'book' && (
        <>
          <label
            className="publication-field publication-field-author"
            htmlFor="publication-author"
          >
            <span>Author</span>
            <input id="publication-author" name="author" />
          </label>
          <label
            className="publication-field publication-field-edition"
            htmlFor="publication-edition"
          >
            <span>Edition</span>
            <input id="publication-edition" name="edition" />
          </label>
          <label className="publication-field publication-field-isbn" htmlFor="publication-isbn">
            <span id="publication-isbn-label">ISBN</span>
            <input
              aria-labelledby="publication-isbn-label"
              id="publication-isbn"
              aria-describedby="publication-isbn-hint"
              name="isbn"
              ref={isbnInputRef}
              value={isbn}
              onChange={(event) => {
                const input = event.currentTarget;
                const rawValue = input.value;
                const rawCaret = input.selectionStart ?? rawValue.length;
                const charactersBeforeCaret = rawValue
                  .slice(0, rawCaret)
                  .replace(/[^\dX]/gi, '').length;
                const formatted = formatIsbnInput(rawValue);
                setIsbn(formatted);
                setIsbnError('');
                requestAnimationFrame(() => {
                  if (document.activeElement !== input) {
                    return;
                  }
                  let characterCount = 0;
                  let caret = formatted.length;
                  for (let index = 0; index < formatted.length; index += 1) {
                    if (/[\dX]/i.test(formatted[index])) {
                      characterCount += 1;
                    }
                    if (characterCount === charactersBeforeCaret) {
                      caret = formatted[index + 1] === '-' ? index + 2 : index + 1;
                      break;
                    }
                  }
                  input.setSelectionRange(caret, caret);
                });
              }}
            />
            <span className="publication-field-hint" id="publication-isbn-hint">
              ISBN-13 begins with 978 or 979.
            </span>
          </label>
          <label
            className="publication-field publication-field-full-width"
            htmlFor="publication-retailer-url"
          >
            <span>Retailer URL</span>
            <input id="publication-retailer-url" inputMode="url" name="retailer_url" type="text" />
          </label>
        </>
      )}
      {publicationType === 'site' && (
        <label
          className="publication-field publication-field-full-width"
          htmlFor="publication-site-url"
        >
          <span>Site URL</span>
          <input id="publication-site-url" inputMode="url" name="site_url" required type="text" />
        </label>
      )}
      {(isbnError || actionState?.error) && (
        <p className="publication-form-error" role="alert">
          {isbnError || actionState?.error}
        </p>
      )}
      <div className="publication-form-actions">
        {cancelHref ? (
          <Link className="recipe-secondary-link" href={cancelHref}>
            Cancel
          </Link>
        ) : (
          onCancel && (
            <button className="recipe-secondary-button" type="button" onClick={onCancel}>
              Cancel
            </button>
          )
        )}
        <button className="recipe-primary-button" disabled={pending} type="submit">
          {pending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}

export function PublicationCreateDialog({
  onCreated,
  initialName,
  isOpen,
  onClose,
}: {
  onCreated: (publication: PublicationOption) => void;
  initialName: string;
  isOpen: boolean;
  onClose: () => void;
}) {
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    setPortalTarget(document.body);
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (isOpen && dialog && !dialog.open) {
      dialog.showModal();
      dialog.querySelector<HTMLInputElement>('#publication-name')?.focus();
    }
  }, [isOpen]);

  return (
    <>
      {isOpen &&
        portalTarget &&
        createPortal(
          <dialog
            aria-labelledby="publication-create-title"
            className="publication-create-dialog"
            id="publication-create-dialog"
            ref={dialogRef}
            onCancel={(event) => {
              event.preventDefault();
              onClose();
            }}
          >
            <div className="publication-dialog-heading">
              <h2 id="publication-create-title">Add publication</h2>
              <button
                aria-label="Close publication creation"
                className="publication-dialog-close"
                title="Close"
                type="button"
                onClick={onClose}
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>
            <PublicationCreateForm
              initialName={initialName}
              onCancel={onClose}
              onCreated={onCreated}
            />
          </dialog>,
          portalTarget,
        )}
    </>
  );
}
