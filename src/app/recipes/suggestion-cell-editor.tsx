'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { normalizePicklistMatchText } from '../../lib/recipes/picklist-rules';

function uniqueOptions(values: string[]): string[] {
  const seen = new Set<string>();
  return values
    .map((value) => value.trim())
    .filter((value) => {
      const key = value.toLocaleLowerCase();
      if (!value || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
}

export function SuggestionCellEditor({
  label,
  value,
  options,
  initialCharacter,
  onCommit,
  onSelectSuggestion,
  onEnterCommit,
  onCancel,
  onDraftChange,
  onTabCommit,
  describedBy,
  invalid = false,
  placement = 'above',
  focusOnMount = true,
  openOnFocus = true,
  selectOnFocus = false,
  fitContent = false,
  fitToValue = false,
  syncValue = false,
  resetOnCancel = false,
  allowTabToSelectAdd = true,
  className,
  errorMessage,
  isPending = false,
}: {
  label: string;
  value: string;
  options: string[];
  initialCharacter?: string;
  onCommit: (value: string) => void;
  onSelectSuggestion?: (value: string) => void;
  onEnterCommit?: (value: string) => void;
  onCancel: () => void;
  onDraftChange?: (value: string) => void;
  onTabCommit?: () => void;
  describedBy?: string;
  invalid?: boolean;
  placement?: 'above' | 'below';
  focusOnMount?: boolean;
  openOnFocus?: boolean;
  selectOnFocus?: boolean;
  fitContent?: boolean;
  fitToValue?: boolean;
  syncValue?: boolean;
  resetOnCancel?: boolean;
  allowTabToSelectAdd?: boolean;
  className?: string;
  errorMessage?: string;
  isPending?: boolean;
}) {
  const [draft, setDraft] = useState(initialCharacter ?? value);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isOpen, setIsOpen] = useState(Boolean(initialCharacter));
  const [hasTyped, setHasTyped] = useState(Boolean(initialCharacter));
  const [hasNavigated, setHasNavigated] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{
    left: number;
    top: number;
    width: number;
    maxHeight: number;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const initialFocusPending = useRef(Boolean(initialCharacter));
  const skipBlurCommit = useRef(false);
  const listId = useId();
  const errorId = `${listId}-error`;
  const normalizedOptions = uniqueOptions(options);
  const normalizedDraft = normalizePicklistMatchText(draft);
  const matchingOptions = normalizedOptions.filter((option) =>
    normalizePicklistMatchText(option).includes(normalizedDraft),
  );
  const isExactMatch = normalizedOptions.some(
    (option) => normalizePicklistMatchText(option) === normalizedDraft,
  );
  const suggestions = hasTyped
    ? [...matchingOptions, ...(draft.trim() && !isExactMatch ? [`Add "${draft.trim()}"`] : [])]
    : normalizedOptions;
  const inputDescribedBy = [describedBy, errorMessage ? errorId : null].filter(Boolean).join(' ');

  useEffect(() => {
    if (focusOnMount) {
      inputRef.current?.focus();
      if (!initialCharacter) {
        inputRef.current?.select();
      }
    }
  }, [focusOnMount, initialCharacter]);

  useEffect(() => {
    if (syncValue) {
      setDraft(value);
    }
  }, [syncValue, value]);

  useLayoutEffect(() => {
    if (!isOpen) {
      return;
    }
    const positionMenu = () => {
      const bounds = inputRef.current?.getBoundingClientRect();
      if (!bounds) {
        return;
      }
      const aboveSpace = Math.max(0, bounds.top - 12);
      const belowSpace = Math.max(0, window.innerHeight - bounds.bottom - 12);
      const idealHeight = Math.min(220, suggestions.length * 40 + 8);
      const above =
        placement === 'above'
          ? aboveSpace >= idealHeight || aboveSpace >= belowSpace
          : belowSpace < idealHeight && aboveSpace > belowSpace;
      const maxHeight = Math.min(idealHeight, above ? aboveSpace : belowSpace);
      const width = Math.min(Math.max(190, bounds.width), window.innerWidth - 24);
      setMenuPosition({
        left: Math.max(12, Math.min(bounds.left, window.innerWidth - width - 12)),
        top: above ? Math.max(8, bounds.top - maxHeight - 4) : bounds.bottom + 4,
        width,
        maxHeight,
      });
    };
    positionMenu();
    window.addEventListener('resize', positionMenu);
    window.addEventListener('scroll', positionMenu, true);
    return () => {
      window.removeEventListener('resize', positionMenu);
      window.removeEventListener('scroll', positionMenu, true);
    };
  }, [isOpen, placement, suggestions.length]);

  function choose(option: string): string {
    if (isPending) {
      return draft.trim();
    }
    const selected = option.startsWith('Add "') ? draft.trim() : option;
    setDraft(selected);
    setIsOpen(false);
    setHasTyped(false);
    setHasNavigated(false);
    onDraftChange?.(selected);
    if (onSelectSuggestion) {
      skipBlurCommit.current = true;
      onSelectSuggestion(selected);
    }
    return selected;
  }

  function showAllOptions() {
    setHasTyped(false);
    setHasNavigated(false);
    setIsOpen(true);
    setActiveIndex(0);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' && suggestions.length > 0) {
      event.preventDefault();
      setHasNavigated(true);
      if (!isOpen) {
        setIsOpen(true);
      }
      setActiveIndex((current) => (current + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp' && suggestions.length > 0) {
      event.preventDefault();
      setHasNavigated(true);
      if (!isOpen) {
        setIsOpen(true);
      }
      setActiveIndex((current) => (current - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      if (isOpen && suggestions.length > 0) {
        choose(suggestions[activeIndex] ?? draft);
      } else {
        skipBlurCommit.current = true;
        if (onEnterCommit) {
          onEnterCommit(draft.trim());
        } else {
          onCommit(draft.trim());
        }
      }
    } else if (
      event.key === 'Tab' &&
      isOpen &&
      suggestions.length > 0 &&
      (hasTyped || hasNavigated)
    ) {
      const activeSuggestion = suggestions[activeIndex] ?? draft;
      if (!allowTabToSelectAdd && !hasNavigated && activeSuggestion.startsWith('Add "')) {
        return;
      }
      const selected = choose(activeSuggestion);
      skipBlurCommit.current = true;
      if (onTabCommit) {
        event.preventDefault();
        if (!onSelectSuggestion) {
          onCommit(selected);
        }
        onTabCommit();
      } else if (!onSelectSuggestion) {
        onCommit(selected);
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setIsOpen(false);
      if (resetOnCancel) {
        skipBlurCommit.current = true;
        setDraft(value);
        setHasTyped(false);
        setHasNavigated(false);
      }
      onCancel();
    }
  }

  return (
    <div className={`ingredient-cell-editor${fitContent ? ' is-fit-content' : ''}`}>
      <input
        aria-activedescendant={
          isOpen && suggestions.length ? `${listId}-${activeIndex}` : undefined
        }
        aria-autocomplete="list"
        aria-busy={isPending || undefined}
        aria-controls={isOpen && suggestions.length ? listId : undefined}
        aria-describedby={inputDescribedBy || undefined}
        aria-expanded={isOpen && suggestions.length > 0}
        aria-label={label}
        aria-invalid={invalid || Boolean(errorMessage) || undefined}
        autoComplete="off"
        className={`ingredient-cell-input${fitContent ? ' is-fit-content' : ''}${className ? ` ${className}` : ''}`}
        disabled={isPending}
        ref={inputRef}
        role="combobox"
        size={
          fitContent
            ? Math.max(1, draft.length, ...normalizedOptions.map((option) => option.length))
            : fitToValue
              ? Math.max(1, draft.length)
              : undefined
        }
        type="text"
        value={draft}
        onFocus={() => {
          if (initialFocusPending.current) {
            initialFocusPending.current = false;
            return;
          }
          if (openOnFocus) {
            if (selectOnFocus) {
              inputRef.current?.select();
            }
            showAllOptions();
          }
        }}
        onClick={showAllOptions}
        onBlur={() => {
          setIsOpen(false);
          if (skipBlurCommit.current) {
            skipBlurCommit.current = false;
          } else {
            onCommit(draft.trim());
          }
        }}
        onChange={(event) => {
          setDraft(event.target.value);
          onDraftChange?.(event.target.value);
          setHasTyped(true);
          setHasNavigated(false);
          setIsOpen(true);
          setActiveIndex(0);
        }}
        onKeyDown={handleKeyDown}
      />
      {isPending && (
        <span className="visually-hidden" role="status">
          Adding picklist value
        </span>
      )}
      {errorMessage && (
        <span className="recipe-measurement-error" id={errorId} role="alert">
          {errorMessage}
        </span>
      )}
      {isOpen &&
        suggestions.length > 0 &&
        createPortal(
          <div
            className="ingredient-cell-options"
            id={listId}
            role="listbox"
            style={menuPosition ?? undefined}
            onMouseDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            {suggestions.map((option, index) => (
              <div
                aria-selected={index === activeIndex}
                className="ingredient-cell-option"
                id={`${listId}-${index}`}
                key={option}
                role="option"
                tabIndex={-1}
                onClick={(event) => {
                  event.stopPropagation();
                  choose(option);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    choose(option);
                  }
                }}
              >
                {option}
              </div>
            ))}
          </div>,
          document.querySelector('main') ?? document.body,
        )}
    </div>
  );
}
