'use client';

import { useActionState, useEffect, useState } from 'react';
import { type RecipeMarkerActionState, setRecipeMarker } from './actions';
import { type RecipeMarker, RecipeMarkerIcon } from './recipe-marker-icons';

const initialState: RecipeMarkerActionState = { status: 'idle', message: '' };

function RecipeMarkerToggle({
  active,
  marker,
  onStatusChange,
  recipeId,
  version,
}: {
  active: boolean;
  marker: RecipeMarker;
  onStatusChange: (state: RecipeMarkerActionState | null) => void;
  recipeId: string;
  version: number;
}) {
  const [actionState, formAction, pending] = useActionState(setRecipeMarker, initialState);
  const [hoverSuppressed, setHoverSuppressed] = useState(false);
  const label = marker === 'star' ? 'Star recipe' : 'Heart recipe';

  useEffect(() => {
    if (pending) {
      onStatusChange(null);
    } else if (actionState.status === 'error') {
      onStatusChange(actionState);
    } else if (actionState.status === 'success') {
      onStatusChange(null);
    }
  }, [actionState, onStatusChange, pending]);

  return (
    <form
      action={formAction}
      className="recipe-marker-action-form"
      onPointerLeave={() => setHoverSuppressed(false)}
    >
      <input name="recipe_id" type="hidden" value={recipeId} />
      <input name="expected_version" type="hidden" value={version} />
      <input name="marker" type="hidden" value={marker} />
      <input name="enabled" type="hidden" value={String(!active)} />
      <button
        aria-busy={pending}
        aria-label={label}
        aria-pressed={active}
        className={`recipe-marker-toggle${active ? ' is-active' : ''}${hoverSuppressed ? ' is-hover-suppressed' : ''}`}
        data-marker={marker}
        onClick={() => setHoverSuppressed(true)}
        onPointerDown={() => setHoverSuppressed(true)}
        disabled={pending}
        type="submit"
      >
        <RecipeMarkerIcon marker={marker} size={20} />
      </button>
    </form>
  );
}

export function RecipeMarkerActions({
  starred,
  hearted,
  recipeId,
  version,
}: {
  starred: boolean;
  hearted: boolean;
  recipeId: string;
  version: number;
}) {
  const [actionStatus, setActionStatus] = useState<RecipeMarkerActionState | null>(null);

  return (
    <>
      <fieldset className="recipe-marker-actions">
        <legend className="visually-hidden">Recipe markers</legend>
        <RecipeMarkerToggle
          active={starred}
          marker="star"
          onStatusChange={setActionStatus}
          recipeId={recipeId}
          version={version}
        />
        <RecipeMarkerToggle
          active={hearted}
          marker="heart"
          onStatusChange={setActionStatus}
          recipeId={recipeId}
          version={version}
        />
      </fieldset>
      <span
        aria-live="polite"
        className="recipe-marker-action-status"
        data-status={actionStatus?.status}
        role={actionStatus?.status === 'error' ? 'alert' : 'status'}
      >
        {actionStatus?.message ?? ''}
      </span>
    </>
  );
}
