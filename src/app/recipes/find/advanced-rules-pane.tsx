'use client';

import { X } from 'lucide-react';
import { Fragment, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  type BoundQueryExpression,
  bindQueryExpression,
  type DeletedRuleReference,
  DeletedRuleReferenceError,
} from '../../../lib/query-logic';

export function renderHighlightedExpression(text: string, references: DeletedRuleReference[]) {
  let end = 0;
  const highlightedReferences = references.map((reference) => {
    const precedingText = text.slice(end, reference.start);
    end = reference.end;
    return (
      <Fragment key={reference.start}>
        {precedingText}
        <span className="recipe-advanced-rules-missing-reference">
          {text.slice(reference.start, reference.end)}
        </span>
      </Fragment>
    );
  });
  return (
    <>
      {highlightedReferences}
      {text.slice(end)}
    </>
  );
}

export function AdvancedRulesPane({
  deletedRules = [],
  expression,
  highlightDeleted,
  ruleSlots,
  rules,
  validationError,
  onAdd,
  onCancel,
}: {
  expression: string;
  highlightDeleted: boolean;
  ruleSlots: readonly (string | null)[];
  rules: { id: string; number: number; description: string }[];
  deletedRules?: { id: string; number: number }[];
  validationError: string;
  onAdd: (expression: BoundQueryExpression | null) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const [text, setText] = useState(expression);
  const [error, setError] = useState(validationError);
  const missingReferences = useMemo(() => {
    try {
      bindQueryExpression(text, ruleSlots);
      return [];
    } catch (failure) {
      if (failure instanceof DeletedRuleReferenceError) return failure.references;
      if (!(failure instanceof Error)) throw failure;
      return [];
    }
  }, [text, ruleSlots]);
  const [viewport, setViewport] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const entries = [
    ...rules.map(({ id: ruleId, number, description }) => ({
      id: ruleId,
      number,
      description,
      deleted: false,
    })),
    ...deletedRules.map(({ id: ruleId, number }) => ({
      id: ruleId,
      number,
      description: '',
      deleted: true,
    })),
  ].sort((left, right) => left.number - right.number);
  useEffect(() => setPortalRoot(document.body), []);
  useEffect(() => {
    const visualViewport = window.visualViewport;
    function updateViewport() {
      setViewport({
        left: visualViewport?.offsetLeft ?? 0,
        top: visualViewport?.offsetTop ?? 0,
        width: visualViewport?.width ?? window.innerWidth,
        height: visualViewport?.height ?? window.innerHeight,
      });
    }
    updateViewport();
    visualViewport?.addEventListener('resize', updateViewport);
    visualViewport?.addEventListener('scroll', updateViewport);
    window.addEventListener('resize', updateViewport);
    return () => {
      visualViewport?.removeEventListener('resize', updateViewport);
      visualViewport?.removeEventListener('scroll', updateViewport);
      window.removeEventListener('resize', updateViewport);
    };
  }, []);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!portalRoot || !dialog) return;
    const previousFocus = document.activeElement;
    dialog.showModal();
    inputRef.current?.focus();
    if (inputRef.current && highlightRef.current)
      highlightRef.current.scrollLeft = inputRef.current.scrollLeft;
    return () => {
      dialog.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, [portalRoot]);

  if (!portalRoot) return null;
  return createPortal(
    <dialog
      aria-labelledby={`${id}-title`}
      className="recipe-advanced-rules-pane"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onCancel();
        } else if (event.key === 'Tab') {
          if (event.shiftKey && document.activeElement === closeRef.current) {
            event.preventDefault();
            addRef.current?.focus();
          } else if (!event.shiftKey && document.activeElement === addRef.current) {
            event.preventDefault();
            closeRef.current?.focus();
          }
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          onCancel();
      }}
      ref={dialogRef}
      style={
        viewport
          ? {
              left: viewport.left + viewport.width / 2,
              top: viewport.top + viewport.height / 2,
              right: 'auto',
              bottom: 'auto',
              margin: 0,
              transform: 'translate(-50%, -50%)',
              maxWidth: Math.max(0, viewport.width - 16),
              maxHeight: Math.max(0, viewport.height - 16),
            }
          : undefined
      }
    >
      <header className="recipe-advanced-rules-header">
        <h2 className="recipe-advanced-rules-title" id={`${id}-title`}>
          Advanced Rules
        </h2>
        <button
          aria-label="Close Advanced Rules"
          className="recipe-advanced-rules-close"
          onClick={onCancel}
          ref={closeRef}
          type="button"
        >
          <X aria-hidden="true" size={20} />
        </button>
      </header>
      <ol>
        {entries.map((entry) =>
          entry.deleted ? (
            <li
              aria-describedby={`${id}-deleted-rule-${entry.id}`}
              className="recipe-advanced-rules-deleted-rule"
              key={`deleted-${entry.id}`}
              value={entry.number}
            >
              {highlightDeleted ? <mark>Rule deleted</mark> : 'Rule deleted'}
              <span className="visually-hidden" id={`${id}-deleted-rule-${entry.id}`}>
                Rule {entry.number} was deleted and is not yet applied. Update Advanced Rules if the
                expression references it.
              </span>
            </li>
          ) : (
            <li className="recipe-advanced-rules-rule" key={entry.id} value={entry.number}>
              {entry.description}
            </li>
          ),
        )}
      </ol>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          try {
            onAdd(bindQueryExpression(text, ruleSlots));
          } catch (failure) {
            if (!(failure instanceof Error)) throw failure;
            setError(failure.message);
          }
        }}
      >
        <label htmlFor={`${id}-expression`}>Logic expression</label>
        <div className="recipe-advanced-rules-expression-input">
          {missingReferences.length > 0 && (
            <div aria-hidden="true" className="recipe-advanced-rules-highlight" ref={highlightRef}>
              <span className="recipe-advanced-rules-highlight-content">
                {renderHighlightedExpression(text, missingReferences)}
              </span>
            </div>
          )}
          <input
            aria-describedby={`${id}-help${error ? ` ${id}-error` : ''}`}
            aria-invalid={Boolean(error || missingReferences.length)}
            autoComplete="off"
            className={`recipe-advanced-rules-input${missingReferences.length ? ' has-missing-reference' : ''}`}
            id={`${id}-expression`}
            maxLength={1024}
            onChange={(event) => {
              const nextText = event.currentTarget.value;
              setText(nextText);
              try {
                bindQueryExpression(nextText, ruleSlots);
                setError('');
              } catch (failure) {
                if (failure instanceof DeletedRuleReferenceError) {
                  setError(failure.message);
                } else if (failure instanceof Error) {
                  setError('');
                } else {
                  throw failure;
                }
              }
            }}
            onScroll={(event) => {
              if (highlightRef.current)
                highlightRef.current.scrollLeft = event.currentTarget.scrollLeft;
            }}
            placeholder="(1 AND 2) OR NOT 3"
            ref={inputRef}
            spellCheck={false}
            type="text"
            value={text}
          />
        </div>
        <p id={`${id}-help`}>
          Use every active rule number. Deleted rules must be removed from the expression.
          Parentheses first, then NOT, AND, OR. Aliases: &&, &, ||, |, !, -and, -or, -not.
        </p>
        {error && (
          <p className="recipe-advanced-rules-error" id={`${id}-error`} role="alert">
            {error}
          </p>
        )}
        <footer className="recipe-advanced-rules-footer">
          <button
            className="recipe-filter-clear-all"
            onClick={() => {
              setText('');
              setError('');
              inputRef.current?.focus();
            }}
            type="button"
          >
            Clear
          </button>
          <button className="recipe-filter-clear-all" onClick={onCancel} type="button">
            Cancel
          </button>
          <button className="recipe-filter-apply" ref={addRef} type="submit">
            Add
          </button>
        </footer>
      </form>
    </dialog>,
    portalRoot,
  );
}
