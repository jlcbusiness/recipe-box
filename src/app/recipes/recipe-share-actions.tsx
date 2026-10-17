'use client';

import { Share2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { setRecipePrivacy } from './actions';

export function RecipeShareActions({
  isPrivate,
  publicId,
  recipeId,
  version,
}: {
  isPrivate: boolean;
  publicId: string;
  recipeId: string;
  version: number;
}) {
  const [copyStatus, setCopyStatus] = useState('');
  const shareButtonRef = useRef<HTMLButtonElement>(null);

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

  async function copyShareLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/r/${publicId}`);
      setCopyStatus('Link copied!');
    } catch {
      setCopyStatus('Unable to copy the share link.');
    }
  }

  const privacyLabel = isPrivate ? 'Make linkable' : 'Make private';

  return (
    <>
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
      <form action={setRecipePrivacy} className="recipe-sharing-action-form">
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
        >
          <span aria-hidden="true" className="recipe-privacy-toggle-state">
            {isPrivate ? 'Private' : 'Linkable'}
          </span>
          <span aria-hidden="true" className="recipe-privacy-toggle-track">
            <span className="recipe-privacy-toggle-thumb" />
          </span>
        </button>
      </form>
      <span
        aria-live="polite"
        className="recipe-share-copy-status"
        data-status={copyStatus.startsWith('Unable') ? 'error' : undefined}
        role="status"
      >
        {copyStatus}
      </span>
    </>
  );
}
