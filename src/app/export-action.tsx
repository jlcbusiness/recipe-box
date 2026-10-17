'use client';

import { Download } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { type RefObject, useEffect, useRef, useState } from 'react';
import type { ExportScope } from '../lib/exports/rules';

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
  kind: 'working' | 'success' | 'error';
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
  const label = scopeLabel(scope);
  const buttonId = `export-${scope.type}-${'id' in scope ? scope.id : 'database'}`;

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
    setFeedback({ kind: 'working', message: `Preparing ${label} export...` });
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
      setFeedback({
        kind: 'success',
        message: `${label[0].toUpperCase()}${label.slice(1)} export ready. Download started.`,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      setFeedback({
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
        aria-describedby={feedback ? `${buttonId}-feedback` : undefined}
        className={`${buttonClassName} export-action-button`}
        disabled={feedback?.kind === 'working'}
        onClick={startExport}
        ref={triggerRef}
        tabIndex={triggerHidden ? -1 : undefined}
        type="button"
      >
        <Download aria-hidden="true" size={16} />
        <span className="export-action-label">{buttonLabel}</span>
      </button>
      {feedback && (
        <p
          aria-live={feedback.kind === 'error' ? 'assertive' : 'polite'}
          className={`export-action-feedback export-action-feedback-${feedback.kind}`}
          id={`${buttonId}-feedback`}
          role={feedback.kind === 'error' ? 'alert' : 'status'}
        >
          {feedback.message}
        </p>
      )}
    </div>
  );
}
