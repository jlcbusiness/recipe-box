'use client';

import { usePathname } from 'next/navigation';
import { type RefObject, useEffect, useRef, useState } from 'react';
import type { ExportScope } from '../lib/exports/rules';
import {
  ActionFeedback,
  type ActionFeedbackKind,
  useRecipeActionFeedback,
} from './recipe-action-feedback';

type ExportActionProps = {
  scope: ExportScope;
  buttonLabel: string;
  buttonClassName?: string;
  ariaLabel?: string;
  className?: string;
  triggerRef?: RefObject<HTMLButtonElement | null>;
  triggerHidden?: boolean;
};

type Feedback = {
  kind: ActionFeedbackKind;
  message: string;
};

function scopeLabel(scope: ExportScope) {
  return scope.type === 'database' ? 'database' : scope.type;
}

export function ExportAction({
  scope,
  buttonLabel,
  buttonClassName = 'recipe-secondary-button',
  ariaLabel,
  className = '',
  triggerRef,
  triggerHidden = false,
}: ExportActionProps) {
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const pathname = usePathname();
  const previousPathname = useRef(pathname);
  const recipeActionFeedback = useRecipeActionFeedback();
  const label = scopeLabel(scope);
  const buttonId = `export-${scope.type}-${'id' in scope ? scope.id : 'database'}`;

  function updateFeedback(next: Feedback, resetDismissed = false) {
    setFeedback(next);
    recipeActionFeedback?.publishFeedback(
      'recipe-export',
      { ...next, autoDismiss: false, dismissOnOutside: false },
      resetDismissed,
    );
  }

  useEffect(() => {
    if (previousPathname.current !== pathname) {
      activeRequest.current?.abort();
      previousPathname.current = pathname;
    }
  }, [pathname]);

  useEffect(() => {
    const abortRequest = () => activeRequest.current?.abort();
    window.addEventListener('beforeunload', abortRequest);
    window.addEventListener('pagehide', abortRequest);
    return () => {
      window.removeEventListener('beforeunload', abortRequest);
      window.removeEventListener('pagehide', abortRequest);
      abortRequest();
    };
  }, []);

  async function startExport() {
    const controller = new AbortController();
    activeRequest.current = controller;
    updateFeedback({ kind: 'working', message: `Preparing ${label} export...` }, true);
    try {
      const response = await fetch('/api/exports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope }),
        signal: controller.signal,
      });
      const result = (await response.json().catch(() => null)) as {
        error?: string;
        downloadUrl?: string;
      } | null;

      if (!response.ok || !result?.downloadUrl) {
        throw new Error(result?.error || 'Unable to prepare the export. Please try again.');
      }

      const download = document.createElement('a');
      download.href = result.downloadUrl;
      download.rel = 'noreferrer';
      download.hidden = true;
      document.body.append(download);
      download.click();
      download.remove();
      updateFeedback({
        kind: 'success',
        message: `${label[0].toUpperCase()}${label.slice(1)} export ready. Download started.`,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      updateFeedback({
        kind: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Unable to prepare the export. Please try again.',
      });
    } finally {
      if (activeRequest.current === controller) {
        activeRequest.current = null;
      }
    }
  }

  return (
    <div className={`export-action ${className}`.trim()}>
      <button
        aria-label={ariaLabel}
        aria-hidden={triggerHidden || undefined}
        aria-busy={feedback?.kind === 'working'}
        aria-describedby={
          feedback
            ? (recipeActionFeedback?.feedbackIds['recipe-export'] ?? `${buttonId}-feedback`)
            : undefined
        }
        className={`${buttonClassName} export-action-button`}
        disabled={feedback?.kind === 'working'}
        onClick={startExport}
        ref={triggerRef}
        tabIndex={triggerHidden ? -1 : undefined}
        type="button"
      >
        <span aria-hidden="true" className="export-action-icon" />
        <span className="export-action-label">{buttonLabel}</span>
      </button>
      {feedback && !recipeActionFeedback && (
        <ActionFeedback
          className="export-action-feedback"
          id={`${buttonId}-feedback`}
          kind={feedback.kind}
          message={feedback.message}
          messageClassName={`export-action-feedback-${feedback.kind}`}
        />
      )}
    </div>
  );
}
