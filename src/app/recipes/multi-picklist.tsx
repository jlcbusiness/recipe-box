'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { RecipePicklistValue } from '../../lib/recipes/data';
import styles from './multi-picklist.module.css';

export type RecipeMultiSelectCategory = 'meal_type' | 'cuisine' | 'equipment';

type MultiPicklistProps = {
  category: RecipeMultiSelectCategory;
  label: string;
  values: RecipePicklistValue[];
  selectedIds: string[];
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
};

export function MultiPicklist({
  category,
  label,
  values,
  selectedIds,
  isOpen,
  onToggle,
  onClose,
}: MultiPicklistProps) {
  const [selectedOptionIds, setSelectedOptionIds] = useState(selectedIds);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLFieldSetElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const focusOptionOnOpenRef = useRef(false);
  const [triggerLabelWidth, setTriggerLabelWidth] = useState(0);
  const selectedValues = values.filter((value) => selectedOptionIds.includes(value.id));
  const longestOption = values.reduce(
    (longest, value) => (value.value.length > longest.length ? value.value : longest),
    '',
  );
  const triggerMeasure = `✓ ${longestOption}`;
  const summaryText = selectedValues[0]?.value ?? 'Select';
  const accessibleSelection = selectedValues.map((value) => value.value).join(', ');

  useEffect(() => {
    const measuredWidth = measureRef.current?.getBoundingClientRect().width;
    if (measuredWidth) {
      setTriggerLabelWidth(measuredWidth);
    }
  }, []);

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
    setSelectedOptionIds((current) =>
      current.includes(valueId) ? current.filter((id) => id !== valueId) : [...current, valueId],
    );
  }

  function handleTriggerKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
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
      className={styles.group}
      onBlur={(event) => {
        const nextTarget = event.relatedTarget;
        if (!nextTarget || !event.currentTarget.contains(nextTarget as Node)) {
          onClose();
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
        <span aria-hidden="true" className={styles.measure} ref={measureRef}>
          {triggerMeasure}
        </span>
        <button
          aria-controls={`${category}-options`}
          aria-expanded={isOpen}
          aria-label={`${label}: ${accessibleSelection || 'Select'}`}
          className="recipe-picklist-trigger"
          ref={triggerRef}
          style={{ minWidth: triggerLabelWidth ? `${triggerLabelWidth + 40}px` : undefined }}
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
            <span>{summaryText}</span>
          </span>
          <span aria-hidden="true" className="recipe-picklist-arrow">
            ▾
          </span>
        </button>
        {isOpen && (
          <fieldset
            aria-label={`${label} options`}
            className={styles.menu}
            id={`${category}-options`}
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
                  <span>{value.value}</span>
                </button>
              );
            })}
          </fieldset>
        )}
      </div>
      {selectedOptionIds.map((valueId) => (
        <input key={valueId} name={`${category}_ids`} type="hidden" value={valueId} />
      ))}
    </fieldset>
  );
}
