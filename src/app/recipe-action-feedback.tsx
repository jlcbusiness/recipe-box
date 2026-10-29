'use client';

import {
  createContext,
  type ReactNode,
  type Ref,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';

export type ActionFeedbackKind = 'working' | 'success' | 'cancelled' | 'error';
export type ActionFeedbackSource = 'recipe-export' | 'recipe-output';

type ActionFeedbackProps = {
  action?: ReactNode;
  className: string;
  containerRef?: Ref<HTMLDivElement>;
  id?: string;
  kind: ActionFeedbackKind;
  message: string;
  messageClassName: string;
  visuallyHidden?: boolean;
};

type RecipeActionNotice = {
  autoDismiss: boolean;
  dismissOnOutside: boolean;
  kind: ActionFeedbackKind;
  message: string;
  onCancel?: () => void;
};

type RecipeActionFeedbackContextValue = {
  feedbackIds: Record<ActionFeedbackSource, string>;
  publishFeedback: (
    source: ActionFeedbackSource,
    notice: RecipeActionNotice,
    resetDismissed?: boolean,
  ) => void;
};

type FeedbackEntry = {
  dismissed: boolean;
  notice: RecipeActionNotice;
};

type FeedbackEntries = Partial<Record<ActionFeedbackSource, FeedbackEntry>>;

const feedbackSources: ActionFeedbackSource[] = ['recipe-output', 'recipe-export'];
const RecipeActionFeedbackContext = createContext<RecipeActionFeedbackContextValue | null>(null);

export function ActionFeedback({
  action,
  className,
  containerRef,
  id,
  kind,
  message,
  messageClassName,
  visuallyHidden = false,
}: ActionFeedbackProps) {
  const role = kind === 'error' ? 'alert' : 'status';
  const ariaLive = kind === 'error' ? 'assertive' : 'polite';

  if (visuallyHidden) {
    return (
      <p aria-live={ariaLive} className={`visually-hidden ${messageClassName}`} id={id} role={role}>
        {message}
      </p>
    );
  }

  return (
    <div className={className} ref={containerRef}>
      <p aria-live={ariaLive} className={messageClassName} id={id} role={role}>
        {message}
      </p>
      {action}
    </div>
  );
}

export function RecipeActionFeedbackProvider({ children }: { children: ReactNode }) {
  const generatedId = useId();
  const feedbackIds = useMemo(
    () => ({
      'recipe-export': `recipe-action-feedback-${generatedId}-export`,
      'recipe-output': `recipe-action-feedback-${generatedId}-output`,
    }),
    [generatedId],
  );
  const [feedbackEntries, setFeedbackEntries] = useState<FeedbackEntries>({});
  const feedbackRef = useRef<HTMLDivElement>(null);

  const publishFeedback = useCallback(
    (source: ActionFeedbackSource, notice: RecipeActionNotice, resetDismissed = false) => {
      setFeedbackEntries((current) => {
        const next = { ...current };
        if (resetDismissed) {
          for (const otherSource of feedbackSources) {
            if (otherSource !== source && next[otherSource]?.notice.kind !== 'working') {
              delete next[otherSource];
            }
          }
        }
        next[source] = {
          dismissed: resetDismissed ? false : (current[source]?.dismissed ?? false),
          notice,
        };
        return next;
      });
    },
    [],
  );
  const contextValue = useMemo(
    () => ({ feedbackIds, publishFeedback }),
    [feedbackIds, publishFeedback],
  );

  const dismissOnOutside = feedbackSources.some(
    (source) =>
      feedbackEntries[source]?.notice.dismissOnOutside && !feedbackEntries[source]?.dismissed,
  );

  useEffect(() => {
    if (!dismissOnOutside) return;
    function dismissFeedbackOnOutsidePointer(event: PointerEvent) {
      if (event.target instanceof Node && !feedbackRef.current?.contains(event.target)) {
        setFeedbackEntries((current) => {
          const next = { ...current };
          for (const source of feedbackSources) {
            const entry = next[source];
            if (entry?.notice.dismissOnOutside) {
              next[source] = { ...entry, dismissed: true };
            }
          }
          return next;
        });
      }
    }

    document.addEventListener('pointerdown', dismissFeedbackOnOutsidePointer);
    return () => document.removeEventListener('pointerdown', dismissFeedbackOnOutsidePointer);
  }, [dismissOnOutside]);

  const outputEntry = feedbackEntries['recipe-output'];
  const outputNotice = outputEntry?.notice;
  useEffect(() => {
    if (
      !outputNotice?.autoDismiss ||
      outputEntry?.dismissed ||
      (outputNotice.kind !== 'success' && outputNotice.kind !== 'cancelled')
    ) {
      return;
    }
    const timeout = window.setTimeout(() => {
      setFeedbackEntries((current) => {
        const currentEntry = current['recipe-output'];
        if (!currentEntry || currentEntry.notice !== outputNotice) return current;
        return {
          ...current,
          'recipe-output': { ...currentEntry, dismissed: true },
        };
      });
    }, 5_000);
    return () => window.clearTimeout(timeout);
  }, [outputEntry?.dismissed, outputNotice]);

  const visibleEntries = feedbackSources.flatMap((source) => {
    const entry = feedbackEntries[source];
    return entry && !entry.dismissed ? [{ source, ...entry }] : [];
  });
  const dismissedEntries = feedbackSources.flatMap((source) => {
    const entry = feedbackEntries[source];
    return entry?.dismissed ? [{ source, ...entry }] : [];
  });

  return (
    <RecipeActionFeedbackContext.Provider value={contextValue}>
      {children}
      {visibleEntries.length > 0 && (
        <div
          className="export-action-feedback recipe-output-feedback recipe-action-feedback-region"
          ref={feedbackRef}
        >
          {visibleEntries.map(({ source, notice }) => (
            <ActionFeedback
              action={
                notice.kind === 'working' && notice.onCancel ? (
                  <button className="recipe-output-cancel" onClick={notice.onCancel} type="button">
                    Cancel
                  </button>
                ) : undefined
              }
              className="recipe-action-feedback-entry"
              id={feedbackIds[source]}
              key={source}
              kind={notice.kind}
              message={notice.message}
              messageClassName={`export-action-feedback-${notice.kind} ${
                source === 'recipe-output' ? `recipe-output-feedback-${notice.kind}` : ''
              }`}
            />
          ))}
        </div>
      )}
      {dismissedEntries.map(({ source, notice }) => (
        <ActionFeedback
          className=""
          id={feedbackIds[source]}
          key={source}
          kind={notice.kind}
          message={notice.message}
          messageClassName={`export-action-feedback-${notice.kind} ${
            source === 'recipe-output' ? `recipe-output-feedback-${notice.kind}` : ''
          }`}
          visuallyHidden
        />
      ))}
    </RecipeActionFeedbackContext.Provider>
  );
}

export function useRecipeActionFeedback() {
  return useContext(RecipeActionFeedbackContext);
}
