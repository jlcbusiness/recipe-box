'use client';

import { Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { purgeAllTrashed, purgeTrashedItem } from '../actions';

type PublicationRecipePurgeChoice = '' | 'all' | 'deleted_with_publication' | 'keep';

export function TrashPurgeAction({
  itemType,
  itemId,
  itemName,
  version,
}: {
  itemType: 'recipe' | 'publication';
  itemId: string;
  itemName: string;
  version: number;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [recipeChoice, setRecipeChoice] = useState<PublicationRecipePurgeChoice>('');
  const titleId = `purge-title-${itemType}-${itemId}`;
  const descriptionId = `purge-description-${itemType}-${itemId}`;

  return (
    <>
      <button
        aria-label={`Purge ${itemName}`}
        className="recipe-trash-purge"
        title={`Purge ${itemName}`}
        type="button"
        onClick={() => {
          setRecipeChoice('');
          dialogRef.current?.showModal();
        }}
      >
        <Trash2 aria-hidden="true" size={16} strokeWidth={2} />
        Purge
      </button>
      <dialog
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        className="recipe-confirmation-dialog"
        ref={dialogRef}
      >
        <h2 id={titleId}>Permanently delete {itemName}?</h2>
        <p id={descriptionId}>
          This cannot be undone.
          {itemType === 'publication' && ' Choose what happens to its recipes.'}
        </p>
        <form action={purgeTrashedItem} className="recipe-purge-form">
          <input name="item_type" type="hidden" value={itemType} />
          <input name="item_id" type="hidden" value={itemId} />
          <input name="expected_version" type="hidden" value={version} />
          {itemType === 'publication' && (
            <fieldset className="publication-purge-dispositions">
              <legend>Publication recipes</legend>
              <label>
                <input
                  checked={recipeChoice === 'all'}
                  name="recipe_purge_disposition"
                  required
                  type="radio"
                  value="all"
                  onChange={() => setRecipeChoice('all')}
                />
                <span>
                  <strong>Every recipe from this publication</strong>
                  <small>Delete recipes filed here, including ones already in Trash.</small>
                </span>
              </label>
              <label>
                <input
                  checked={recipeChoice === 'deleted_with_publication'}
                  name="recipe_purge_disposition"
                  required
                  type="radio"
                  value="deleted_with_publication"
                  onChange={() => setRecipeChoice('deleted_with_publication')}
                />
                <span>
                  <strong>Only recipes moved to Trash with it</strong>
                  <small>
                    Delete only recipes that were trashed with this publication; keep the rest.
                  </small>
                </span>
              </label>
              <label>
                <input
                  checked={recipeChoice === 'keep'}
                  name="recipe_purge_disposition"
                  required
                  type="radio"
                  value="keep"
                  onChange={() => setRecipeChoice('keep')}
                />
                <span>
                  <strong>Keep all recipes</strong>
                  <small>Delete the publication; keep all recipes in the Trash.</small>
                </span>
              </label>
            </fieldset>
          )}
          <div className="recipe-confirmation-actions">
            <button
              className="recipe-secondary-button"
              type="button"
              onClick={() => {
                setRecipeChoice('');
                dialogRef.current?.close();
              }}
            >
              Cancel
            </button>
            <button
              className="recipe-secondary-button recipe-delete-action"
              disabled={itemType === 'publication' && !recipeChoice}
              type="submit"
            >
              Permanently delete
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}

export function TrashPurgeAllAction() {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        className="recipe-secondary-button recipe-delete-action"
        type="button"
        onClick={() => dialogRef.current?.showModal()}
      >
        <Trash2 aria-hidden="true" size={16} strokeWidth={2} />
        Purge all
      </button>
      <dialog
        aria-describedby="purge-all-description"
        aria-labelledby="purge-all-title"
        className="recipe-confirmation-dialog"
        ref={dialogRef}
      >
        <h2 id="purge-all-title">Permanently delete all Trash?</h2>
        <p id="purge-all-description">
          All trashed recipes, publications, and their history will be deleted. This cannot be
          undone.
        </p>
        <form action={purgeAllTrashed} className="recipe-confirmation-actions">
          <button
            className="recipe-secondary-button"
            type="button"
            onClick={() => dialogRef.current?.close()}
          >
            Cancel
          </button>
          <button className="recipe-secondary-button recipe-delete-action" type="submit">
            Purge all
          </button>
        </form>
      </dialog>
    </>
  );
}
