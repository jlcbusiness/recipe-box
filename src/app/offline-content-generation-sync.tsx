'use client';

import { useEffect, useState } from 'react';
import { reconcilePrivateOfflineCacheGeneration } from '../lib/offline/cache-client';

export function OfflineContentGenerationSync({ generation }: { generation: string }) {
  const [failed, setFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    let active = true;
    void reconcilePrivateOfflineCacheGeneration(generation).then(
      () => {
        if (active) setFailed(false);
      },
      (error: unknown) => {
        if (!active) return;
        console.error('Unable to reconcile saved offline recipes with the account content.', error);
        setFailed(true);
      },
    );
    return () => {
      active = false;
    };
  }, [generation]);

  if (!failed) return null;

  const retryCleanup = async () => {
    setRetrying(true);
    try {
      await reconcilePrivateOfflineCacheGeneration(generation);
      setFailed(false);
    } catch (error) {
      console.error('Unable to reconcile saved offline recipes with the account content.', error);
    } finally {
      setRetrying(false);
    }
  };

  return (
    <p aria-live="assertive" className="offline-content-generation-warning" role="alert">
      Saved offline recipes could not be checked against this account. Older copies may remain on
      this device.
      <button
        className="recipe-secondary-button"
        disabled={retrying}
        onClick={retryCleanup}
        type="button"
      >
        {retrying ? 'Retrying…' : 'Retry offline cleanup'}
      </button>
    </p>
  );
}
