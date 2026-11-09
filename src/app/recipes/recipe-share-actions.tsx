'use client';

import { Share2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  type SyntheticEvent,
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  type PublishRecipeActionState,
  publishRecipeWithUsername,
  setRecipePrivacy,
} from './actions';

export function RecipeShareActions({
  isPrivate,
  publicId,
  recipeId,
  recipeName,
  publicUsername,
  version,
}: {
  isPrivate: boolean;
  publicId: string;
  recipeId: string;
  recipeName: string;
  publicUsername: string | null;
  version: number;
}) {
  const router = useRouter();
  const [copyStatus, setCopyStatus] = useState('');
  const [dialogMode, setDialogMode] = useState<'copy' | 'username' | null>(null);
  const [hidePublishError, setHidePublishError] = useState(false);
  const [publicUsernameInput, setPublicUsernameInput] = useState('');
  const shareButtonRef = useRef<HTMLButtonElement>(null);
  const privacyButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const dialogTitleRef = useRef<HTMLHeadingElement>(null);
  const dialogTriggerRef = useRef<HTMLButtonElement | null>(null);
  const handledPublishStateRef = useRef<PublishRecipeActionState | null>(null);
  const [publishState, publishAction, isPublishing] = useActionState(publishRecipeWithUsername, {
    status: 'idle',
  });
  const closeDialog = useCallback(() => {
    const dialog = dialogRef.current;
    if (dialog?.open) dialog.close();
    setDialogMode(null);
    window.requestAnimationFrame(() => dialogTriggerRef.current?.focus());
  }, []);

  useEffect(() => {
    function dismissCopyStatus(event: PointerEvent) {
      if (event.target instanceof Node && shareButtonRef.current?.contains(event.target)) {
        return;
      }
      setCopyStatus('');
    }

    document.addEventListener('pointerdown', dismissCopyStatus);
    return () => document.removeEventListener('pointerdown', dismissCopyStatus);
  }, []);

  useEffect(() => {
    if (!dialogMode) return;
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    dialogTitleRef.current?.focus();
  }, [dialogMode]);

  useEffect(() => {
    if (publishState.status !== 'published' || handledPublishStateRef.current === publishState) {
      return;
    }
    const completedState = publishState;
    handledPublishStateRef.current = completedState;

    async function finishPublish() {
      if (completedState.intent === 'copy') {
        try {
          await navigator.clipboard.writeText(
            `${window.location.origin}/r/${completedState.publicId}`,
          );
          setCopyStatus('Link copied!');
        } catch {
          setCopyStatus('Published, but the share link could not be copied. Try copying it again.');
        }
      } else {
        setCopyStatus('Recipe is now linkable.');
      }

      closeDialog();
      router.refresh();
    }

    void finishPublish();
  }, [publishState, router, closeDialog]);

  async function copyShareLink() {
    if (isPrivate) {
      openDialog('copy', shareButtonRef.current);
      return;
    }

    try {
      await navigator.clipboard.writeText(`${window.location.origin}/r/${publicId}`);
      setCopyStatus('Link copied!');
    } catch {
      setCopyStatus('Unable to copy the share link.');
    }
  }

  function openDialog(mode: 'copy' | 'username', trigger: HTMLButtonElement | null) {
    setHidePublishError(true);
    setPublicUsernameInput('');
    dialogTriggerRef.current = trigger;
    setDialogMode(mode);
  }

  function handleDialogCancel(event: SyntheticEvent<HTMLDialogElement>) {
    event.preventDefault();
    if (!isPublishing) closeDialog();
  }

  const privacyLabel = isPrivate ? 'Make linkable' : 'Make private';
  const usernameError =
    publishState.status === 'error' && publishState.fieldError && !hidePublishError;

  return (
    <>
      <div className="recipe-share-copy-action">
        <button
          aria-label="Copy share link"
          className="recipe-primary-link recipe-edit-link recipe-detail-action recipe-icon-action"
          title="Copy share link"
          type="button"
          ref={shareButtonRef}
          onClick={copyShareLink}
        >
          <Share2 aria-hidden="true" size={16} strokeWidth={2} />
        </button>
        <span
          aria-live="polite"
          className="recipe-share-copy-status"
          data-status={
            copyStatus.startsWith('Unable') || copyStatus.startsWith('Published,')
              ? 'error'
              : undefined
          }
          role="status"
        >
          {copyStatus}
        </span>
      </div>
      <form
        action={setRecipePrivacy}
        className={
          isPrivate ? 'recipe-sharing-action-form' : 'recipe-sharing-action-form is-linkable'
        }
      >
        <input name="recipe_id" type="hidden" value={recipeId} />
        <input name="expected_version" type="hidden" value={version} />
        <input name="is_private" type="hidden" value={String(!isPrivate)} />
        <button
          aria-checked={!isPrivate}
          aria-label={privacyLabel}
          className="recipe-privacy-toggle"
          role="switch"
          title={privacyLabel}
          type="submit"
          ref={privacyButtonRef}
          onClick={(event) => {
            if (isPrivate && !publicUsername) {
              event.preventDefault();
              openDialog('username', privacyButtonRef.current);
            }
          }}
        >
          <span aria-hidden="true" className="recipe-privacy-toggle-state">
            <span className="recipe-privacy-toggle-state-full">
              {isPrivate ? 'Private' : 'Linkable'}
            </span>
            {!isPrivate && (
              <span className="recipe-privacy-toggle-state-compact">
                Can
                <br />
                Link
              </span>
            )}
          </span>
          <span aria-hidden="true" className="recipe-privacy-toggle-track">
            <span className="recipe-privacy-toggle-thumb" />
          </span>
        </button>
      </form>
      {dialogMode && (
        <dialog
          aria-describedby="recipe-publish-description"
          aria-labelledby="recipe-publish-title"
          className="recipe-confirmation-dialog recipe-publish-dialog"
          onCancel={handleDialogCancel}
          ref={dialogRef}
        >
          <h2 id="recipe-publish-title" ref={dialogTitleRef} tabIndex={-1}>
            {dialogMode === 'copy' ? 'Publish this recipe?' : 'Choose a public username'}
          </h2>
          <div id="recipe-publish-description">
            {dialogMode === 'copy' ? (
              <>
                <p>
                  Publishing <strong>{recipeName}</strong> lets anyone with the link read and save a
                  private copy of its public content and photos. Each saved copy keeps a source link
                  attributed to your username and this recipe’s title.
                </p>
                <p>
                  Your ratings and markers, private notes, and history stay private. Photos already
                  viewed or saved cannot be taken back.
                </p>
              </>
            ) : (
              <p>
                Choose a name to publish <strong>{recipeName}</strong>. It appears as plain-text
                attribution on recipes you publish, is not your sign-in email, and can be changed
                later in Settings.
              </p>
            )}
          </div>
          <form
            action={publishAction}
            className="recipe-publish-form"
            onSubmit={() => setHidePublishError(false)}
          >
            <input name="recipe_id" type="hidden" value={recipeId} />
            <input name="expected_version" type="hidden" value={version} />
            <input name="intent" type="hidden" value={dialogMode === 'copy' ? 'copy' : 'toggle'} />
            {!publicUsername && (
              <div className="recipe-publish-username">
                <label htmlFor="recipe-publish-username">Public username</label>
                <input
                  aria-describedby={usernameError ? 'recipe-publish-username-error' : undefined}
                  aria-invalid={usernameError || undefined}
                  autoComplete="off"
                  autoFocus
                  id="recipe-publish-username"
                  maxLength={30}
                  minLength={3}
                  name="public_username"
                  onChange={(event) => setPublicUsernameInput(event.currentTarget.value)}
                  required
                  spellCheck={false}
                  value={publicUsernameInput}
                />
                {usernameError && (
                  <p
                    aria-live="assertive"
                    className="public-username-error"
                    id="recipe-publish-username-error"
                    role="alert"
                  >
                    {publishState.status === 'error' ? publishState.message : ''}
                  </p>
                )}
              </div>
            )}
            {publishState.status === 'error' && !publishState.fieldError && !hidePublishError && (
              <p aria-live="assertive" role="alert">
                {publishState.message}
              </p>
            )}
            <div className="recipe-confirmation-actions">
              <button
                className="recipe-secondary-button"
                disabled={isPublishing}
                onClick={closeDialog}
                type="button"
              >
                Cancel
              </button>
              <button className="recipe-secondary-button" disabled={isPublishing} type="submit">
                {isPublishing
                  ? 'Publishing…'
                  : dialogMode === 'copy'
                    ? 'Publish & copy link'
                    : 'Save username & publish'}
              </button>
            </div>
          </form>
        </dialog>
      )}
    </>
  );
}
