'use client';

import { Check, LoaderCircle, Save } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { createClient } from '../../lib/supabase/browser';

type PublicRecipeSaveActionProps = {
  children?: ReactNode;
  publicId: string;
  recipeName: string;
};

type CopyResponse = {
  alreadySaved?: unknown;
  recipeId?: unknown;
  error?: unknown;
};

type ExistingCopy = { recipeId: string };

function isMissingAuthSession(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === 'AuthSessionMissingError'
  );
}

export function PublicRecipeSaveAction({
  children,
  publicId,
  recipeName,
}: PublicRecipeSaveActionProps) {
  const [isVerifiedUser, setIsVerifiedUser] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedRecipeId, setSavedRecipeId] = useState<string | null>(null);
  const [existingCopy, setExistingCopy] = useState<ExistingCopy | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    let active = true;
    createClient()
      .auth.getUser()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          if (isMissingAuthSession(error)) return;
          console.error('Public recipe sign-in verification failed.', { code: error.name });
          setErrorMessage('Sign-in status could not be verified.');
          return;
        }
        setIsVerifiedUser(Boolean(data.user));
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (isMissingAuthSession(error)) return;
        console.error('Public recipe sign-in verification failed.', {
          code: error instanceof Error ? error.name : 'unknown',
        });
        setErrorMessage('Sign-in status could not be verified.');
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (existingCopy) {
      dialogRef.current?.showModal();
    } else {
      dialogRef.current?.close();
    }
  }, [existingCopy]);

  async function saveRecipe() {
    if (isSaving) return;
    setIsSaving(true);
    setErrorMessage(null);
    try {
      const response = await fetch(`/api/public-recipes/${publicId}/copy`, { method: 'POST' });
      let payload: CopyResponse = {};
      try {
        payload = (await response.json()) as CopyResponse;
      } catch (error) {
        console.error('Public recipe copy endpoint returned a non-JSON response.', {
          status: response.status,
          code: error instanceof Error ? error.name : 'unknown',
        });
        setErrorMessage(
          response.status === 404
            ? 'Saving public recipes is not available on this version of Recipe Box.'
            : 'Unable to save this recipe. Please try again.',
        );
        return;
      }
      if (!response.ok) {
        setErrorMessage(
          typeof payload.error === 'string'
            ? payload.error
            : 'Unable to save this recipe. Please try again.',
        );
        return;
      }
      if (typeof payload.recipeId !== 'string') {
        setErrorMessage('The saved recipe could not be opened. Please try again.');
        return;
      }
      if (payload.alreadySaved === true) {
        setExistingCopy({ recipeId: payload.recipeId });
      } else {
        setSavedRecipeId(payload.recipeId);
      }
    } catch (error) {
      console.error('Public recipe copy request failed.', {
        code: error instanceof Error ? error.name : 'unknown',
      });
      setErrorMessage('Unable to save this recipe. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <div className="recipe-public-header-actions">
        <div className="recipe-public-title-actions">
          {isVerifiedUser && (
            <div className="recipe-public-save-action">
              <button
                aria-busy={isSaving}
                aria-label={
                  isSaving
                    ? 'Saving recipe'
                    : savedRecipeId
                      ? 'Saved to Recipe Tin'
                      : 'Save to Recipe Tin'
                }
                className="recipe-secondary-button recipe-detail-action recipe-icon-action recipe-public-save-button"
                disabled={isSaving || Boolean(savedRecipeId)}
                title={
                  isSaving
                    ? 'Saving recipe'
                    : savedRecipeId
                      ? 'Saved to Recipe Tin'
                      : 'Save to Recipe Tin'
                }
                type="button"
                onClick={saveRecipe}
              >
                {isSaving ? (
                  <LoaderCircle
                    aria-hidden="true"
                    className="recipe-public-save-spinner"
                    size={16}
                    strokeWidth={2}
                  />
                ) : savedRecipeId ? (
                  <Check aria-hidden="true" size={16} strokeWidth={2} />
                ) : (
                  <Save aria-hidden="true" size={16} strokeWidth={2} />
                )}
              </button>
            </div>
          )}
          {children}
        </div>
      </div>
      {(savedRecipeId || errorMessage) && (
        <div className="recipe-public-save-feedback-anchor">
          <div
            className={`recipe-public-save-feedback ${savedRecipeId ? 'is-success' : 'is-error'}`}
          >
            {savedRecipeId && (
              <p className="recipe-public-save-status" role="status">
                <span className="visually-hidden">Saved to your Recipe Tin. </span>
                <span aria-hidden="true" className="recipe-public-save-status-full">
                  Saved to your Recipe Tin.
                </span>
                <span aria-hidden="true" className="recipe-public-save-status-compact">
                  Saved.
                </span>{' '}
                <a aria-label="Open your saved copy" href={`/recipes/${savedRecipeId}`}>
                  <span className="recipe-public-save-status-full">Open your saved copy</span>
                  <span className="recipe-public-save-status-compact">Open</span>
                </a>
              </p>
            )}
            {errorMessage && (
              <p className="recipe-public-save-error" role="alert">
                <span className="recipe-public-save-error-full">{errorMessage}</span>
                <span aria-hidden="true" className="recipe-public-save-error-compact">
                  Not saved
                </span>
              </p>
            )}
          </div>
        </div>
      )}
      <dialog
        aria-describedby="public-recipe-copy-dialog-description"
        aria-labelledby="public-recipe-copy-dialog-title"
        className="recipe-confirmation-dialog recipe-publish-dialog recipe-public-copy-dialog"
        ref={dialogRef}
        onCancel={() => setExistingCopy(null)}
      >
        <h2 id="public-recipe-copy-dialog-title">Already in your Recipe Tin</h2>
        <p id="public-recipe-copy-dialog-description">
          You already saved {recipeName}. Would you like to open your saved copy?
        </p>
        <div className="recipe-confirmation-actions">
          {existingCopy && (
            <a className="recipe-primary-link" href={`/recipes/${existingCopy.recipeId}`}>
              Open saved copy
            </a>
          )}
          <button
            className="recipe-secondary-button"
            type="button"
            onClick={() => setExistingCopy(null)}
          >
            Cancel
          </button>
        </div>
      </dialog>
    </>
  );
}
