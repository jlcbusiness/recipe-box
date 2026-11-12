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
  useTransition,
} from 'react';
import {
  ACCOUNT_CONTENT_RESET_PHRASE,
  type AccountContentResetProvider,
} from '../../lib/account-content-reset-shared';
import { clearPrivateOfflineCaches } from '../../lib/offline/cache-client';
import {
  type AccountContentResetCleanupCheckResult,
  type AccountContentResetCompletion,
  type AccountContentResetState,
  beginGoogleAccountContentResetReauth,
  cancelAccountContentReset,
  checkAccountContentResetCleanup,
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
  const messages = ['Account records were wiped.'];
  if (!localCacheCleared) {
    messages.push('This browser’s offline copies could not be cleared.');
  }

  switch (completion.cleanupStatus) {
    case 'unknown':
      messages.push('Deletion of managed media and export archives could not be verified.');
      break;
    case 'pending': {
      const mediaCount = completion.pendingMedia ?? 0;
      const exportCount = completion.pendingExports ?? 0;
      messages.push(
        `Storage deletion remains queued for ${mediaCount} managed media ${mediaCount === 1 ? 'item' : 'items'} and ${exportCount} export ${exportCount === 1 ? 'archive' : 'archives'}.`,
      );
      break;
    }
    case 'complete':
      messages.push('Managed media and export archives have been deleted.');
      break;
  }

  return messages.join(' ');
}

function cleanupFollowupMessage(cleanupStatus: AccountContentResetCompletion['cleanupStatus']) {
  if (cleanupStatus === 'pending') {
    return 'A background job retries storage deletion daily. This is a snapshot and will not update automatically; check the status again later to confirm deletion.';
  }
  if (cleanupStatus === 'unknown') {
    return 'The cleanup status could not be verified. Check again later for an updated status; any queued deletions are retried daily.';
  }
  return null;
}

function AccountContentResetCompletionDetails({
  completedReset,
  cleanupCheck,
  isChecking,
  onCheck,
}: {
  completedReset: CompletedReset;
  cleanupCheck: AccountContentResetCleanupCheckResult | null;
  isChecking: boolean;
  onCheck: () => void;
}) {
  const followupMessage = cleanupFollowupMessage(completedReset.completion.cleanupStatus);

  return (
    <>
      <p>{completionMessage(completedReset)}</p>
      {followupMessage && <p>{followupMessage}</p>}
      {cleanupCheck && 'error' in cleanupCheck && (
        <p aria-live="assertive" className="account-content-reset-error" role="alert">
          {cleanupCheck.error}
        </p>
      )}
      {followupMessage && (
        <button
          className="recipe-secondary-button"
          disabled={isChecking}
          onClick={onCheck}
          type="button"
        >
          {isChecking ? 'Checking cleanup…' : 'Check cleanup status'}
        </button>
      )}
    </>
  );
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
  const [dialogReauthReady, setDialogReauthReady] = useState(initialReauthReady);
  const [completedReset, setCompletedReset] = useState<CompletedReset | null>(null);
  const [cleanupCheck, setCleanupCheck] = useState<AccountContentResetCleanupCheckResult | null>(
    null,
  );
  const [isCleanupCheckPending, startCleanupCheck] = useTransition();
  const initialError = resetErrorMessage(redirectError);
  const displayedReset =
    completedReset && cleanupCheck && 'status' in cleanupCheck
      ? {
          ...completedReset,
          completion: { ...completedReset.completion, ...cleanupCheck.status },
        }
      : completedReset;

  useEffect(() => {
    if (initialOpen) router.replace('/account/app-data', { scroll: false });
  }, [initialOpen, router]);

  useEffect(() => {
    if (initialReauthReady) setDialogReauthReady(true);
  }, [initialReauthReady]);

  const openDialog = () => {
    setCompletedReset(null);
    setCleanupCheck(null);
    setDialogReauthReady(false);
    setDialogKey((current) => current + 1);
    setDialogOpen(true);
  };
  const closeDialog = () => {
    setDialogReauthReady(false);
    setDialogOpen(false);
  };
  const onCompleted = useCallback((result: CompletedReset) => {
    setCleanupCheck(null);
    setCompletedReset(result);
  }, []);
  const checkCleanupStatus = () => {
    setCleanupCheck(null);
    startCleanupCheck(async () => {
      try {
        setCleanupCheck(await checkAccountContentResetCleanup());
      } catch (error) {
        console.error('Unable to request account reset cleanup status.', error);
        setCleanupCheck({
          error:
            'Storage cleanup status could not be refreshed. Your last reported status is unchanged.',
        });
      }
    });
  };

  return (
    <div className="account-content-reset-action">
      <button
        aria-haspopup="dialog"
        className="recipe-secondary-button recipe-delete-action account-content-reset-trigger"
        disabled={isCleanupCheckPending}
        onClick={openDialog}
        type="button"
      >
        <Trash2 aria-hidden="true" size={16} />
        Wipe all account data
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
      {displayedReset && !dialogOpen && (
        <div
          aria-live="polite"
          className={`account-content-reset-feedback${displayedReset.localCacheCleared && displayedReset.completion.cleanupStatus === 'complete' ? '' : ' account-content-reset-error'}`}
          role="status"
        >
          <AccountContentResetCompletionDetails
            completedReset={displayedReset}
            cleanupCheck={cleanupCheck}
            isChecking={isCleanupCheckPending}
            onCheck={checkCleanupStatus}
          />
        </div>
      )}
      {dialogOpen && (
        <AccountContentResetDialog
          key={dialogKey}
          initialReauthReady={dialogReauthReady}
          provider={provider}
          redirectError={initialError}
          cleanupCheck={cleanupCheck}
          isCleanupCheckPending={isCleanupCheckPending}
          onCheckCleanupStatus={checkCleanupStatus}
          onClose={closeDialog}
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
  cleanupCheck,
  isCleanupCheckPending,
  onCheckCleanupStatus,
  onClose,
  onCompleted,
}: {
  provider: AccountContentResetProvider;
  initialReauthReady: boolean;
  redirectError?: string;
  cleanupCheck: AccountContentResetCleanupCheckResult | null;
  isCleanupCheckPending: boolean;
  onCheckCleanupStatus: () => void;
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
  const [confirmationPhrase, setConfirmationPhrase] = useState('');
  const reauthReady = initialReauthReady || reauthState?.verified === true;
  const isFinalizing =
    Boolean(resetState?.completion) && cacheStatus !== 'cleared' && cacheStatus !== 'failed';
  const completion =
    resetState?.completion && cacheStatus === 'cleared'
      ? { completion: resetState.completion, localCacheCleared: true }
      : resetState?.completion && cacheStatus === 'failed'
        ? { completion: resetState.completion, localCacheCleared: false }
        : null;
  const displayedCompletion =
    completion && cleanupCheck && 'status' in cleanupCheck
      ? {
          ...completion,
          completion: { ...completion.completion, ...cleanupCheck.status },
        }
      : completion;

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
      <h2 id="account-content-reset-title">Wipe all account data?</h2>
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
          for removal and retried daily; the wipe remains incomplete until they are deleted. The
          completion counts are a snapshot, and you can check later whether cleanup succeeded.
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
          Account records were wiped. Clearing this browser’s offline copies…
        </p>
      ) : displayedCompletion ? (
        <div
          aria-live="polite"
          className={`account-content-reset-status${displayedCompletion.localCacheCleared && displayedCompletion.completion.cleanupStatus === 'complete' ? '' : ' account-content-reset-error'}`}
          role="status"
        >
          <AccountContentResetCompletionDetails
            completedReset={displayedCompletion}
            cleanupCheck={cleanupCheck}
            isChecking={isCleanupCheckPending}
            onCheck={onCheckCleanupStatus}
          />
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
                <p className="account-content-reset-google-instruction">
                  <strong>Re-authenticate with the same Google account to continue.</strong>
                </p>
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
                  onChange={(event) => setConfirmationPhrase(event.target.value)}
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
                    disabled={
                      isResetPending ||
                      cancelPending ||
                      confirmationPhrase !== ACCOUNT_CONTENT_RESET_PHRASE
                    }
                    type="submit"
                  >
                    {isResetPending ? 'Wiping account data…' : 'Wipe all account data'}
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
