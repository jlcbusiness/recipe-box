'use client';

import { startTransition, useEffect, useRef, useState } from 'react';
import type { ExplorerState, ExplorerStateContext } from '../lib/explorer-state';
import { saveExplorerState } from './actions/explorer-state';

export function ExplorerStatePersistence({
  context,
  state,
}: {
  context: ExplorerStateContext;
  state: ExplorerState;
}) {
  const fingerprint = JSON.stringify({ context, state });
  const previousFingerprint = useRef(fingerprint);
  const latestFingerprint = useRef(fingerprint);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (previousFingerprint.current === fingerprint) return;

    previousFingerprint.current = fingerprint;
    latestFingerprint.current = fingerprint;
    const urlState = { ...state, schema_version: 1 as const };
    delete urlState.display_preferences;
    startTransition(() => {
      void saveExplorerState(context, urlState)
        .then((result) => {
          if (latestFingerprint.current === fingerprint) {
            setError(result.error ?? null);
          }
        })
        .catch(() => {
          if (latestFingerprint.current === fingerprint) {
            setError('Explorer state could not be saved.');
          }
        });
    });
  }, [context, fingerprint, state]);

  return error ? (
    <p className="recipe-status-message" role="alert">
      {error}
    </p>
  ) : null;
}
