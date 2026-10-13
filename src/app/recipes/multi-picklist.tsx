'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { RecipePicklistValue } from '../../lib/recipes/data';
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
  onFocusLeave?: (relatedTarget: EventTarget | null) => void;
  onEnter?: () => boolean;
  emptyLabel?: string;
  filterMode?: boolean;
  includeHiddenInputs?: boolean;
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
  onFocusLeave,
  onEnter,
  emptyLabel = 'Select',
  filterMode = false,
  includeHiddenInputs = true,
}: MultiPicklistProps) {
  const [localSelectedOptionIds, setLocalSelectedOptionIds] = useState(selectedIds);
  const selectedOptionIds = onSelectionChange ? selectedIds : localSelectedOptionIds;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLFieldSetElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const focusOptionOnOpenRef = useRef(false);
  const [triggerLabelWidth, setTriggerLabelWidth] = useState(0);
  const selectedValues = values.filter((value) => selectedOptionIds.includes(value.id));
  const longestOption = values.reduce(
    (longest, value) =>
      value.display_value.length > longest.length ? value.display_value : longest,
    '',
  );
  const triggerMeasure = `✓ ${longestOption}`;
  const summaryText = selectedValues[0]?.display_value ?? emptyLabel;
  const accessibleSelection = selectedValues.map((value) => value.display_value).join(', ');
  const optionsId = controlId ? `${controlId}-options` : `${category}-options`;

  useEffect(() => {
    if (filterMode) return;
    const measuredWidth = measureRef.current?.getBoundingClientRect().width;
    if (measuredWidth) {
      setTriggerLabelWidth(measuredWidth);
    }
  }, [filterMode]);

  useLayoutEffect(() => {
    if (!isOpen || !focusOptionOnOpenRef.current) {
      return;
    }
    focusOptionOnOpenRef.current = false;
    const selectedOption = menuRef.current?.querySelector<HTMLButtonElement>(
      'button[aria-pressed="true"]',
    );
    const firstOption = menuRef.current?.querySelector<HTMLButtonElement>('button');
    (selectedOption ?? firstOption)?.focus();
  }, [isOpen]);

  function toggleOption(valueId: string) {
    const nextValues = selectedOptionIds.includes(valueId)
      ? selectedOptionIds.filter((id) => id !== valueId)
      : [...selectedOptionIds, valueId];
    if (onSelectionChange) onSelectionChange(nextValues);
    else setLocalSelectedOptionIds(nextValues);
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
      const selectedOption = menuRef.current?.querySelector<HTMLButtonElement>(
        'button[aria-pressed="true"]',
      );
      const firstOption = menuRef.current?.querySelector<HTMLButtonElement>('button');
      (selectedOption ?? firstOption)?.focus();
      return;
    }

    focusOptionOnOpenRef.current = true;
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
      menuRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [],
    );
    const currentIndex = options.indexOf(event.currentTarget);
    const nextIndex =
      event.key === 'ArrowDown'
        ? Math.min(currentIndex + 1, options.length - 1)
        : Math.max(currentIndex - 1, 0);
    options[nextIndex]?.focus();
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
          aria-expanded={isOpen}
          aria-label={`${label}: ${accessibleSelection || 'Select'}`}
          className={`recipe-picklist-trigger${filterMode ? ' recipe-filter-value-trigger' : ''}`}
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
            {selectedValues.length > 0 && (
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
            {values.map((value) => {
              const isSelected = selectedOptionIds.includes(value.id);
              return (
                <button
                  aria-pressed={isSelected}
                  className={styles.option}
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
