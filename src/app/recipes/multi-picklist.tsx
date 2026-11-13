'use client';

import { useEffect, useLayoutEffect, useRef, useState, useTransition } from 'react';
import type { RecipePicklistValue } from '../../lib/recipes/data';
import { normalizePicklistMatchText } from '../../lib/recipes/picklist-rules';
import styles from './multi-picklist.module.css';

export type RecipeMultiSelectCategory = 'meal_type' | 'cuisine' | 'equipment';

type MultiPicklistProps = {
  category?: RecipeMultiSelectCategory;
  controlId?: string;
  label: string;
  values: Pick<RecipePicklistValue, 'id' | 'display_value'>[];
  selectedIds: string[];
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  onSelectionChange?: (selectedIds: string[]) => void;
  onAddOption?: (value: string) => Promise<{ valueId?: string; error?: string }>;
  onFocusLeave?: (relatedTarget: EventTarget | null) => void;
  onEnter?: () => boolean;
  emptyLabel?: string;
  describedBy?: string;
  filterMode?: boolean;
  includeHiddenInputs?: boolean;
  stagedChange?: boolean;
};

export function MultiPicklist({
  category,
  controlId,
  label,
  values,
  selectedIds,
  isOpen,
  onToggle,
  onClose,
  onSelectionChange,
  onAddOption,
  onFocusLeave,
  onEnter,
  emptyLabel = 'Select',
  describedBy,
  filterMode = false,
  includeHiddenInputs = true,
  stagedChange = false,
}: MultiPicklistProps) {
  const [localSelectedOptionIds, setLocalSelectedOptionIds] = useState(selectedIds);
  const selectedOptionIds = onSelectionChange ? selectedIds : localSelectedOptionIds;
  const [searchQuery, setSearchQuery] = useState('');
  const [addError, setAddError] = useState('');
  const [isAdding, startAddTransition] = useTransition();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLFieldSetElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const addSuggestionRef = useRef<HTMLButtonElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const focusSearchOnOpenRef = useRef(false);
  const [triggerLabelWidth, setTriggerLabelWidth] = useState(0);
  const selectedValues = values.filter((value) => selectedOptionIds.includes(value.id));
  const longestOption = values.reduce(
    (longest, value) =>
      value.display_value.length > longest.length ? value.display_value : longest,
    '',
  );
  const triggerMeasure = `✓ ${longestOption}`;
  const summaryText = filterMode
    ? selectedValues.map((value) => value.display_value).join(', ') || emptyLabel
    : (selectedValues[0]?.display_value ?? emptyLabel);
  const accessibleSelection = selectedValues.map((value) => value.display_value).join(', ');
  const optionsId = controlId ? `${controlId}-options` : `${category}-options`;
  const normalizedQuery = normalizePicklistMatchText(searchQuery);
  const filteredValues = normalizedQuery
    ? values.filter((value) =>
        normalizePicklistMatchText(value.display_value).includes(normalizedQuery),
      )
    : values;
  const hasExactMatch = values.some(
    (value) => normalizePicklistMatchText(value.display_value) === normalizedQuery,
  );
  const addValue = searchQuery.trim().replace(/\s+/gu, ' ');
  const canAddQuery = Boolean(normalizedQuery) && !hasExactMatch && Boolean(onAddOption);

  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
      setAddError('');
    }
  }, [isOpen]);

  useEffect(() => {
    if (filterMode) return;
    const measuredWidth = measureRef.current?.getBoundingClientRect().width;
    if (measuredWidth) {
      setTriggerLabelWidth(measuredWidth);
    }
  }, [filterMode]);

  useLayoutEffect(() => {
    if (!isOpen || !focusSearchOnOpenRef.current) {
      return;
    }
    focusSearchOnOpenRef.current = false;
    searchInputRef.current?.focus();
  }, [isOpen]);

  function selectOption(valueId: string) {
    if (selectedOptionIds.includes(valueId)) {
      return;
    }
    const nextValues = [...selectedOptionIds, valueId];
    if (onSelectionChange) onSelectionChange(nextValues);
    else setLocalSelectedOptionIds(nextValues);
  }

  function toggleOption(valueId: string) {
    const nextValues = selectedOptionIds.includes(valueId)
      ? selectedOptionIds.filter((id) => id !== valueId)
      : [...selectedOptionIds, valueId];
    if (onSelectionChange) onSelectionChange(nextValues);
    else setLocalSelectedOptionIds(nextValues);
  }

  function submitAddOption() {
    if (!onAddOption || isAdding || !canAddQuery) {
      return;
    }
    searchInputRef.current?.focus();
    setAddError('');
    startAddTransition(async () => {
      const result = await onAddOption(searchQuery);
      if (result.error || !result.valueId) {
        setAddError(result.error ?? `${label} could not be added. Try again.`);
        return;
      }
      searchInputRef.current?.focus();
      setSearchQuery('');
      selectOption(result.valueId);
    });
  }

  function handleTriggerKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'Enter' && onEnter?.()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (event.key !== ' ' && event.key !== 'Enter' && event.key !== 'ArrowDown') {
      return;
    }

    event.preventDefault();
    if (isOpen) {
      searchInputRef.current?.focus();
      return;
    }

    focusSearchOnOpenRef.current = true;
    onToggle();
  }

  function handleOptionKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      onClose();
      triggerRef.current?.focus();
      return;
    }

    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
      return;
    }

    event.preventDefault();
    const options = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('button[data-multi-option="true"]') ??
        [],
    );
    const currentIndex = options.indexOf(event.currentTarget);
    const nextIndex =
      event.key === 'ArrowDown'
        ? Math.min(currentIndex + 1, options.length - 1)
        : Math.max(currentIndex - 1, 0);
    options[nextIndex]?.focus();
  }

  function handleSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'ArrowDown') {
      return;
    }

    event.preventDefault();
    const firstOption = menuRef.current?.querySelector<HTMLButtonElement>(
      'button[data-multi-option="true"]',
    );
    (firstOption ?? (canAddQuery ? addSuggestionRef.current : null))?.focus();
  }

  return (
    <fieldset
      className={`${styles.group}${filterMode ? ` ${styles.filterGroup}` : ''}`}
      onBlur={(event) => {
        const nextTarget = event.relatedTarget;
        if (!nextTarget || !event.currentTarget.contains(nextTarget as Node)) {
          onClose();
          onFocusLeave?.(nextTarget);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && isOpen) {
          event.preventDefault();
          onClose();
          triggerRef.current?.focus();
        }
      }}
    >
      <legend>{label}</legend>
      <div className={styles.anchor}>
        {!filterMode && (
          <span aria-hidden="true" className={styles.measure} ref={measureRef}>
            {triggerMeasure}
          </span>
        )}
        <button
          aria-controls={optionsId}
          aria-describedby={describedBy}
          aria-expanded={isOpen}
          aria-label={`${label}: ${accessibleSelection || 'Select'}`}
          className={`recipe-picklist-trigger${filterMode ? ' recipe-filter-value-trigger' : ''}${stagedChange ? ' is-staged-changed' : ''}`}
          data-query-multi-select={filterMode ? 'true' : undefined}
          id={controlId}
          ref={triggerRef}
          style={
            !filterMode && triggerLabelWidth
              ? { minWidth: `${triggerLabelWidth + 40}px` }
              : undefined
          }
          type="button"
          onClick={onToggle}
          onKeyDown={handleTriggerKeyDown}
        >
          <span className="recipe-picklist-trigger-label">
            {selectedValues.length > 0 && !filterMode && (
              <span aria-hidden="true" className={styles.triggerCheck}>
                ✓
              </span>
            )}
            <span>{selectedValues.length > 0 ? summaryText : emptyLabel}</span>
          </span>
          <span aria-hidden="true" className="recipe-picklist-arrow">
            ▾
          </span>
        </button>
        {isOpen && (
          <fieldset
            aria-label={`${label} options`}
            className={`${styles.menu}${filterMode ? ` ${styles.filterMenu}` : ''}`}
            id={optionsId}
            ref={menuRef}
          >
            <div className={styles.searchRow}>
              <input
                aria-label={`Search ${label}`}
                autoComplete="off"
                className={styles.searchInput}
                ref={searchInputRef}
                readOnly={isAdding}
                type="text"
                value={searchQuery}
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  if (addError) {
                    setAddError('');
                  }
                }}
                onKeyDown={handleSearchKeyDown}
              />
            </div>
            {filteredValues.map((value) => {
              const isSelected = selectedOptionIds.includes(value.id);
              return (
                <button
                  aria-pressed={isSelected}
                  className={styles.option}
                  data-multi-option="true"
                  key={value.id}
                  type="button"
                  onClick={() => toggleOption(value.id)}
                  onKeyDown={handleOptionKeyDown}
                >
                  <span aria-hidden="true" className={styles.check}>
                    {isSelected ? '✓' : ''}
                  </span>
                  <span>{value.display_value}</span>
                </button>
              );
            })}
            {canAddQuery && (
              <button
                aria-label={`Add "${addValue}"`}
                className={styles.addSuggestion}
                disabled={isAdding}
                ref={addSuggestionRef}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={submitAddOption}
              >
                Add "{addValue}"
              </button>
            )}
            {addError && (
              <p className={styles.addError} role="alert">
                {addError}
              </p>
            )}
          </fieldset>
        )}
      </div>
      {includeHiddenInputs &&
        category &&
        selectedOptionIds.map((valueId) => (
          <input key={valueId} name={`${category}_ids`} type="hidden" value={valueId} />
        ))}
    </fieldset>
  );
}
