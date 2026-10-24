'use client';

import { Pencil } from 'lucide-react';
import { useActionState, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { MediaAssetDisplay } from '../../lib/media/data';
import { formatIsbnInput } from '../../lib/publications/validation';
import type { PublicationOption, PublicationType, TagOption } from '../../lib/recipes/data';
import { MediaManager } from '../media/media-manager';
import { TagMultiSelect } from '../tags/tag-controls';
import { updatePublication } from './actions';
import { PublicationDeleteAction } from './publication-delete-action';

const publicationTypeLabels: Record<PublicationType, string> = {
  book: 'Book',
  magazine: 'Magazine',
  site: 'Site',
  collection: 'Recipe Tin',
};

type EditablePublication = PublicationOption & { version: number };

export function PublicationEditAction({
  publication,
  assets,
  destinations,
  hasRecipes,
  tags,
  selectedTagIds,
}: {
  publication: EditablePublication;
  assets: MediaAssetDisplay[];
  destinations: Pick<PublicationOption, 'id' | 'name' | 'publication_type'>[];
  hasRecipes: boolean;
  tags: TagOption[];
  selectedTagIds: string[];
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        aria-label="Edit publication"
        className="recipe-secondary-button publication-edit-action"
        title="Edit publication"
        type="button"
        onClick={() => setIsOpen(true)}
      >
        <Pencil aria-hidden="true" size={17} strokeWidth={2} />
        <span className="publication-edit-label">Edit</span>
      </button>
      {isOpen && (
        <PublicationEditDialog
          assets={assets}
          destinations={destinations}
          hasRecipes={hasRecipes}
          publication={publication}
          selectedTagIds={selectedTagIds}
          tags={tags}
          onClose={() => setIsOpen(false)}
          onSaved={() => setIsOpen(false)}
        />
      )}
    </>
  );
}

function PublicationEditDialog({
  publication,
  assets,
  destinations,
  hasRecipes,
  tags,
  selectedTagIds,
  onClose,
  onSaved,
}: {
  publication: EditablePublication;
  assets: MediaAssetDisplay[];
  destinations: Pick<PublicationOption, 'id' | 'name' | 'publication_type'>[];
  hasRecipes: boolean;
  tags: TagOption[];
  selectedTagIds: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [actionState, formAction, pending] = useActionState(updatePublication, undefined);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState({
    name: publication.name,
    author: publication.author ?? '',
    edition: publication.edition ?? '',
    isbn: publication.isbn ? formatIsbnInput(publication.isbn) : '',
    retailerUrl: publication.retailer_url ?? '',
    siteUrl: publication.site_url ?? '',
  });
  const nameId = `publication-edit-name-${publication.id}`;
  const formId = `publication-edit-form-${publication.id}`;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
      dialog.querySelector<HTMLInputElement>('input[name="name"]')?.focus();
    }
  }, []);

  useEffect(() => {
    if (actionState?.updated) {
      if (dialogRef.current?.open) {
        dialogRef.current.close();
      }
      onSaved();
    }
  }, [actionState, onSaved]);

  useLayoutEffect(() => {
    const actions = actionsRef.current;
    const deleteButton = actions?.querySelector<HTMLButtonElement>('.publication-delete-action');
    const saveButton = actions?.querySelector<HTMLButtonElement>('.publication-save-action');
    if (!deleteButton || !saveButton) {
      return;
    }

    const matchDeleteWidth = () => {
      saveButton.style.width = `${deleteButton.getBoundingClientRect().width}px`;
    };
    matchDeleteWidth();

    const observer = new ResizeObserver(matchDeleteWidth);
    observer.observe(deleteButton);
    return () => observer.disconnect();
  }, []);

  function closeDialog() {
    if (dialogRef.current?.open) {
      dialogRef.current.close();
    }
    onClose();
  }

  const isBook = publication.publication_type === 'book';
  const isMagazine = publication.publication_type === 'magazine';
  const isSite = publication.publication_type === 'site';

  return (
    <dialog
      aria-labelledby="publication-edit-title"
      className="publication-edit-dialog"
      ref={dialogRef}
      onCancel={(event) => {
        event.preventDefault();
        closeDialog();
      }}
    >
      <div className="publication-dialog-heading">
        <div>
          <p className="eyebrow publication-edit-type">
            {publicationTypeLabels[publication.publication_type]}
          </p>
          <h2 id="publication-edit-title">Edit publication</h2>
        </div>
        <button
          aria-label="Close publication editor"
          className="publication-dialog-close"
          title="Close"
          type="button"
          onClick={closeDialog}
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>
      <div className="publication-edit-top-row">
        <div className="publication-edit-cover">
          <MediaManager
            assets={assets}
            parentId={publication.id}
            parentName={publication.name}
            parentType="publication"
                        expectedVersion={publication.version}
            publication={publication}
          />
        </div>
        <label className="publication-field publication-edit-name" htmlFor={nameId}>
          <span>{isMagazine ? 'Magazine name' : 'Name'}</span>
          <input
            autoComplete="off"
            form={formId}
            id={nameId}
            name="name"
            required
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.currentTarget.value })}
          />
        </label>
      </div>
      <form action={formAction} className="publication-form" id={formId}>
        <input name="publication_id" type="hidden" value={publication.id} />
        <input name="expected_version" type="hidden" value={publication.version} />
        {isBook && (
          <>
            <label
              className="publication-field publication-field-author"
              htmlFor={`publication-edit-author-${publication.id}`}
            >
              <span>Author</span>
              <input
                id={`publication-edit-author-${publication.id}`}
                name="author"
                value={draft.author}
                onChange={(event) => setDraft({ ...draft, author: event.currentTarget.value })}
              />
            </label>
            <label
              className="publication-field publication-field-edition"
              htmlFor={`publication-edit-edition-${publication.id}`}
            >
              <span>Edition</span>
              <input
                id={`publication-edit-edition-${publication.id}`}
                name="edition"
                value={draft.edition}
                onChange={(event) => setDraft({ ...draft, edition: event.currentTarget.value })}
              />
            </label>
            <label
              className="publication-field publication-field-isbn"
              htmlFor={`publication-edit-isbn-${publication.id}`}
            >
              <span>ISBN</span>
              <input
                aria-describedby={`publication-edit-isbn-hint-${publication.id}`}
                autoComplete="off"
                id={`publication-edit-isbn-${publication.id}`}
                inputMode="numeric"
                name="isbn"
                value={draft.isbn}
                onChange={(event) =>
                  setDraft({ ...draft, isbn: formatIsbnInput(event.currentTarget.value) })
                }
              />
              <span
                className="publication-field-hint"
                id={`publication-edit-isbn-hint-${publication.id}`}
              >
                ISBN-13 begins with 978 or 979.
              </span>
            </label>
            <label
              className="publication-field publication-field-full-width"
              htmlFor={`publication-edit-retailer-url-${publication.id}`}
            >
              <span>Retailer URL</span>
              <input
                id={`publication-edit-retailer-url-${publication.id}`}
                inputMode="url"
                name="retailer_url"
                type="text"
                value={draft.retailerUrl}
                onChange={(event) => setDraft({ ...draft, retailerUrl: event.currentTarget.value })}
              />
            </label>
          </>
        )}
        {isSite && (
          <label
            className="publication-field publication-field-full-width"
            htmlFor={`publication-edit-site-url-${publication.id}`}
          >
            <span>Site URL</span>
            <input
              aria-required="true"
              id={`publication-edit-site-url-${publication.id}`}
              inputMode="url"
              name="site_url"
              type="text"
              value={draft.siteUrl}
              onChange={(event) => setDraft({ ...draft, siteUrl: event.currentTarget.value })}
            />
          </label>
        )}
        <TagMultiSelect selectedIds={selectedTagIds} tags={tags} />
        {actionState?.error && (
          <p className="publication-form-error" role="alert">
            {actionState.error}
          </p>
        )}
        <div className="publication-form-actions" ref={actionsRef}>
          <PublicationDeleteAction
            destinations={destinations}
            hasRecipes={hasRecipes}
            publicationId={publication.id}
            publicationName={publication.name}
            version={publication.version}
          />
          <button
            className="recipe-primary-button publication-save-action"
            disabled={pending}
            type="submit"
          >
            {pending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
