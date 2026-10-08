'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
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
import { useReorderDrag } from './use-reorder-drag';

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
  openOnFocus = true,
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
  openOnFocus?: boolean;
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
          if (openOnFocus) {
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

  const positionPopover = useCallback(() => {
    const popover = popoverRef.current;
    if (!popover) {
      return;
    }

    const anchorBounds = anchorElement.getBoundingClientRect();
    const popoverBounds = popover.getBoundingClientRect();
    const naturalHeight = popover.scrollHeight + popover.offsetHeight - popover.clientHeight;
    const margin = 8;
    const gap = 4;
    const belowSpace = Math.max(0, window.innerHeight - anchorBounds.bottom - gap - margin);
    const aboveSpace = Math.max(0, anchorBounds.top - gap - margin);
    const placeAbove = naturalHeight > belowSpace && aboveSpace > belowSpace;
    const availableSpace = placeAbove ? aboveSpace : belowSpace;
    const maxHeight = Math.min(naturalHeight, availableSpace);
    const width = Math.min(popoverBounds.width, window.innerWidth - margin * 2);

    setPosition({
      left: Math.max(margin, Math.min(anchorBounds.left, window.innerWidth - width - margin)),
      top: placeAbove
        ? Math.max(margin, anchorBounds.top - maxHeight - gap)
        : Math.min(anchorBounds.bottom + gap, window.innerHeight - margin - maxHeight),
      maxHeight,
    });
  }, [anchorElement]);

  useLayoutEffect(() => {
    const popover = popoverRef.current;
    if (!popover) {
      return;
    }

    positionPopover();
    window.addEventListener('resize', positionPopover);
    window.addEventListener('scroll', positionPopover, true);
    const resizeObserver = new ResizeObserver(positionPopover);
    resizeObserver.observe(popover);
    const measurementEditor = popover.querySelector('.recipe-measurement-editor');
    if (measurementEditor) {
      resizeObserver.observe(measurementEditor);
    }

    return () => {
      window.removeEventListener('resize', positionPopover);
      window.removeEventListener('scroll', positionPopover, true);
      resizeObserver.disconnect();
    };
  }, [positionPopover]);

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
          openOnFocus={false}
          value={ingredientName}
          onDraftChange={setIngredientName}
          onCommit={setIngredientName}
          onCancel={() => {}}
        />
      </div>
      <label>
        <span>Specifics</span>
        <input type="text" value={detail} onChange={(event) => setDetail(event.target.value)} />
      </label>
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
  onDeleteRequested,
  onRowsChange,
}: {
  ingredients: IngredientOption[];
  picklists: RecipePicklistValue[];
  preparationOptions: string[];
  rows: IngredientRowDraft[];
  validateMeasurements: boolean;
  onDeleteRequested?: (row: IngredientRowDraft) => void;
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
  const [dropOffsets, setDropOffsets] = useState<Map<string, number>>(() => new Map());
  const [dropCommitPending, setDropCommitPending] = useState(false);
  const [settlingSourceId, setSettlingSourceId] = useState<string | null>(null);
  const ingredientTableRef = useRef<HTMLTableElement>(null);
  const pendingFocusCell = useRef<{ rowId: string; field: IngredientField } | null>(null);
  const pendingClickCell = useRef<{ rowId: string; field: IngredientField } | null>(null);
  const pendingDrop = useRef<{
    sourceId: string;
    rowTops: Map<string, number>;
  } | null>(null);
  const promotedRowIds = useRef(new Map<string, string>());
  const rowsRef = useRef(draftRows);
  const reorderDrag = useReorderDrag();
  const dragPreview = reorderDrag.preview;

  useEffect(() => {
    const normalized = ensureTrailingIngredientRow(rows, () =>
      createEmptyIngredientRow('ingredient-placeholder'),
    );
    rowsRef.current = normalized;
    setDraftRows(normalized);
  }, [rows]);

  useLayoutEffect(() => {
    const requestedFocusTarget = pendingFocusCell.current;
    if (!requestedFocusTarget) {
      return;
    }
    pendingFocusCell.current = null;
    const focusTarget = {
      ...requestedFocusTarget,
      rowId: promotedRowIds.current.get(requestedFocusTarget.rowId) ?? requestedFocusTarget.rowId,
    };
    promotedRowIds.current.delete(requestedFocusTarget.rowId);
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

  useLayoutEffect(() => {
    if (dragPreview) {
      return;
    }
    const pending = pendingDrop.current;
    if (!pending) {
      return;
    }
    pendingDrop.current = null;

    const editor = ingredientTableRef.current?.closest('.recipe-ingredient-editor');
    const offsets = new Map<string, number>();
    for (const row of Array.from(
      editor?.querySelectorAll<HTMLElement>(
        '.recipe-ingredient-mobile-row[data-row-id], .recipe-ingredient-table tbody tr[data-row-id]',
      ) ?? [],
    )) {
      const rowId = row.dataset.rowId;
      const startingTop = rowId ? pending.rowTops.get(rowId) : undefined;
      if (rowId && startingTop !== undefined && row.getBoundingClientRect().height > 0) {
        offsets.set(rowId, startingTop - row.getBoundingClientRect().top);
      }
    }
    if (!offsets.size) {
      setDropCommitPending(false);
      return;
    }

    setDropOffsets(offsets);
    setDropCommitPending(false);
    const canAnimate = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setSettlingSourceId(
      canAnimate && Math.abs(offsets.get(pending.sourceId) ?? 0) > 0.5 ? pending.sourceId : null,
    );
    window.requestAnimationFrame(() => setDropOffsets(new Map()));
  }, [dragPreview]);

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

    if (onDeleteRequested) {
      onDeleteRequested(row);
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

    const persistedRowId =
      field === 'ingredientName' && value.trim() && rowId === 'ingredient-placeholder'
        ? crypto.randomUUID()
        : rowId;
    if (pendingFocusCell.current?.rowId === rowId && persistedRowId !== rowId) {
      pendingFocusCell.current = { ...pendingFocusCell.current, rowId: persistedRowId };
    }
    if (persistedRowId !== rowId) {
      promotedRowIds.current.set(rowId, persistedRowId);
    }
    const updatedRows = currentRows.map((row) =>
      row.id === rowId
        ? {
            ...row,
            id: persistedRowId,
            [field]: value,
            ...(field === 'ingredientName'
              ? {
                  ingredientId:
                    ingredients.find(
                      (ingredient) =>
                        ingredient.name.toLocaleLowerCase() === value.toLocaleLowerCase(),
                    )?.id ?? null,
                }
              : {}),
          }
        : row,
    );
    const clickedCell = pendingClickCell.current;
    pendingClickCell.current = null;
    commitRows(updatedRows);
    setActiveCell(
      clickedCell
        ? {
            ...clickedCell,
            rowId: promotedRowIds.current.get(clickedCell.rowId) ?? clickedCell.rowId,
          }
        : null,
    );
  };

  const focusNextCell = (rowId: string, field: IngredientField) => {
    const persistedRowId = promotedRowIds.current.get(rowId) ?? rowId;
    const currentIndex = rowsRef.current.findIndex((row) => row.id === persistedRowId);
    if (currentIndex < 0) {
      return;
    }

    if (field === 'ingredientName') {
      pendingFocusCell.current = { rowId: persistedRowId, field: 'detail' };
      return;
    }

    if (field === 'preparation') {
      const nextRow = rowsRef.current[currentIndex + 1];
      pendingFocusCell.current = nextRow ? { rowId: nextRow.id, field: 'ingredientName' } : null;
    }
  };

  const moveRow = (rowId: string, direction: 'up' | 'down') => {
    const currentIndex = rowsRef.current.findIndex((row) => row.id === rowId);
    const targetIndex = currentIndex + (direction === 'up' ? -1 : 1);
    if (
      currentIndex < 0 ||
      targetIndex < 0 ||
      targetIndex >= rowsRef.current.length ||
      isEmptyIngredientRow(rowsRef.current[targetIndex])
    ) {
      return;
    }
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

  const commitDraggedRow = (sourceRowId: string, targetRowId: string) => {
    if (!sourceRowId || sourceRowId === targetRowId) {
      return;
    }
    const nextRows = moveIngredientRowTo(rowsRef.current, sourceRowId, targetRowId);
    if (nextRows === rowsRef.current) {
      return;
    }
    const newIndex = nextRows.findIndex((row) => row.id === sourceRowId);
    setAnnouncement(
      `${nextRows[newIndex]?.ingredientName || 'Ingredient'} moved to row ${newIndex + 1}.`,
    );
    commitRows(nextRows);
  };

  function getReorderState(rowId: string) {
    if (!dragPreview) {
      return undefined;
    }
    if (dragPreview.sourceId === rowId) {
      return 'dragging';
    }
    const sourceIndex = draftRows.findIndex((row) => row.id === dragPreview.sourceId);
    const targetIndex = draftRows.findIndex((row) => row.id === dragPreview.targetId);
    const rowIndex = draftRows.findIndex((row) => row.id === rowId);
    if (
      (sourceIndex < targetIndex && rowIndex > sourceIndex && rowIndex <= targetIndex) ||
      (sourceIndex > targetIndex && rowIndex >= targetIndex && rowIndex < sourceIndex)
    ) {
      return 'displaced';
    }
    return undefined;
  }

  function getReorderTransform(rowId: string, alignToSlot = false) {
    if (!dragPreview) {
      const dropOffset = dropOffsets.get(rowId);
      return dropOffset === undefined ? undefined : `translateY(${dropOffset}px)`;
    }
    if (dragPreview.sourceId === rowId) {
      return `translateY(${alignToSlot ? dragPreview.slotOffset : dragPreview.pointerOffset}px)`;
    }
    if (getReorderState(rowId) !== 'displaced') {
      return undefined;
    }
    const sourceIndex = draftRows.findIndex((row) => row.id === dragPreview.sourceId);
    const targetIndex = draftRows.findIndex((row) => row.id === dragPreview.targetId);
    return `translateY(${sourceIndex < targetIndex ? -dragPreview.offset : dragPreview.offset}px)`;
  }

  function getReorderTransition(rowId: string) {
    return dragPreview?.sourceId === rowId && dragPreview.targetId !== rowId
      ? 'transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1)'
      : undefined;
  }

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
      field === 'ingredientName' ? 'Ingredient' : field === 'detail' ? 'Specifics' : 'Preparation';
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
        onMouseDown={() => {
          pendingClickCell.current = { rowId: row.id, field };
        }}
        onClick={() => {
          pendingClickCell.current = null;
          setActiveCell({ rowId: promotedRowIds.current.get(row.id) ?? row.id, field });
        }}
        onKeyDown={handleGridKeyDown}
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
          <span className="recipe-ingredient-cell-value">
            {isEmptyIngredientRow(row) && field === 'ingredientName' ? (
              <span className="recipe-ingredient-empty-prompt">add ingredient</span>
            ) : (
              displayValue
            )}
          </span>
        )}
      </td>
    );
  }

  function renderMeasurementCell(row: IngredientRowDraft, rowIndex: number) {
    return (
      <MeasurementEditor
        layout="desktop"
        rowNumber={rowIndex + 1}
        measurements={row.measurements}
        picklists={picklists}
        validate={validateMeasurements}
        onChange={(measurements) =>
          commitRows(updateIngredientRow(rowsRef.current, row.id, { measurements }))
        }
      />
    );
  }

  function renderRailRow(row: IngredientRowDraft, index: number, isNestedMobileRail = false) {
    const reorderState = isNestedMobileRail
      ? undefined
      : (getReorderState(row.id) ?? (settlingSourceId === row.id ? 'settling' : undefined));
    return (
      <div
        className="recipe-ingredient-rail-row"
        data-reorder-state={reorderState}
        data-row-id={row.id}
        key={row.id}
        style={{
          transform: isNestedMobileRail ? undefined : getReorderTransform(row.id),
          transition:
            !isNestedMobileRail && (dropCommitPending || dropOffsets.has(row.id))
              ? 'none'
              : undefined,
        }}
        onTransitionEnd={(event) => {
          if (event.propertyName === 'transform' && settlingSourceId === row.id) {
            setSettlingSourceId(null);
          }
        }}
      >
        <button
          aria-label={`Reorder ingredient row ${index + 1}`}
          className="recipe-ingredient-drag-handle"
          type="button"
          title="Drag to reorder. Use Ctrl+Up or Ctrl+Down to move by keyboard."
          onPointerDown={(event) => {
            if (isEmptyIngredientRow(row) || event.button !== 0) {
              return;
            }
            const visibleTableRow = Array.from(
              ingredientTableRef.current?.querySelectorAll<HTMLTableRowElement>(
                'tbody tr[data-row-id]',
              ) ?? [],
            ).find((tableRow) => tableRow.dataset.rowId === row.id && tableRow.offsetHeight > 0);
            const sourceElement =
              visibleTableRow ??
              event.currentTarget.closest<HTMLElement>('.recipe-ingredient-mobile-row') ??
              event.currentTarget.closest<HTMLElement>('.recipe-ingredient-rail-row');
            const visibleRows = visibleTableRow
              ? Array.from(
                  ingredientTableRef.current?.querySelectorAll<HTMLTableRowElement>(
                    'tbody tr[data-row-id]',
                  ) ?? [],
                ).filter((tableRow) => tableRow.getBoundingClientRect().height > 0)
              : Array.from(
                  event.currentTarget
                    .closest('.recipe-ingredient-editor')
                    ?.querySelectorAll<HTMLElement>('.recipe-ingredient-mobile-row[data-row-id]') ??
                    [],
                );
            const rowBounds = visibleRows.flatMap((visibleRow) => {
              const ingredientRow = rowsRef.current.find(
                (currentRow) => currentRow.id === visibleRow.dataset.rowId,
              );
              if (!ingredientRow || isEmptyIngredientRow(ingredientRow)) {
                return [];
              }
              const bounds = visibleRow.getBoundingClientRect();
              return [
                {
                  id: visibleRow.dataset.rowId ?? '',
                  top: bounds.top + window.scrollY,
                  bottom: bounds.bottom + window.scrollY,
                },
              ];
            });
            reorderDrag.start(
              row.id,
              event.clientY,
              sourceElement?.getBoundingClientRect().height || 48,
              rowBounds,
            );
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => reorderDrag.move(event.clientY)}
          onPointerUp={(event) => {
            const hitTargetRowId = document
              .elementFromPoint(event.clientX, event.clientY)
              ?.closest<HTMLElement>('[data-row-id]')?.dataset.rowId;
            const hitTargetRow = rowsRef.current.find(
              (currentRow) => currentRow.id === hitTargetRowId && !isEmptyIngredientRow(currentRow),
            );
            const draggedRow = reorderDrag.finish(hitTargetRow?.id);
            if (draggedRow && draggedRow.sourceId !== draggedRow.targetId) {
              const layoutRows = Array.from(
                event.currentTarget
                  .closest('.recipe-ingredient-editor')
                  ?.querySelectorAll<HTMLElement>(
                    '.recipe-ingredient-mobile-row[data-row-id], .recipe-ingredient-table tbody tr[data-row-id]',
                  ) ?? [],
              ).filter((layoutRow) => layoutRow.getBoundingClientRect().height > 0);
              if (layoutRows.length) {
                pendingDrop.current = {
                  sourceId: draggedRow.sourceId,
                  rowTops: new Map(
                    layoutRows.flatMap((layoutRow) => {
                      const rowId = layoutRow.dataset.rowId;
                      return rowId ? [[rowId, layoutRow.getBoundingClientRect().top] as const] : [];
                    }),
                  ),
                };
                setDropCommitPending(true);
              }
              commitDraggedRow(draggedRow.sourceId, draggedRow.targetId);
            }
          }}
          onPointerCancel={(event) => {
            reorderDrag.cancel();
            event.currentTarget.focus();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && reorderDrag.preview) {
              event.preventDefault();
              reorderDrag.cancel();
              event.currentTarget.focus();
            } else if (event.ctrlKey && event.key === 'ArrowUp') {
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
        {draftRows.map((row, index) => renderRailRow(row, index))}
      </fieldset>
    );
  }

  function submitMobileRow(row: IngredientRowDraft) {
    const submittedRow =
      row.id === 'ingredient-placeholder' && row.ingredientName.trim()
        ? { ...row, id: crypto.randomUUID() }
        : row;
    const rowExists = rowsRef.current.some((current) => current.id === row.id);
    const nextRows = submittedRow.ingredientName.trim()
      ? rowExists
        ? updateIngredientRow(rowsRef.current, row.id, submittedRow)
        : [...rowsRef.current, submittedRow]
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
            <colgroup>
              <col className="recipe-ingredient-name-col" />
              <col className="recipe-ingredient-detail-col" />
              <col className="recipe-ingredient-type-col" />
              <col className="recipe-ingredient-measurements-col" />
              <col className="recipe-ingredient-preparation-col" />
              <col className="recipe-ingredient-actions-col" />
            </colgroup>
            <thead>
              <tr>
                <th className="recipe-ingredient-name-column" scope="col">
                  Ingredient
                </th>
                <th scope="col">Specifics</th>
                <th className="recipe-ingredient-amount-group" colSpan={2} scope="colgroup">
                  Amount
                </th>
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
                  data-reorder-state={
                    getReorderState(row.id) ??
                    (settlingSourceId === row.id ? 'settling' : undefined)
                  }
                  key={row.id}
                  style={{
                    transform: getReorderTransform(row.id),
                    transition: dropCommitPending || dropOffsets.has(row.id) ? 'none' : undefined,
                  }}
                  onTransitionEnd={(event) => {
                    if (event.propertyName === 'transform' && settlingSourceId === row.id) {
                      setSettlingSourceId(null);
                    }
                  }}
                >
                  {isEmptyIngredientRow(row) && activeCell?.rowId !== row.id ? (
                    <td
                      aria-label="Add ingredient row"
                      className="recipe-ingredient-value-cell is-empty"
                      colSpan={6}
                      data-field="ingredientName"
                      data-row-id={row.id}
                      tabIndex={activeCell?.rowId === row.id ? -1 : 0}
                      onMouseDown={() => {
                        pendingClickCell.current = { rowId: row.id, field: 'ingredientName' };
                      }}
                      onClick={() => {
                        pendingClickCell.current = null;
                        setActiveCell({
                          rowId: promotedRowIds.current.get(row.id) ?? row.id,
                          field: 'ingredientName',
                        });
                      }}
                      onKeyDown={handleGridKeyDown}
                    >
                      <span className="recipe-ingredient-empty-prompt">add ingredient</span>
                    </td>
                  ) : (
                    <>
                      {renderDesktopCell(row, index, 'ingredientName')}
                      {renderDesktopCell(row, index, 'detail')}
                      {renderMeasurementCell(row, index)}
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
                    </>
                  )}
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
                data-reorder-state={
                  getReorderState(row.id) ?? (settlingSourceId === row.id ? 'settling' : undefined)
                }
                key={row.id}
                style={{
                  transform: getReorderTransform(row.id, true),
                  transition:
                    dropCommitPending || dropOffsets.has(row.id)
                      ? 'none'
                      : getReorderTransition(row.id),
                }}
                onTransitionEnd={(event) => {
                  if (event.propertyName === 'transform' && settlingSourceId === row.id) {
                    setSettlingSourceId(null);
                  }
                }}
              >
                <td className="recipe-ingredient-mobile-rail">{renderRailRow(row, index, true)}</td>
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
                    {isEmptyIngredientRow(row) ? (
                      <span className="recipe-ingredient-empty-prompt">add ingredient</span>
                    ) : (
                      formatDraftIngredient(row, picklists)
                    )}
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
