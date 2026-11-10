'use client';

import { Trash2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { trashRecipe } from './actions';

function updateRecipeDeleteDialogViewport(dialog: HTMLDialogElement) {
  const visualViewport = window.visualViewport;
  const left = visualViewport?.offsetLeft ?? 0;
  const top = visualViewport?.offsetTop ?? 0;
  const width = visualViewport?.width ?? window.innerWidth;
  const height = visualViewport?.height ?? window.innerHeight;

  dialog.style.left = `${left + width / 2}px`;
  dialog.style.top = `${top + height / 2}px`;
  dialog.style.width = `min(28rem, ${Math.max(0, width - 32)}px)`;
  dialog.style.maxHeight = `${Math.max(0, height - 32)}px`;
}

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

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const visualViewport = window.visualViewport;
    const updateViewport = () => updateRecipeDeleteDialogViewport(dialog);
    updateViewport();
    visualViewport?.addEventListener('resize', updateViewport);
    visualViewport?.addEventListener('scroll', updateViewport);
    window.addEventListener('resize', updateViewport);
    return () => {
      visualViewport?.removeEventListener('resize', updateViewport);
      visualViewport?.removeEventListener('scroll', updateViewport);
      window.removeEventListener('resize', updateViewport);
    };
  }, []);

  return (
    <>
      <button
        className="recipe-secondary-link recipe-delete-action"
        type="button"
        onClick={() => {
          const dialog = dialogRef.current;
          if (!dialog) return;
          updateRecipeDeleteDialogViewport(dialog);
          dialog.showModal();
        }}
      >
        {buttonLabel}
      </button>
      <dialog
        aria-describedby="recipe-trash-description"
        aria-labelledby="recipe-trash-title"
        className="recipe-confirmation-dialog recipe-delete-dialog"
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
              <Trash2 aria-hidden="true" size={16} strokeWidth={2} />
              Trash
            </button>
          </form>
        </div>
      </dialog>
    </>
  );
}
