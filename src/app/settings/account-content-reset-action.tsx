'use client';

import { Trash2 } from 'lucide-react';
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
  ACCOUNT_CONTENT_RESET_PHRASE,
  type AccountContentResetProvider,
} from '../../lib/account-content-reset-shared';
import { clearPrivateOfflineCaches } from '../../lib/offline/cache-client';
import {
  type AccountContentResetCompletion,
  type AccountContentResetState,
  beginGoogleAccountContentResetReauth,
  cancelAccountContentReset,
  reauthenticateForAccountContentReset,
  resetAccountContent,
} from './account-content-reset-actions';

type CompletedReset = {
  completion: AccountContentResetCompletion;
  localCacheCleared: boolean;
};

type AccountContentResetActionProps = {
  provider: AccountContentResetProvider;
  initialReauthReady: boolean;
  initialOpen: boolean;
  redirectError?: string;
};

function completionMessage({ completion, localCacheCleared }: CompletedReset): string {
  if (!localCacheCleared) {
    return 'Account records were reset, but this browser’s offline copies could not be cleared. The reset is not fully complete.';
  }
  if (completion.cleanupStatus === 'unknown') {
    return 'Account records were reset, but managed media and export cleanup could not be verified. The reset is not fully complete.';
  }
  if (completion.cleanupStatus === 'pending') {
    return `Account records were reset, but storage cleanup is still pending (${completion.pendingMedia ?? 0} media item(s), ${completion.pendingExports ?? 0} export archive(s)). The reset is not fully complete.`;
  }
  return 'Account content reset is complete.';
}

function resetErrorMessage(error: string | undefined): string | undefined {
  switch (error) {
    case 'google':
      return 'Google re-authentication could not be verified for this account. Try again with the same Google account.';
    case 'provider':
      return 'This account does not use Google sign-in.';
    case 'unavailable':
      return 'Google re-authentication is unavailable right now. Try again shortly.';
    default:
      return undefined;
  }
}

export function AccountContentResetAction({
  provider,
  initialReauthReady,
  initialOpen,
  redirectError,
}: AccountContentResetActionProps) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(initialOpen);
  const [dialogKey, setDialogKey] = useState(0);
  const [completedReset, setCompletedReset] = useState<CompletedReset | null>(null);
  const initialError = resetErrorMessage(redirectError);

  useEffect(() => {
    if (initialOpen) router.replace('/settings', { scroll: false });
  }, [initialOpen, router]);

  const openDialog = () => {
    setCompletedReset(null);
    setDialogKey((current) => current + 1);
    setDialogOpen(true);
  };
  const onCompleted = useCallback((result: CompletedReset) => {
    setCompletedReset(result);
  }, []);

  return (
    <div className="account-content-reset-action">
      <button
        aria-haspopup="dialog"
        className="recipe-secondary-button recipe-delete-action account-content-reset-trigger"
        onClick={openDialog}
        type="button"
      >
        <Trash2 aria-hidden="true" size={16} />
        Reset account content
      </button>
      {initialError && !dialogOpen && (
        <p
          aria-live="assertive"
          className="account-content-reset-feedback account-content-reset-error"
          role="alert"
        >
          {initialError}
        </p>
      )}
      {completedReset && (
        <p
          aria-live="polite"
          className={`account-content-reset-feedback${completedReset.localCacheCleared && completedReset.completion.cleanupStatus === 'complete' ? '' : ' account-content-reset-error'}`}
          role="status"
        >
          {completionMessage(completedReset)}
        </p>
      )}
      {dialogOpen && (
        <AccountContentResetDialog
          key={dialogKey}
          initialReauthReady={initialReauthReady}
          provider={provider}
          redirectError={initialError}
          onClose={() => setDialogOpen(false)}
          onCompleted={onCompleted}
        />
      )}
    </div>
  );
}

function AccountContentResetDialog({
  provider,
  initialReauthReady,
  redirectError,
  onClose,
  onCompleted,
}: {
  provider: AccountContentResetProvider;
  initialReauthReady: boolean;
  redirectError?: string;
  onClose: () => void;
  onCompleted: (result: CompletedReset) => void;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [reauthState, reauthenticateAction, isReauthPending] = useActionState(
    reauthenticateForAccountContentReset,
    undefined,
  );
  const [resetState, resetAction, isResetPending] = useActionState(
    resetAccountContent,
    undefined as AccountContentResetState | undefined,
  );
  const [cacheStatus, setCacheStatus] = useState<'idle' | 'clearing' | 'cleared' | 'failed'>(
    'idle',
  );
  const [cacheClearAttempt, setCacheClearAttempt] = useState(0);
  const cacheClearAttemptRef = useRef(-1);
  const [cacheError, setCacheError] = useState('');
  const [cancelError, setCancelError] = useState('');
  const [cancelPending, setCancelPending] = useState(false);
  const reauthReady = initialReauthReady || reauthState?.verified === true;
  const isFinalizing =
    Boolean(resetState?.completion) && cacheStatus !== 'cleared' && cacheStatus !== 'failed';
  const completion =
    resetState?.completion && cacheStatus === 'cleared'
      ? { completion: resetState.completion, localCacheCleared: true }
      : resetState?.completion && cacheStatus === 'failed'
        ? { completion: resetState.completion, localCacheCleared: false }
        : null;

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  useEffect(() => {
    if (!resetState?.completion || cacheClearAttemptRef.current === cacheClearAttempt) return;

    cacheClearAttemptRef.current = cacheClearAttempt;
    const resetCompletion = resetState.completion;
    let active = true;
    setCacheStatus('clearing');
    void clearPrivateOfflineCaches()
      .then(() => {
        if (!active) return;
        setCacheStatus('cleared');
        onCompleted({ completion: resetCompletion, localCacheCleared: true });
        router.refresh();
      })
      .catch((error: unknown) => {
        console.error('Unable to clear this browser’s account reset cache.', error);
        if (!active) return;
        setCacheError('This browser’s saved offline copies could not be cleared.');
        setCacheStatus('failed');
        onCompleted({ completion: resetCompletion, localCacheCleared: false });
        router.refresh();
      });

    return () => {
      active = false;
    };
  }, [cacheClearAttempt, onCompleted, resetState?.completion, router]);

  const cancelDialog = async () => {
    if (isFinalizing || isReauthPending || isResetPending || cancelPending) return;

    setCancelPending(true);
    try {
      const result = await cancelAccountContentReset();
      if (result.error) {
        setCancelError(result.error);
        return;
      }
      dialogRef.current?.close();
      onClose();
    } catch {
      setCancelError('The reset confirmation could not be canceled. It will expire shortly.');
    } finally {
      setCancelPending(false);
    }
  };

  const handleCancel = (event: SyntheticEvent<HTMLDialogElement>) => {
    event.preventDefault();
    cancelDialog();
  };

  return (
    <dialog
      aria-describedby="account-content-reset-description"
      aria-labelledby="account-content-reset-title"
      className="recipe-confirmation-dialog account-content-reset-dialog"
      onCancel={handleCancel}
      ref={dialogRef}
    >
      <h2 id="account-content-reset-title">Reset all account content?</h2>
      <div className="account-content-reset-copy" id="account-content-reset-description">
        <p>This permanently removes:</p>
        <ul>
          <li>Active and trashed recipes, publications, and their history.</li>
          <li>Tags, ingredients, nutrition data, custom picklists, and explorer state.</li>
          <li>Personal preferences, managed recipe and publication media, and export archives.</li>
          <li>Public recipe links. Existing downloaded files cannot be revoked.</li>
        </ul>
        <p>
          Your sign-in identity, account, and admin/owner access remain. The empty Recipe Tin and
          shipped picklist defaults are restored.
        </p>
        <p>
          Public recipe links are revoked in the reset. Managed media and export archives are queued
          for removal; cleanup may take time, and the reset remains incomplete until it succeeds.
        </p>
        <p>
          A disconnected device may keep its saved offline copies until it reconnects to Recipe Box.
          Previously downloaded exports cannot be removed from a device.
        </p>
      </div>

      {redirectError && (
        <p aria-live="assertive" className="account-content-reset-error" role="alert">
          {redirectError}
        </p>
      )}

      {resetState?.completion && isFinalizing ? (
        <p aria-live="polite" className="account-content-reset-status" role="status">
          Account records were reset. Clearing this browser’s offline copies…
        </p>
      ) : completion ? (
        <div
          aria-live="polite"
          className={`account-content-reset-status${completion.localCacheCleared && completion.completion.cleanupStatus === 'complete' ? '' : ' account-content-reset-error'}`}
          role="status"
        >
          <p>{completionMessage(completion)}</p>
          {cacheError && (
            <button
              className="recipe-secondary-button"
              onClick={() => {
                setCacheError('');
                setCacheStatus('idle');
                setCacheClearAttempt((attempt) => attempt + 1);
              }}
              type="button"
            >
              Retry clearing offline copies
            </button>
          )}
          <div className="recipe-confirmation-actions">
            <button
              disabled={isFinalizing || cancelPending}
              className="recipe-secondary-button"
              onClick={cancelDialog}
              type="button"
            >
              Close
            </button>
          </div>
        </div>
      ) : (
        <>
          {!reauthReady &&
            (provider === 'email_password' ? (
              <form action={reauthenticateAction} className="account-content-reset-form">
                <label htmlFor="account-content-reset-password">Current password</label>
                <input
                  autoComplete="current-password"
                  id="account-content-reset-password"
                  name="current_password"
                  required
                  type="password"
                />
                {reauthState?.error && (
                  <p aria-live="assertive" className="account-content-reset-error" role="alert">
                    {reauthState.error}
                  </p>
                )}
                <div className="recipe-confirmation-actions">
                  <button
                    className="recipe-secondary-button"
                    disabled={isReauthPending || cancelPending || isFinalizing}
                    onClick={cancelDialog}
                    type="button"
                  >
                    Cancel
                  </button>
                  <button
                    className="recipe-secondary-button"
                    disabled={isReauthPending || cancelPending || isFinalizing}
                    type="submit"
                  >
                    {isReauthPending ? 'Checking password…' : 'Verify password'}
                  </button>
                </div>
              </form>
            ) : (
              <form action={beginGoogleAccountContentResetReauth}>
                <p>Re-authenticate with the same Google account to continue.</p>
                <div className="recipe-confirmation-actions">
                  <button
                    className="recipe-secondary-button"
                    disabled={cancelPending || isFinalizing}
                    onClick={cancelDialog}
                    type="button"
                  >
                    Cancel
                  </button>
                  <button
                    className="recipe-secondary-button"
                    disabled={cancelPending || isFinalizing}
                    type="submit"
                  >
                    Continue with Google
                  </button>
                </div>
              </form>
            ))}

          {reauthReady && (
            <>
              <p className="account-content-reset-verified" role="status">
                Your account has been re-authenticated. This confirmation expires shortly.
              </p>
              <form action={resetAction} className="account-content-reset-form">
                <label htmlFor="account-content-reset-phrase">
                  Type <strong>{ACCOUNT_CONTENT_RESET_PHRASE}</strong> to confirm
                </label>
                <input
                  autoComplete="off"
                  id="account-content-reset-phrase"
                  name="confirmation_phrase"
                  required
                  spellCheck={false}
                  type="text"
                />
                {resetState?.error && (
                  <p aria-live="assertive" className="account-content-reset-error" role="alert">
                    {resetState.error}
                  </p>
                )}
                <div className="recipe-confirmation-actions">
                  <button
                    className="recipe-secondary-button"
                    disabled={isResetPending || cancelPending}
                    onClick={cancelDialog}
                    type="button"
                  >
                    Cancel
                  </button>
                  <button
                    className="recipe-secondary-button recipe-delete-action"
                    disabled={isResetPending || cancelPending}
                    type="submit"
                  >
                    {isResetPending ? 'Resetting content…' : 'Reset all content'}
                  </button>
                </div>
              </form>
            </>
          )}
        </>
      )}

      {cancelError && (
        <p aria-live="assertive" className="account-content-reset-error" role="alert">
          {cancelError}
        </p>
      )}
    </dialog>
  );
}
