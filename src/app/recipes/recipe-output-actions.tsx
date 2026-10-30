'use client';

import { zipSync } from 'fflate';
import { Download, FileText, Image, Printer, SlidersHorizontal } from 'lucide-react';
import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { getRecipeOutputFilename } from '../../lib/recipes/recipe-output-rules';
import {
  ActionFeedback,
  type ActionFeedbackKind,
  useRecipeActionFeedback,
} from '../recipe-action-feedback';
import {
  createImagePdf,
  generateRecipeOutputDocument,
  type RecipeOutputFormat,
  type RecipeOutputSettings,
  renderRecipePageBlob,
} from './recipe-output-generator';

type RecipeOutputActionsProps = {
  isPublic: boolean;
  defaultSettings: RecipeOutputSettings;
  exportAction?: ReactNode;
};

type OutputFeedback = {
  autoDismiss?: boolean;
  dismissOnOutside?: boolean;
  kind: ActionFeedbackKind;
  message: string;
};

type PreparedPrintDocument = {
  cleanup: () => void;
  print: () => void;
};

const outputChoices: { format: RecipeOutputFormat; label: string; Icon: typeof Printer }[] = [
  { format: 'print', label: 'Print', Icon: Printer },
  { format: 'html', label: 'Download HTML', Icon: FileText },
  { format: 'png', label: 'Download PNG', Icon: Image },
  { format: 'pdf', label: 'Download PDF', Icon: Download },
];

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = filename;
  link.href = url;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function preparePrintHtmlDocument(
  html: string,
  signal: AbortSignal,
): Promise<PreparedPrintDocument> {
  if (signal.aborted) return Promise.reject(new DOMException('Canceled.', 'AbortError'));
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.title = 'Recipe print document';
  frame.style.cssText =
    'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none;';
  document.body.append(frame);

  return new Promise((resolve, reject) => {
    let settled = false;
    let cleaned = false;
    let printWindow: Window | null = null;
    let fallbackTimeout: number | null = null;
    const cleanup = () => {
      if (cleaned) return false;
      cleaned = true;
      if (fallbackTimeout !== null) window.clearTimeout(fallbackTimeout);
      signal.removeEventListener('abort', handleAbort);
      window.removeEventListener('afterprint', handleAfterPrint);
      printWindow?.removeEventListener('afterprint', handleAfterPrint);
      frame.remove();
      return true;
    };
    const handleAbort = () => {
      cleanup();
      if (!settled) {
        settled = true;
        reject(new DOMException('Canceled.', 'AbortError'));
      }
    };
    const handleAfterPrint = () => cleanup();
    signal.addEventListener('abort', handleAbort, { once: true });
    window.addEventListener('afterprint', handleAfterPrint);
    frame.addEventListener(
      'load',
      () => {
        if (signal.aborted) {
          handleAbort();
          return;
        }
        printWindow = frame.contentWindow;
        if (!printWindow) {
          if (cleanup()) reject(new Error('The browser could not open the print document.'));
          return;
        }
        printWindow.addEventListener('afterprint', handleAfterPrint, { once: true });
        fallbackTimeout = window.setTimeout(cleanup, 5 * 60_000);
        settled = true;
        resolve({
          cleanup,
          print: () => {
            if (cleaned || !printWindow) {
              throw new Error('The prepared print document is no longer available.');
            }
            if (fallbackTimeout !== null) window.clearTimeout(fallbackTimeout);
            fallbackTimeout = window.setTimeout(cleanup, 60_000);
            try {
              printWindow.focus();
              printWindow.print();
            } catch (error) {
              cleanup();
              throw error;
            }
          },
        });
      },
      { once: true },
    );
    frame.srcdoc = html;
  });
}

async function printHtmlDocument(html: string, signal: AbortSignal): Promise<void> {
  const prepared = await preparePrintHtmlDocument(html, signal);
  try {
    prepared.print();
  } catch (error) {
    prepared.cleanup();
    throw error;
  }
}

export function RecipeOutputActions({
  isPublic,
  defaultSettings,
  exportAction,
}: RecipeOutputActionsProps) {
  const outputMenuId = useId();
  const settingsId = useId();
  const outputButtonRef = useRef<HTMLButtonElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const recipeActionFeedback = useRecipeActionFeedback();
  const [openPanel, setOpenPanel] = useState<'output' | 'settings' | null>(null);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [settings, setSettings] = useState(defaultSettings);
  const [feedback, setFeedback] = useState<OutputFeedback | null>(null);
  const [feedbackDismissed, setFeedbackDismissed] = useState(false);
  const settingsScope = useId();

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 640px)');
    const updateMobileViewport = () => setIsMobileViewport(mediaQuery.matches);
    updateMobileViewport();
    mediaQuery.addEventListener('change', updateMobileViewport);
    return () => mediaQuery.removeEventListener('change', updateMobileViewport);
  }, []);

  useEffect(() => {
    setSettings(defaultSettings);
  }, [defaultSettings]);

  useEffect(() => {
    const main = outputButtonRef.current?.closest<HTMLElement>('main.recipes-main');
    if (!main) return;
    main.classList.toggle('no-instruction-photos', !settings.includeInstructionPhotos);
    if (isPublic) {
      main.classList.toggle('no-instruction-emphasis', !settings.useEmphasisColors);
    } else {
      main.classList.toggle('no-print-emphasis-colors', !settings.useEmphasisColors);
    }
  }, [isPublic, settings]);

  useEffect(() => {
    const abortActiveRequest = () => {
      activeRequest.current?.abort();
    };
    window.addEventListener('beforeunload', abortActiveRequest);
    window.addEventListener('pagehide', abortActiveRequest);
    return () => {
      window.removeEventListener('beforeunload', abortActiveRequest);
      window.removeEventListener('pagehide', abortActiveRequest);
      abortActiveRequest();
    };
  }, []);

  useEffect(() => {
    if (!openPanel) return;
    const firstItem = panelRef.current?.querySelector<HTMLElement>(
      openPanel === 'output' ? '[role="menuitem"]' : 'input[type="checkbox"]',
    );
    firstItem?.focus();

    function closeOnOutsidePointer(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !panelRef.current?.contains(event.target) &&
        event.target !== outputButtonRef.current &&
        event.target !== settingsButtonRef.current
      ) {
        setOpenPanel(null);
      }
    }

    function closeOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setOpenPanel(null);
      (openPanel === 'output' ? outputButtonRef : settingsButtonRef).current?.focus();
    }

    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [openPanel]);

  useEffect(() => {
    if (recipeActionFeedback || !feedback || feedbackDismissed) return;
    if (feedback.dismissOnOutside === false) return;

    function dismissFeedbackOnOutsidePointer(event: PointerEvent) {
      if (event.target instanceof Node && !feedbackRef.current?.contains(event.target)) {
        setFeedbackDismissed(true);
      }
    }

    document.addEventListener('pointerdown', dismissFeedbackOnOutsidePointer);
    return () => document.removeEventListener('pointerdown', dismissFeedbackOnOutsidePointer);
  }, [feedback, feedbackDismissed, recipeActionFeedback]);

  useEffect(() => {
    if (recipeActionFeedback) return;
    if (feedback?.kind !== 'success' && feedback?.kind !== 'cancelled') return;
    if (feedback.autoDismiss === false) return;
    const timeout = window.setTimeout(() => setFeedbackDismissed(true), 5_000);
    return () => window.clearTimeout(timeout);
  }, [feedback?.autoDismiss, feedback?.kind, recipeActionFeedback]);

  function updateFeedback(next: OutputFeedback, resetDismissed = false) {
    setFeedback(next);
    if (resetDismissed) setFeedbackDismissed(false);
    recipeActionFeedback?.publishFeedback(
      'recipe-output',
      {
        ...next,
        autoDismiss: next.autoDismiss ?? (next.kind === 'success' || next.kind === 'cancelled'),
        dismissOnOutside: next.dismissOnOutside ?? true,
        onCancel: next.kind === 'working' ? () => activeRequest.current?.abort() : undefined,
      },
      resetDismissed,
    );
  }

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Tab') {
      setOpenPanel(null);
      return;
    }

    const items = Array.from(
      panelRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [],
    ).filter((item) => !item.disabled);
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? items.length - 1
          : event.key === 'ArrowDown'
            ? (currentIndex + 1) % items.length
            : event.key === 'ArrowUp'
              ? (currentIndex - 1 + items.length) % items.length
              : -1;

    if (nextIndex >= 0 && items[nextIndex]) {
      event.preventDefault();
      items[nextIndex].focus();
    }
  }

  async function startOutput(format: RecipeOutputFormat) {
    setOpenPanel(null);
    outputButtonRef.current?.focus();
    const main = outputButtonRef.current?.closest<HTMLElement>('main.recipes-main');
    if (!main) {
      updateFeedback(
        { kind: 'error', message: 'The recipe content is unavailable for output.' },
        true,
      );
      return;
    }

    const controller = new AbortController();
    activeRequest.current = controller;
    updateFeedback({ kind: 'working', message: 'Preparing recipe pages...' }, true);
    try {
      const rendered = await generateRecipeOutputDocument(
        main,
        settings,
        format,
        controller.signal,
        (message) => updateFeedback({ kind: 'working', message }),
      );
      if (format === 'print') {
        updateFeedback({ kind: 'working', message: 'Opening print document...' });
        await printHtmlDocument(rendered.printHtml, controller.signal);
        if (!controller.signal.aborted) {
          updateFeedback({ kind: 'success', message: 'Print request sent.' });
        }
        return;
      }

      let blob: Blob;
      if (rendered.format === 'html') {
        blob = new Blob([rendered.html], { type: 'text/html;charset=utf-8' });
      } else if (format === 'png') {
        const pngPages: Blob[] = [];
        for (const [index, page] of rendered.pages.entries()) {
          if (controller.signal.aborted) throw new DOMException('Canceled.', 'AbortError');
          updateFeedback({
            kind: 'working',
            message: `Rendering PNG page ${index + 1} of ${rendered.pages.length}...`,
          });
          pngPages.push(await renderRecipePageBlob(page, 'image/png', controller.signal));
        }
        if (pngPages.length === 1) {
          blob = pngPages[0] as Blob;
        } else {
          const files: Record<string, Uint8Array> = {};
          for (const [index, page] of pngPages.entries()) {
            files[`page-${String(index + 1).padStart(2, '0')}.png`] = new Uint8Array(
              await page.arrayBuffer(),
            );
          }
          blob = new Blob([zipSync(files)], { type: 'application/zip' });
        }
      } else {
        const jpegPages: Blob[] = [];
        for (const [index, page] of rendered.pages.entries()) {
          if (controller.signal.aborted) throw new DOMException('Canceled.', 'AbortError');
          updateFeedback({
            kind: 'working',
            message: `Rendering PDF page ${index + 1} of ${rendered.pages.length}...`,
          });
          jpegPages.push(await renderRecipePageBlob(page, 'image/jpeg', controller.signal));
        }
        blob = await createImagePdf(jpegPages);
      }

      if (controller.signal.aborted) throw new DOMException('Canceled.', 'AbortError');
      downloadBlob(blob, getRecipeOutputFilename(rendered.title, format, rendered.pages.length));
      updateFeedback({
        kind: 'success',
        message: `${format.toUpperCase()} download started.`,
      });
    } catch (error) {
      if (!controller.signal.aborted && !isAbortError(error)) {
        updateFeedback(
          {
            kind: 'error',
            message:
              error instanceof Error ? error.message : 'The recipe output could not be generated.',
          },
          true,
        );
      } else {
        updateFeedback({ kind: 'cancelled', message: 'Output generation canceled.' });
      }
    } finally {
      if (activeRequest.current === controller) activeRequest.current = null;
    }
  }

  function updateSetting(key: keyof RecipeOutputSettings, value: boolean) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  return (
    <>
      <div className="recipe-output-action recipe-output-menu-action">
        <button
          aria-controls={openPanel === 'output' ? outputMenuId : undefined}
          aria-expanded={openPanel === 'output'}
          aria-haspopup="menu"
          aria-label={isMobileViewport ? 'Download' : 'Print & Download'}
          aria-busy={feedback?.kind === 'working'}
          aria-describedby={
            feedback && recipeActionFeedback
              ? recipeActionFeedback.feedbackIds['recipe-output']
              : undefined
          }
          className="recipe-secondary-button recipe-detail-action recipe-icon-action recipe-output-trigger"
          disabled={feedback?.kind === 'working'}
          onClick={() => setOpenPanel((current) => (current === 'output' ? null : 'output'))}
          ref={outputButtonRef}
          title={isMobileViewport ? 'Download' : 'Print & Download'}
          type="button"
        >
          {isMobileViewport ? (
            <Download aria-hidden="true" size={16} strokeWidth={2} />
          ) : (
            <Printer aria-hidden="true" size={16} strokeWidth={2} />
          )}
        </button>
        {openPanel === 'output' && (
          <div
            aria-label="Print and download actions"
            className="recipe-output-menu"
            id={outputMenuId}
            onKeyDown={handleMenuKeyDown}
            ref={panelRef}
            role="menu"
          >
            {outputChoices.map(({ format, label, Icon }) => (
              <button
                key={format}
                onClick={() => void startOutput(format)}
                role="menuitem"
                type="button"
              >
                <Icon aria-hidden="true" size={16} />
                {label}
              </button>
            ))}
          </div>
        )}
        {feedback && !recipeActionFeedback && (
          <ActionFeedback
            action={
              feedback.kind === 'working' ? (
                <button
                  className="recipe-output-cancel"
                  onClick={() => activeRequest.current?.abort()}
                  type="button"
                >
                  Cancel
                </button>
              ) : undefined
            }
            className="export-action-feedback recipe-output-feedback"
            containerRef={feedbackRef}
            kind={feedback.kind}
            message={feedback.message}
            messageClassName={`export-action-feedback-${feedback.kind} recipe-output-feedback-${feedback.kind}`}
            visuallyHidden={feedbackDismissed}
          />
        )}
      </div>
      {exportAction}
      <div className="recipe-output-action recipe-output-settings-action">
        <button
          aria-controls={openPanel === 'settings' ? settingsId : undefined}
          aria-expanded={openPanel === 'settings'}
          aria-haspopup="dialog"
          aria-label="Page settings"
          className="recipe-secondary-button recipe-detail-action recipe-icon-action recipe-output-settings-trigger"
          onClick={() => setOpenPanel((current) => (current === 'settings' ? null : 'settings'))}
          ref={settingsButtonRef}
          title="Page settings"
          type="button"
        >
          <SlidersHorizontal aria-hidden="true" size={16} strokeWidth={2} />
        </button>
        {openPanel === 'settings' && (
          <div
            aria-label="Page settings"
            className="recipe-page-settings-panel"
            id={settingsId}
            ref={panelRef}
            role="dialog"
          >
            {(
              [
                ['repeatIngredients', 'Repeat ingredients on each page'],
                ['includeInstructionPhotos', 'Include instruction photos'],
                ['useEmphasisColors', 'Use emphasis colors'],
                ...(!isPublic
                  ? ([['includePrivateDetails', 'Include private-only details']] as const)
                  : []),
              ] as const
            ).map(([key, label]) => {
              const checkboxId = `${settingsScope}-${key}`;
              return (
                <label key={key} htmlFor={checkboxId}>
                  <input
                    checked={settings[key]}
                    id={checkboxId}
                    onChange={(event) => updateSetting(key, event.currentTarget.checked)}
                    type="checkbox"
                  />
                  {label}
                </label>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
