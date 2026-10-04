'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { IngredientOption, RecipePicklistValue } from '../../lib/recipes/data';
import type { IngredientRowDraft } from '../../lib/recipes/ingredient-rules';
import {
  ensureTrailingIngredientRow,
  formatIngredientDisplay,
  isEmptyIngredientRow,
  moveIngredientRow,
  moveIngredientRowTo,
} from '../../lib/recipes/ingredient-rules';
import { parseQuantityInput } from '../../lib/recipes/measurement-rules';
import { MeasurementEditor } from './measurement-editor';

const defaultPreparationOptions = [
  'chopped',
  'crushed',
  'cubed',
  'diced',
  'divided',
  'melted',
  'minced',
  'room temperature',
  'sifted',
  'sliced',
];

type IngredientField = 'ingredientName' | 'detail' | 'preparation';

function createEmptyIngredientRow(id = crypto.randomUUID()): IngredientRowDraft {
  return {
    id,
    ingredientId: null,
    ingredientName: '',
    isMain: false,
    detail: '',
    preparation: '',
    measurements: [],
  };
}

function updateIngredientRow(
  rows: IngredientRowDraft[],
  rowId: string,
  update: Partial<IngredientRowDraft>,
): IngredientRowDraft[] {
  return rows.map((row) => (row.id === rowId ? { ...row, ...update } : row));
}

function formatDraftIngredient(
  row: IngredientRowDraft,
  picklists: RecipePicklistValue[] = [],
): string {
  return formatIngredientDisplay({
    ingredient_name: row.ingredientName,
    detail: row.detail,
    preparation: row.preparation,
    measurements: row.measurements.flatMap((measurement) => {
      if (!measurement.type) {
        return [];
      }
      const unmeasured = measurement.type === 'unmeasured';
      const parsed = unmeasured ? null : parseQuantityInput(measurement.quantity);
      return [
        {
          measurement_type: measurement.type,
          amount_min: parsed?.minimum ?? null,
          amount_max: parsed?.maximum ?? null,
          unit_code: measurement.unitCode || null,
          picklist_value: measurement.picklistValueId
            ? (picklists.find((option) => option.id === measurement.picklistValueId)?.value ?? null)
            : null,
        },
      ];
    }),
  });
}

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

function SuggestionCellEditor({
  label,
  value,
  options,
  initialCharacter,
  onCommit,
  onCancel,
  onDraftChange,
  onTabCommit,
  placement = 'above',
  focusOnMount = true,
}: {
  label: string;
  value: string;
  options: string[];
  initialCharacter?: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
  onDraftChange?: (value: string) => void;
  onTabCommit?: () => void;
  placement?: 'above' | 'below';
  focusOnMount?: boolean;
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
  const normalizedOptions = uniqueOptions(options);
  const matchingOptions = normalizedOptions.filter((option) =>
    option.toLocaleLowerCase().includes(draft.trim().toLocaleLowerCase()),
  );
  const isExactMatch = normalizedOptions.some(
    (option) => option.toLocaleLowerCase() === draft.trim().toLocaleLowerCase(),
  );
  const suggestions = hasTyped
    ? [...matchingOptions, ...(draft.trim() && !isExactMatch ? [`Add "${draft.trim()}"`] : [])]
    : normalizedOptions;

  useEffect(() => {
    if (focusOnMount) {
      inputRef.current?.focus();
      if (!initialCharacter) {
        inputRef.current?.select();
      }
    }
  }, [focusOnMount, initialCharacter]);

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
    const selected = option.startsWith('Add "') ? draft.trim() : option;
    setDraft(selected);
    setIsOpen(false);
    setHasTyped(false);
    setHasNavigated(false);
    onDraftChange?.(selected);
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
      setActiveIndex((current) => (current + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp' && suggestions.length > 0) {
      event.preventDefault();
      setHasNavigated(true);
      setActiveIndex((current) => (current - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      if (isOpen && suggestions.length > 0) {
        choose(suggestions[activeIndex] ?? draft);
      } else {
        skipBlurCommit.current = true;
        onCommit(draft.trim());
      }
    } else if (
      event.key === 'Tab' &&
      isOpen &&
      suggestions.length > 0 &&
      (hasTyped || hasNavigated)
    ) {
      const selected = choose(suggestions[activeIndex] ?? draft);
      skipBlurCommit.current = true;
      if (onTabCommit) {
        event.preventDefault();
        onCommit(selected);
        onTabCommit();
      } else {
        onCommit(selected);
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setIsOpen(false);
      onCancel();
    }
  }

  return (
    <div className="ingredient-cell-editor">
      <input
        aria-activedescendant={
          isOpen && suggestions.length ? `${listId}-${activeIndex}` : undefined
        }
        aria-autocomplete="list"
        aria-controls={isOpen && suggestions.length ? listId : undefined}
        aria-expanded={isOpen && suggestions.length > 0}
        aria-label={label}
        autoComplete="off"
        className="ingredient-cell-input"
        ref={inputRef}
        role="combobox"
        type="text"
        value={draft}
        onFocus={() => {
          if (initialFocusPending.current) {
            initialFocusPending.current = false;
            return;
          }
          showAllOptions();
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
      {isOpen &&
        suggestions.length > 0 &&
        createPortal(
          <div
            className="ingredient-cell-options"
            id={listId}
            role="listbox"
            style={menuPosition ?? undefined}
            onMouseDown={(event) => event.preventDefault()}
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

function InlineTextEditor({
  label,
  value,
  initialCharacter,
  onCommit,
  onCancel,
}: {
  label: string;
  value: string;
  initialCharacter?: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initialCharacter ?? value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <input
      aria-label={label}
      className="ingredient-cell-input"
      ref={inputRef}
      value={draft}
      onBlur={() => onCommit(draft.trim())}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          event.stopPropagation();
          onCommit(draft.trim());
        } else if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          onCancel();
        }
      }}
    />
  );
}

function MobileIngredientEditor({
  row,
  rowNumber,
  anchorElement,
  ingredients,
  picklists,
  preparationOptions,
  validateMeasurements,
  onSubmit,
  onClose,
}: {
  row: IngredientRowDraft;
  rowNumber: number;
  anchorElement: HTMLButtonElement;
  ingredients: IngredientOption[];
  picklists: RecipePicklistValue[];
  preparationOptions: string[];
  validateMeasurements: boolean;
  onSubmit: (row: IngredientRowDraft) => void;
  onClose: () => void;
}) {
  const [ingredientName, setIngredientName] = useState(row.ingredientName);
  const [detail, setDetail] = useState(row.detail);
  const [preparation, setPreparation] = useState(row.preparation);
  const [measurements, setMeasurements] = useState(row.measurements);
  const [position, setPosition] = useState<{ left: number; top: number; maxHeight: number } | null>(
    null,
  );
  const popoverRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const positionPopover = () => {
      const popover = popoverRef.current;
      if (!popover) {
        return;
      }

      const anchorBounds = anchorElement.getBoundingClientRect();
      const popoverBounds = popover.getBoundingClientRect();
      const margin = 8;
      const gap = 4;
      const belowSpace = Math.max(0, window.innerHeight - anchorBounds.bottom - gap - margin);
      const aboveSpace = Math.max(0, anchorBounds.top - gap - margin);
      const placeAbove = popoverBounds.height > belowSpace && aboveSpace > belowSpace;
      const availableSpace = placeAbove ? aboveSpace : belowSpace;
      const maxHeight = Math.min(popoverBounds.height, availableSpace);
      const height = Math.min(popoverBounds.height, maxHeight);
      const width = Math.min(popoverBounds.width, window.innerWidth - margin * 2);

      setPosition({
        left: Math.max(margin, Math.min(anchorBounds.left, window.innerWidth - width - margin)),
        top: placeAbove
          ? Math.max(margin, anchorBounds.top - height - gap)
          : Math.min(anchorBounds.bottom + gap, window.innerHeight - margin - height),
        maxHeight,
      });
    };

    positionPopover();
    window.addEventListener('resize', positionPopover);
    window.addEventListener('scroll', positionPopover, true);
    return () => {
      window.removeEventListener('resize', positionPopover);
      window.removeEventListener('scroll', positionPopover, true);
    };
  }, [anchorElement]);

  useEffect(() => {
    const dismissOutside = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('.ingredient-cell-options')) {
        return;
      }
      if (
        target instanceof Node &&
        !popoverRef.current?.contains(target) &&
        !anchorElement.contains(target)
      ) {
        onClose();
      }
    };

    document.addEventListener('pointerdown', dismissOutside, true);
    return () => document.removeEventListener('pointerdown', dismissOutside, true);
  }, [anchorElement, onClose]);

  function submit() {
    onSubmit({
      ...row,
      ingredientId: null,
      ingredientName: ingredientName.trim(),
      detail: detail.trim(),
      preparation: preparation.trim(),
      measurements,
    });
  }

  return (
    <div
      aria-label="Ingredient details"
      className="recipe-ingredient-mobile-popover"
      ref={popoverRef}
      style={
        position
          ? {
              left: position.left,
              maxHeight: position.maxHeight,
              top: position.top,
            }
          : undefined
      }
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onClose();
        } else if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
          event.preventDefault();
          submit();
        }
      }}
      role="dialog"
    >
      <div className="recipe-mobile-picker-field">
        <span>Ingredient</span>
        <SuggestionCellEditor
          label="Ingredient"
          options={ingredients.map((ingredient) => ingredient.name)}
          placement="above"
          value={ingredientName}
          onDraftChange={setIngredientName}
          onCommit={setIngredientName}
          onCancel={() => {}}
        />
      </div>
      <label>
        <span>Detail</span>
        <input type="text" value={detail} onChange={(event) => setDetail(event.target.value)} />
      </label>
      <div className="recipe-mobile-picker-field">
        <span>Preparation</span>
        <SuggestionCellEditor
          label="Preparation"
          options={preparationOptions}
          placement="above"
          focusOnMount={false}
          value={preparation}
          onDraftChange={setPreparation}
          onCommit={setPreparation}
          onCancel={() => {}}
        />
      </div>
      <div className="recipe-mobile-picker-field recipe-mobile-measurement-field">
        <span>Amount</span>
        <MeasurementEditor
          rowNumber={rowNumber}
          measurements={measurements}
          picklists={picklists}
          validate={validateMeasurements}
          onChange={setMeasurements}
        />
      </div>
      <button className="recipe-ingredient-submit" type="button" onClick={submit}>
        Submit
      </button>
    </div>
  );
}

export function IngredientRowsEditor({
  ingredients,
  picklists,
  preparationOptions,
  rows,
  validateMeasurements,
  onRowsChange,
}: {
  ingredients: IngredientOption[];
  picklists: RecipePicklistValue[];
  preparationOptions: string[];
  rows: IngredientRowDraft[];
  validateMeasurements: boolean;
  onRowsChange: (rows: IngredientRowDraft[]) => void;
}) {
  const [draftRows, setDraftRows] = useState(() =>
    ensureTrailingIngredientRow(rows, () => createEmptyIngredientRow('ingredient-placeholder')),
  );
  const [activeCell, setActiveCell] = useState<{
    rowId: string;
    field: IngredientField;
    initialCharacter?: string;
  } | null>(null);
  const [mobileEditingRowId, setMobileEditingRowId] = useState<string | null>(null);
  const [mobileAnchorElement, setMobileAnchorElement] = useState<HTMLButtonElement | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const ingredientTableRef = useRef<HTMLTableElement>(null);
  const pendingFocusCell = useRef<{ rowId: string; field: IngredientField } | null>(null);
  const dragRowId = useRef<string | null>(null);
  const touchDragRowId = useRef<string | null>(null);
  const rowsRef = useRef(draftRows);

  useEffect(() => {
    const normalized = ensureTrailingIngredientRow(rows, () =>
      createEmptyIngredientRow('ingredient-placeholder'),
    );
    rowsRef.current = normalized;
    setDraftRows(normalized);
  }, [rows]);

  useLayoutEffect(() => {
    const focusTarget = pendingFocusCell.current;
    if (!focusTarget) {
      return;
    }
    pendingFocusCell.current = null;
    if (!draftRows.some((row) => row.id === focusTarget.rowId)) {
      return;
    }
    const cells =
      ingredientTableRef.current?.querySelectorAll<HTMLTableCellElement>('[data-field]');
    Array.from(cells ?? [])
      .find(
        (cell) =>
          cell.dataset.rowId === focusTarget.rowId && cell.dataset.field === focusTarget.field,
      )
      ?.focus();
  }, [draftRows]);

  const commitRows = (nextRows: IngredientRowDraft[]) => {
    const normalized = ensureTrailingIngredientRow(nextRows, createEmptyIngredientRow);
    rowsRef.current = normalized;
    setDraftRows(normalized);
    onRowsChange(normalized);
  };

  const closeMobileEditor = () => {
    setMobileEditingRowId(null);
    setMobileAnchorElement(null);
  };

  const deleteIngredientRow = (rowId: string) => {
    const row = rowsRef.current.find((current) => current.id === rowId);
    if (!row || isEmptyIngredientRow(row)) {
      return;
    }

    if (activeCell?.rowId === rowId) {
      setActiveCell(null);
    }
    if (mobileEditingRowId === rowId) {
      closeMobileEditor();
    }
    setAnnouncement(`${row.ingredientName || 'Ingredient'} removed.`);
    commitRows(rowsRef.current.filter((current) => current.id !== rowId));
  };

  const commitCell = (rowId: string, field: IngredientField, value: string) => {
    const currentRows = rowsRef.current;
    if (field === 'ingredientName' && !value.trim()) {
      commitRows(currentRows.filter((row) => row.id !== rowId));
      setActiveCell(null);
      return;
    }

    const updatedRows = updateIngredientRow(currentRows, rowId, {
      [field]: value,
      ...(field === 'ingredientName'
        ? {
            ingredientId:
              ingredients.find(
                (ingredient) => ingredient.name.toLocaleLowerCase() === value.toLocaleLowerCase(),
              )?.id ?? null,
          }
        : {}),
    });
    commitRows(updatedRows);
    setActiveCell(null);
  };

  const focusNextCell = (rowId: string, field: IngredientField) => {
    const currentIndex = rowsRef.current.findIndex((row) => row.id === rowId);
    if (currentIndex < 0) {
      return;
    }

    if (field === 'ingredientName') {
      pendingFocusCell.current = { rowId, field: 'detail' };
      return;
    }

    if (field === 'preparation') {
      const nextRow = rowsRef.current[currentIndex + 1];
      pendingFocusCell.current = nextRow ? { rowId: nextRow.id, field: 'ingredientName' } : null;
    }
  };

  const moveRow = (rowId: string, direction: 'up' | 'down') => {
    const nextRows = moveIngredientRow(rowsRef.current, rowId, direction);
    if (nextRows === rowsRef.current) {
      return;
    }
    const newIndex = nextRows.findIndex((row) => row.id === rowId);
    setAnnouncement(
      `${nextRows[newIndex]?.ingredientName || 'Ingredient'} moved to row ${newIndex + 1}.`,
    );
    commitRows(nextRows);
  };

  const moveDraggedRow = (targetRowId: string) => {
    const sourceRowId = dragRowId.current;
    dragRowId.current = null;
    if (!sourceRowId || sourceRowId === targetRowId) {
      return;
    }
    commitRows(moveIngredientRowTo(rowsRef.current, sourceRowId, targetRowId));
  };

  function handleGridKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    const target = event.target as HTMLElement;
    const rowId = target.closest<HTMLElement>('[data-row-id]')?.dataset.rowId;
    if (!rowId) {
      return;
    }

    if (event.ctrlKey && event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      moveRow(rowId, 'up');
    } else if (event.ctrlKey && event.key === 'ArrowDown') {
      event.preventDefault();
      event.stopPropagation();
      moveRow(rowId, 'down');
    } else if (event.target instanceof HTMLTableCellElement && event.key === 'Enter') {
      const field = target.dataset.field as IngredientField | undefined;
      if (field) {
        event.preventDefault();
        setActiveCell({ rowId, field });
      }
    } else if (
      event.target instanceof HTMLTableCellElement &&
      event.key.length === 1 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      const field = target.dataset.field as IngredientField | undefined;
      if (field) {
        event.preventDefault();
        setActiveCell({ rowId, field, initialCharacter: event.key });
      }
    }
  }

  const prepOptions = uniqueOptions([
    ...defaultPreparationOptions,
    ...preparationOptions,
    ...draftRows.map((row) => row.preparation),
  ]);

  function renderDesktopCell(row: IngredientRowDraft, rowIndex: number, field: IngredientField) {
    const fieldLabel =
      field === 'ingredientName' ? 'Ingredient' : field === 'detail' ? 'Detail' : 'Preparation';
    const isActive = activeCell?.rowId === row.id && activeCell.field === field;
    const initialCharacter =
      activeCell?.rowId === row.id && activeCell.field === field
        ? activeCell.initialCharacter
        : undefined;
    const displayValue = row[field];

    return (
      <td
        aria-label={
          isEmptyIngredientRow(row) && field === 'ingredientName'
            ? 'Add ingredient row'
            : `${fieldLabel}, row ${rowIndex + 1}`
        }
        className={`recipe-ingredient-value-cell${isEmptyIngredientRow(row) ? ' is-empty' : ''}`}
        data-field={field}
        data-row-id={row.id}
        key={field}
        tabIndex={isActive ? -1 : 0}
        onClick={() => setActiveCell({ rowId: row.id, field })}
        onKeyDown={handleGridKeyDown}
        onDragOver={(event) => event.preventDefault()}
        onDrop={() => moveDraggedRow(row.id)}
      >
        {isActive && field === 'ingredientName' ? (
          <SuggestionCellEditor
            label={`${fieldLabel}, row ${rowIndex + 1}`}
            options={ingredients.map((ingredient) => ingredient.name)}
            value={displayValue}
            initialCharacter={initialCharacter}
            onCancel={() => setActiveCell(null)}
            onCommit={(value) => commitCell(row.id, field, value)}
            onTabCommit={() => focusNextCell(row.id, field)}
          />
        ) : isActive && field === 'preparation' ? (
          <SuggestionCellEditor
            label={`${fieldLabel}, row ${rowIndex + 1}`}
            options={prepOptions}
            value={displayValue}
            initialCharacter={initialCharacter}
            onCancel={() => setActiveCell(null)}
            onCommit={(value) => commitCell(row.id, field, value)}
            onTabCommit={() => focusNextCell(row.id, field)}
          />
        ) : isActive ? (
          <InlineTextEditor
            label={`${fieldLabel}, row ${rowIndex + 1}`}
            value={displayValue}
            initialCharacter={initialCharacter}
            onCancel={() => setActiveCell(null)}
            onCommit={(value) => commitCell(row.id, field, value)}
          />
        ) : (
          <span className="recipe-ingredient-cell-value">{displayValue}</span>
        )}
      </td>
    );
  }

  function renderMeasurementCell(row: IngredientRowDraft, rowIndex: number) {
    return (
      <td className="recipe-ingredient-amount-cell" key="measurements">
        <MeasurementEditor
          rowNumber={rowIndex + 1}
          measurements={row.measurements}
          picklists={picklists}
          validate={validateMeasurements}
          onChange={(measurements) =>
            commitRows(updateIngredientRow(rowsRef.current, row.id, { measurements }))
          }
        />
      </td>
    );
  }

  function renderRailRow(row: IngredientRowDraft, index: number) {
    return (
      <div className="recipe-ingredient-rail-row" data-row-id={row.id} key={row.id}>
        <button
          aria-label={`Reorder ingredient row ${index + 1}`}
          className="recipe-ingredient-drag-handle"
          draggable={false}
          type="button"
          title="Drag to reorder. Use Ctrl+Up or Ctrl+Down to move by keyboard."
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.stopPropagation();
            moveDraggedRow(row.id);
          }}
          onPointerDown={(event) => {
            if (isEmptyIngredientRow(row) || event.button !== 0) {
              return;
            }
            touchDragRowId.current = row.id;
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerUp={(event) => {
            const sourceRowId = touchDragRowId.current;
            touchDragRowId.current = null;
            if (!sourceRowId) {
              return;
            }
            const targetRow = document
              .elementFromPoint(event.clientX, event.clientY)
              ?.closest<HTMLElement>('[data-row-id]');
            const targetRowId = targetRow?.dataset.rowId;
            if (targetRowId) {
              commitRows(moveIngredientRowTo(rowsRef.current, sourceRowId, targetRowId));
            }
          }}
          onPointerCancel={() => {
            touchDragRowId.current = null;
          }}
          onDragStart={(event) => {
            dragRowId.current = row.id;
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', row.id);
          }}
          onKeyDown={(event) => {
            if (event.ctrlKey && event.key === 'ArrowUp') {
              event.preventDefault();
              moveRow(row.id, 'up');
            } else if (event.ctrlKey && event.key === 'ArrowDown') {
              event.preventDefault();
              moveRow(row.id, 'down');
            }
          }}
        >
          <span aria-hidden="true" className="recipe-ingredient-grip" />
        </button>
        <input
          aria-label={`Main, row ${index + 1}`}
          checked={row.isMain}
          disabled={isEmptyIngredientRow(row)}
          type="checkbox"
          onChange={(event) =>
            commitRows(
              updateIngredientRow(rowsRef.current, row.id, { isMain: event.target.checked }),
            )
          }
        />
      </div>
    );
  }

  function renderControlRail() {
    return (
      <fieldset aria-label="Ingredient row controls" className="recipe-ingredient-control-rail">
        <legend className="visually-hidden">Ingredient row controls</legend>
        <div aria-hidden="true" className="recipe-ingredient-rail-header" />
        {draftRows.map(renderRailRow)}
      </fieldset>
    );
  }

  function submitMobileRow(row: IngredientRowDraft) {
    const rowExists = rowsRef.current.some((current) => current.id === row.id);
    const nextRows = row.ingredientName.trim()
      ? rowExists
        ? updateIngredientRow(rowsRef.current, row.id, row)
        : [...rowsRef.current, row]
      : rowsRef.current.filter((current) => current.id !== row.id);
    commitRows(nextRows);
    closeMobileEditor();
  }

  return (
    <div className="recipe-ingredient-editor">
      <div className="recipe-ingredient-desktop">
        <div className="recipe-ingredient-desktop-layout">
          {renderControlRail()}
          <table
            aria-label="Recipe ingredients"
            className="recipe-ingredient-table"
            ref={ingredientTableRef}
          >
            <thead>
              <tr>
                <th scope="col">Ingredient</th>
                <th scope="col">Amount</th>
                <th scope="col">Detail</th>
                <th scope="col">Preparation</th>
                <th
                  aria-label="Row actions"
                  className="recipe-ingredient-delete-header"
                  scope="col"
                >
                  <span className="visually-hidden">Row actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {draftRows.map((row, index) => (
                <tr
                  data-row-id={row.id}
                  key={row.id}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => moveDraggedRow(row.id)}
                >
                  {renderDesktopCell(row, index, 'ingredientName')}
                  {renderMeasurementCell(row, index)}
                  {renderDesktopCell(row, index, 'detail')}
                  {renderDesktopCell(row, index, 'preparation')}
                  <td className="recipe-ingredient-delete-cell">
                    {!isEmptyIngredientRow(row) && (
                      <button
                        aria-label={`Delete ingredient row ${index + 1}`}
                        className="recipe-ingredient-delete-button"
                        title="Delete ingredient row"
                        type="button"
                        onClick={() => deleteIngredientRow(row.id)}
                      >
                        ×
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="recipe-ingredient-mobile">
        <table aria-label="Recipe ingredients on mobile" className="recipe-ingredient-mobile-list">
          <tbody>
            {draftRows.map((row, index) => (
              <tr
                className="recipe-ingredient-mobile-row"
                data-row-id={row.id}
                key={row.id}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => moveDraggedRow(row.id)}
              >
                <td className="recipe-ingredient-mobile-rail">{renderRailRow(row, index)}</td>
                <td
                  aria-label={
                    isEmptyIngredientRow(row)
                      ? 'Add ingredient row'
                      : `Edit ${formatDraftIngredient(row, picklists)}`
                  }
                  className="recipe-ingredient-mobile-cell"
                >
                  <button
                    aria-label={
                      isEmptyIngredientRow(row)
                        ? 'Enter ingredient'
                        : `Edit ${formatDraftIngredient(row, picklists)}`
                    }
                    className="recipe-ingredient-mobile-value"
                    type="button"
                    onClick={(event) => {
                      if (mobileEditingRowId === row.id) {
                        closeMobileEditor();
                      } else {
                        setMobileEditingRowId(row.id);
                        setMobileAnchorElement(event.currentTarget);
                      }
                    }}
                  >
                    {formatDraftIngredient(row, picklists)}
                  </button>
                  {!isEmptyIngredientRow(row) && (
                    <button
                      aria-label={`Delete ingredient row ${index + 1}`}
                      className="recipe-ingredient-delete-button recipe-ingredient-mobile-delete"
                      title="Delete ingredient row"
                      type="button"
                      onClick={() => deleteIngredientRow(row.id)}
                    >
                      ×
                    </button>
                  )}
                  {mobileEditingRowId === row.id && mobileAnchorElement && (
                    <MobileIngredientEditor
                      rowNumber={index + 1}
                      ingredients={ingredients}
                      anchorElement={mobileAnchorElement}
                      picklists={picklists}
                      preparationOptions={prepOptions}
                      validateMeasurements={validateMeasurements}
                      row={row}
                      onClose={closeMobileEditor}
                      onSubmit={submitMobileRow}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p aria-live="polite" className="visually-hidden">
        {announcement}
      </p>
    </div>
  );
}
