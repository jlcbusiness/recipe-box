'use client';

import { Printer } from 'lucide-react';
import { useRef } from 'react';
import { trashRecipe } from './actions';

export function RecipeDeleteAction({
  recipeId,
  recipeName,
  version,
  buttonLabel,
}: {
  recipeId: string;
  recipeName: string;
  version: number;
  buttonLabel: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        className="recipe-secondary-button recipe-detail-action recipe-delete-action"
        type="button"
        onClick={() => dialogRef.current?.showModal()}
      >
        {buttonLabel}
      </button>
      <dialog
        aria-describedby="recipe-trash-description"
        aria-labelledby="recipe-trash-title"
        className="recipe-confirmation-dialog"
        ref={dialogRef}
      >
        <h2 id="recipe-trash-title">Move recipe to Trash?</h2>
        <p id="recipe-trash-description">
          <strong>{recipeName}</strong> will move to Trash and can be restored for 30 days.
        </p>
        <div className="recipe-confirmation-actions">
          <form method="dialog">
            <button className="recipe-secondary-button" type="submit">
              Cancel
            </button>
          </form>
          <form action={trashRecipe}>
            <input name="recipe_id" type="hidden" value={recipeId} />
            <input name="expected_version" type="hidden" value={version} />
            <button className="recipe-primary-button" type="submit">
              Move to Trash
            </button>
          </form>
        </div>
      </dialog>
    </>
  );
}

export function RecipePrintAction() {
  return (
    <button
      aria-label="Print"
      className="recipe-secondary-button recipe-detail-action recipe-icon-action"
      title="Print recipe"
      type="button"
      onClick={() => window.print()}
    >
      <Printer aria-hidden="true" size={16} strokeWidth={2} />
    </button>
  );
}
