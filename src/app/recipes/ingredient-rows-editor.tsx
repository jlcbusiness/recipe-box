'use client';

import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { IngredientOption, RecipePicklistValue } from '../../lib/recipes/data';
import { reconcileDensityIngredientChange } from '../../lib/recipes/density-rules';
import type { IngredientRowDraft, IngredientRowPayload } from '../../lib/recipes/ingredient-rules';
import {
  allocatePortions,
  formatIngredientDisplay,
  getPortionRatio,
  isEmptyIngredientRow,
  moveIngredientRow,
  validateIngredientSize,
  validatePortionMeasurements,
} from '../../lib/recipes/ingredient-rules';
import {
  type IngredientSetDraft,
  normalizeIngredientSets,
} from '../../lib/recipes/ingredient-set-rules';
import {
  formatQuantity,
  formatQuantityInput,
  type MeasurementType,
  parseQuantityInput,
  serializeMeasurements,
  volumeUnits,
  weightUnits,
} from '../../lib/recipes/measurement-rules';
import { createUuid } from '../../lib/uuid';
import { MeasurementEditor } from './measurement-editor';
import { type ReorderDragBound, useReorderDrag } from './use-reorder-drag';

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
type IngredientEditorEntry =
  | { kind: 'section'; key: string; section: IngredientSetDraft; sectionIndex: number }
  | { kind: 'ingredient'; key: string; row: IngredientRowDraft; rowIndex: number }
  | { kind: 'add-ingredient'; key: string; row: IngredientRowDraft; rowIndex: number };

function createEmptyIngredientRow(id = createUuid(), ingredientSetId = ''): IngredientRowDraft {
  return {
    id,
    ingredientSetId,
    ingredientId: null,
    ingredientName: '',
    isMain: false,
    detail: '',
    preparation: '',
    measurements: [],
  };
}

function ingredientPlaceholderId(setId: string, firstSetId: string | undefined) {
  return setId === firstSetId ? 'ingredient-placeholder' : `ingredient-placeholder:${setId}`;
}

function isIngredientPlaceholderId(id: string) {
  return id === 'ingredient-placeholder' || id.startsWith('ingredient-placeholder:');
}

function updateIngredientRow(
  rows: IngredientRowDraft[],
  rowId: string,
  update: Partial<IngredientRowDraft>,
): IngredientRowDraft[] {
  return rows.map((row) => (row.id === rowId ? { ...row, ...update } : row));
}

function preparationMetadata(preparation: string) {
  const normalized = preparation.trim().toLocaleLowerCase();
  return {
    ...(normalized === 'divided'
      ? {}
      : { portionOneRatio: null, portionOneAmount: undefined, portionMeasurementType: undefined }),
    ...(normalized === 'cubed' ? {} : { sizeValue: '', sizeUnit: '' }),
  };
}

function updateSectionElementRef<T extends HTMLElement>(
  refs: Map<string, Set<T>>,
  setId: string,
  element: T | null,
) {
  const elements = refs.get(setId) ?? new Set<T>();
  if (element) {
    elements.add(element);
  } else {
    for (const current of elements) {
      if (!current.isConnected) elements.delete(current);
    }
  }
  if (elements.size) {
    refs.set(setId, elements);
  } else {
    refs.delete(setId);
  }
}

function visibleSectionElement<T extends HTMLElement>(refs: Map<string, Set<T>>, setId: string) {
  return Array.from(refs.get(setId) ?? []).find((element) => element.getClientRects().length > 0);
}

function ensureTrailingIngredientRowPerSet(
  rows: IngredientRowDraft[],
  sets: IngredientSetDraft[],
  createEmpty: (setId: string) => IngredientRowDraft,
): IngredientRowDraft[] {
  const knownSetIds = new Set(sets.map((set) => set.id));
  const sectionRows = sets.flatMap((set) => {
    const rowsInSet = rows.filter((row) => row.ingredientSetId === set.id);
    const populatedRows = rowsInSet.filter((row) => !isEmptyIngredientRow(row));
    const emptyRow = rowsInSet.find(isEmptyIngredientRow) ?? createEmpty(set.id);
    return [...populatedRows, emptyRow];
  });
  return [
    ...sectionRows,
    ...rows.filter((row) => !knownSetIds.has(row.ingredientSetId) && !isEmptyIngredientRow(row)),
  ];
}
function buildIngredientEditorEntries(
  sets: IngredientSetDraft[],
  rows: IngredientRowDraft[],
): IngredientEditorEntry[] {
  return sets.flatMap((section, sectionIndex) => [
    {
      kind: 'section' as const,
      key: `section-${section.id}`,
      section,
      sectionIndex,
    },
    ...rows
      .filter((row) => row.ingredientSetId === section.id)
      .map((row): IngredientEditorEntry => {
        const rowIndex = rows.indexOf(row);
        return isEmptyIngredientRow(row)
          ? { kind: 'add-ingredient', key: row.id, row, rowIndex }
          : { kind: 'ingredient', key: row.id, row, rowIndex };
      }),
  ]);
}

function getReorderEntryId(element: HTMLElement) {
  if (element.dataset.reorderEntryId) {
    return element.dataset.reorderEntryId;
  }
  if (element.dataset.rowId) {
    return element.dataset.rowId;
  }
  return element.dataset.ingredientSetId ? `section-${element.dataset.ingredientSetId}` : undefined;
}

function getVisibleReorderEntries(editor: Element) {
  const layout = [
    editor.querySelector<HTMLElement>('.recipe-ingredient-table'),
    editor.querySelector<HTMLElement>('.recipe-ingredient-mobile-list'),
  ].find((table) => table && table.getBoundingClientRect().height > 0);
  return Array.from(
    layout?.querySelectorAll<HTMLElement>(
      'tbody tr[data-row-id], tbody tr.recipe-ingredient-set-divider[data-ingredient-set-id], tbody tr[data-reorder-entry-id]',
    ) ?? [],
  );
}

function formatDraftIngredient(
  row: IngredientRowDraft,
  picklists: RecipePicklistValue[] = [],
): string {
  return formatIngredientDisplay({
    ingredient_name: row.ingredientName,
    detail: row.detail,
    preparation: row.preparation,
    size_value: row.sizeValue?.trim() ? Number(row.sizeValue) : null,
    size_unit: row.sizeUnit === 'in' || row.sizeUnit === 'cm' ? row.sizeUnit : null,
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

function firstDivisibleMeasurement(row: IngredientRowDraft): MeasurementType | undefined {
  return (['volume', 'weight', 'count', 'informal'] as const).find((type) =>
    row.measurements.some((measurement) => measurement.type === type),
  );
}

function PortionEditor({
  row,
  rowNumber,
  picklists,
  onChange,
}: {
  row: IngredientRowDraft;
  rowNumber: number;
  picklists: RecipePicklistValue[];
  onChange: (update: Partial<IngredientRowDraft>) => void;
}) {
  let serializedMeasurements: IngredientRowPayload['measurements'] = [];
  try {
    serializedMeasurements = serializeMeasurements(row.measurements);
  } catch {
    serializedMeasurements = [];
  }
  const canDivide = validatePortionMeasurements(serializedMeasurements, 0.5) === null;
  const selectedType = row.portionMeasurementType ?? firstDivisibleMeasurement(row);
  const measurement = serializedMeasurements.find((item) => item.measurement_type === selectedType);
  const total = measurement?.amount_min ?? null;
  const parsedFirst =
    row.portionOneAmount === undefined ? null : parseQuantityInput(row.portionOneAmount);
  const firstAmount =
    parsedFirst?.maximum === null && parsedFirst
      ? parsedFirst.minimum
      : total != null && row.portionOneRatio != null
        ? total * row.portionOneRatio
        : null;
  const ratio = firstAmount !== null && total !== null ? getPortionRatio(firstAmount, total) : null;
  const portions = ratio === null || total === null ? null : allocatePortions(total, ratio);
  const measurementDraft = row.measurements.find((item) => item.type === selectedType);
  const measurementSystem =
    selectedType === 'volume'
      ? volumeUnits.find((unit) => unit.code === measurementDraft?.unitCode)?.system
      : selectedType === 'weight'
        ? weightUnits.find((unit) => unit.code === measurementDraft?.unitCode)?.system
        : undefined;
  const unitLabel =
    selectedType === 'volume'
      ? volumeUnits.find((unit) => unit.code === measurementDraft?.unitCode)?.abbreviation
      : selectedType === 'weight'
        ? weightUnits.find((unit) => unit.code === measurementDraft?.unitCode)?.abbreviation
        : selectedType === 'informal'
          ? picklists.find((option) => option.id === measurementDraft?.picklistValueId)?.value
          : null;
  const remainderText =
    portions && total !== null
      ? `${formatQuantity(portions[1], measurementSystem)}${unitLabel ? ` ${unitLabel}` : ''}`
      : '';
  const remainderParts = remainderText.split(/([½⅓⅔¼¾⅛⅜⅝⅞])/u);

  if (!canDivide) {
    return (
      <span className="recipe-preparation-control-error" role="alert">
        Only scalar Unit, Count, and Things amounts can be divided.
      </span>
    );
  }

  return (
    <fieldset aria-label={`Portion controls, row ${rowNumber}`} className="recipe-portion-editor">
      <input
        aria-label={`First portion, row ${rowNumber}`}
        aria-invalid={row.portionOneAmount !== undefined && ratio === null}
        className="recipe-portion-input"
        inputMode="text"
        value={
          row.portionOneAmount ??
          (row.portionOneRatio != null && total != null
            ? formatQuantityInput(String(total * row.portionOneRatio))
            : '')
        }
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
        onChange={(event) => {
          const value = event.target.value;
          const parsed = parseQuantityInput(value);
          const nextRatio =
            parsed?.maximum === null && total !== null
              ? getPortionRatio(parsed.minimum, total)
              : null;
          onChange({
            portionOneAmount: value,
            portionOneRatio: nextRatio ?? row.portionOneRatio,
            portionMeasurementType: selectedType,
          });
        }}
      />
      {unitLabel && <span className="recipe-preparation-unit">{unitLabel}</span>}
      <span aria-hidden="true" className="recipe-portion-separator">
        :
      </span>
      <span
        aria-label={`Second portion, row ${rowNumber}`}
        aria-live="polite"
        className="recipe-portion-remainder"
        role="status"
      >
        {remainderParts.map((part) =>
          /^[½⅓⅔¼¾⅛⅜⅝⅞]$/u.test(part) ? (
            <span className="recipe-portion-fraction" key={part}>
              {part}
            </span>
          ) : (
            part
          ),
        )}
      </span>
    </fieldset>
  );
}

function IngredientSizeEditor({
  preparation,
  sizeValue,
  sizeUnit,
  rowNumber,
  onChange,
}: {
  preparation: string;
  sizeValue: string;
  sizeUnit: string;
  rowNumber: number;
  onChange: (update: Pick<IngredientRowDraft, 'sizeValue' | 'sizeUnit'>) => void;
}) {
  if (preparation.trim().toLocaleLowerCase() !== 'cubed') {
    return null;
  }
  const error = validateIngredientSize(
    preparation,
    sizeValue,
    sizeValue.trim() ? sizeUnit || 'in' : '',
  );
  const activeUnit = sizeUnit || 'in';
  const nextUnit = activeUnit === 'in' ? 'cm' : 'in';
  return (
    <fieldset
      aria-label={`Size controls, row ${rowNumber}`}
      className="recipe-ingredient-size-editor"
    >
      <input
        aria-label={`Size, row ${rowNumber}`}
        aria-invalid={Boolean(error) || undefined}
        className="recipe-inline-size-input"
        inputMode="decimal"
        type="text"
        value={sizeValue}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        onChange={(event) =>
          onChange({
            sizeValue: event.target.value,
            sizeUnit: event.target.value.trim() ? sizeUnit || 'in' : '',
          })
        }
      />
      <button
        aria-label={`Size unit, row ${rowNumber}: ${activeUnit}. Activate to switch to ${nextUnit}`}
        className="recipe-inline-size-unit"
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onChange({ sizeUnit: nextUnit });
        }}
        onKeyDown={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {activeUnit}
      </button>
    </fieldset>
  );
}

function PreparationControls({
  row,
  preparation,
  picklists,
  rowNumber,
  onChange,
}: {
  row: IngredientRowDraft;
  preparation: string;
  picklists: RecipePicklistValue[];
  rowNumber: number;
  onChange: (update: Partial<IngredientRowDraft>) => void;
}) {
  const normalized = preparation.trim().toLocaleLowerCase();
  const showPortions = normalized === 'divided';

  if (!showPortions && normalized !== 'cubed') {
    return null;
  }

  return (
    <div className="recipe-preparation-controls">
      {showPortions && (
        <PortionEditor row={row} picklists={picklists} rowNumber={rowNumber} onChange={onChange} />
      )}
      {normalized === 'cubed' && (
        <IngredientSizeEditor
          preparation={preparation}
          sizeValue={row.sizeValue ?? ''}
          sizeUnit={row.sizeUnit ?? ''}
          rowNumber={rowNumber}
          onChange={onChange}
        />
      )}
    </div>
  );
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
  onEnterCommit,
  onCancel,
  onDraftChange,
  onTabCommit,
  placement = 'above',
  focusOnMount = true,
  openOnFocus = true,
  fitContent = false,
}: {
  label: string;
  value: string;
  options: string[];
  initialCharacter?: string;
  onCommit: (value: string) => void;
  onEnterCommit?: (value: string) => void;
  onCancel: () => void;
  onDraftChange?: (value: string) => void;
  onTabCommit?: () => void;
  placement?: 'above' | 'below';
  focusOnMount?: boolean;
  openOnFocus?: boolean;
  fitContent?: boolean;
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
    <div className={`ingredient-cell-editor${fitContent ? ' is-fit-content' : ''}`}>
      <input
        aria-activedescendant={
          isOpen && suggestions.length ? `${listId}-${activeIndex}` : undefined
        }
        aria-autocomplete="list"
        aria-controls={isOpen && suggestions.length ? listId : undefined}
        aria-expanded={isOpen && suggestions.length > 0}
        aria-label={label}
        autoComplete="off"
        className={`ingredient-cell-input${fitContent ? ' is-fit-content' : ''}`}
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
  onEnterCommit,
  onCancel,
}: {
  label: string;
  value: string;
  initialCharacter?: string;
  onCommit: (value: string) => void;
  onEnterCommit?: (value: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initialCharacter ?? value);
  const inputRef = useRef<HTMLInputElement>(null);
  const skipBlurCommit = useRef(false);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <input
      aria-label={label}
      className="ingredient-cell-input"
      ref={inputRef}
      value={draft}
      onBlur={() => {
        if (skipBlurCommit.current) {
          skipBlurCommit.current = false;
        } else {
          onCommit(draft.trim());
        }
      }}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          event.stopPropagation();
          skipBlurCommit.current = true;
          if (onEnterCommit) {
            onEnterCommit(draft.trim());
          } else {
            onCommit(draft.trim());
          }
        } else if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          onCancel();
        }
      }}
    />
  );
}

function PreparationCellEditor({
  row,
  rowNumber,
  options,
  picklists,
  onCommit,
  onEnterCommit,
  onCancel,
  onChange,
}: {
  row: IngredientRowDraft;
  rowNumber: number;
  options: string[];
  picklists: RecipePicklistValue[];
  onCommit: (value: string) => void;
  onEnterCommit: (value: string) => void;
  onCancel: () => void;
  onChange: (update: Partial<IngredientRowDraft>) => void;
}) {
  const [preparation, setPreparation] = useState(row.preparation);

  useEffect(() => {
    setPreparation(row.preparation);
  }, [row.preparation]);

  return (
    <div className="recipe-preparation-editor">
      <SuggestionCellEditor
        label={`Preparation, row ${rowNumber}`}
        options={options}
        value={row.preparation}
        fitContent
        onDraftChange={setPreparation}
        onCommit={onCommit}
        onEnterCommit={onEnterCommit}
        onCancel={onCancel}
      />
      <PreparationControls
        row={row}
        preparation={preparation}
        picklists={picklists}
        rowNumber={rowNumber}
        onChange={onChange}
      />
    </div>
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
  const [portionOneRatio, setPortionOneRatio] = useState(row.portionOneRatio ?? null);
  const [portionOneAmount, setPortionOneAmount] = useState(row.portionOneAmount);
  const [portionMeasurementType, setPortionMeasurementType] = useState(row.portionMeasurementType);
  const [sizeValue, setSizeValue] = useState(row.sizeValue ?? '');
  const [sizeUnit, setSizeUnit] = useState(row.sizeUnit ?? '');
  const measurementsRef = useRef(row.measurements);
  const [position, setPosition] = useState<{ left: number; top: number; maxHeight: number } | null>(
    null,
  );
  const popoverRef = useRef<HTMLDivElement>(null);

  function updateMobileMeasurements(nextMeasurements: IngredientRowDraft['measurements']) {
    measurementsRef.current = nextMeasurements;
    setMeasurements(nextMeasurements);
  }

  function updateMobilePortion(update: Partial<IngredientRowDraft>) {
    if (Object.hasOwn(update, 'portionOneRatio')) {
      setPortionOneRatio(update.portionOneRatio ?? null);
    }
    if (Object.hasOwn(update, 'portionOneAmount')) {
      setPortionOneAmount(update.portionOneAmount);
    }
    if (Object.hasOwn(update, 'portionMeasurementType')) {
      setPortionMeasurementType(update.portionMeasurementType);
    }
  }

  function densityForName(name: string) {
    return ingredients.find(
      (ingredient) => ingredient.name.toLocaleLowerCase() === name.trim().toLocaleLowerCase(),
    )?.density;
  }

  function changeIngredientName(name: string) {
    setIngredientName(name);
    const nextMeasurements = reconcileDensityIngredientChange(
      measurementsRef.current,
      densityForName(name),
    );
    updateMobileMeasurements(nextMeasurements);
  }

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
      ingredientId:
        ingredients.find(
          (ingredient) =>
            ingredient.name.toLocaleLowerCase() === ingredientName.trim().toLocaleLowerCase(),
        )?.id ?? null,
      ingredientName: ingredientName.trim(),
      detail: detail.trim(),
      preparation: preparation.trim(),
      measurements: measurementsRef.current,
      portionOneRatio,
      portionOneAmount,
      portionMeasurementType,
      sizeValue,
      sizeUnit,
      ...preparationMetadata(preparation),
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
          onDraftChange={changeIngredientName}
          onCommit={changeIngredientName}
          onEnterCommit={(value) => {
            const nextName = value.trim();
            const nextMeasurements = reconcileDensityIngredientChange(
              measurements,
              densityForName(nextName),
            );
            onSubmit({
              ...row,
              ingredientId:
                ingredients.find(
                  (ingredient) =>
                    ingredient.name.toLocaleLowerCase() === nextName.toLocaleLowerCase(),
                )?.id ?? null,
              ingredientName: nextName,
              detail: detail.trim(),
              preparation: preparation.trim(),
              measurements: nextMeasurements,
              portionOneRatio,
              portionOneAmount,
              portionMeasurementType,
              sizeValue,
              sizeUnit,
            });
          }}
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
          density={densityForName(ingredientName)}
          validate={validateMeasurements}
          onChange={updateMobileMeasurements}
          onUnitFocus={setPortionMeasurementType}
          onCommitRow={submit}
        />
      </div>
      <div className="recipe-mobile-picker-field recipe-mobile-preparation-field">
        <span>Preparation</span>
        <SuggestionCellEditor
          label="Preparation"
          options={preparationOptions}
          placement="above"
          focusOnMount={false}
          value={preparation}
          onDraftChange={setPreparation}
          onCommit={setPreparation}
          onEnterCommit={(value) => {
            onSubmit({
              ...row,
              ingredientId:
                ingredients.find(
                  (ingredient) =>
                    ingredient.name.toLocaleLowerCase() ===
                    ingredientName.trim().toLocaleLowerCase(),
                )?.id ?? null,
              ingredientName: ingredientName.trim(),
              detail: detail.trim(),
              preparation: value.trim(),
              measurements,
              portionOneRatio,
              portionOneAmount,
              portionMeasurementType,
              sizeValue,
              sizeUnit,
              ...preparationMetadata(value),
            });
          }}
          onCancel={() => {}}
        />
        <PreparationControls
          row={{
            ...row,
            measurements,
            portionOneRatio,
            portionOneAmount,
            portionMeasurementType,
            sizeValue,
            sizeUnit,
          }}
          preparation={preparation}
          picklists={picklists}
          rowNumber={rowNumber}
          onChange={(update) => {
            updateMobilePortion(update);
            if (update.sizeValue !== undefined) setSizeValue(update.sizeValue);
            if (update.sizeUnit !== undefined) setSizeUnit(update.sizeUnit);
          }}
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
  ingredientSets,
  onIngredientSetsChange,
  onRemoveSetRequested,
  picklists,
  preparationOptions,
  rows,
  validateMeasurements,
  onDeleteRequested,
  onRowsChange,
}: {
  ingredients: IngredientOption[];
  ingredientSets: IngredientSetDraft[];
  onIngredientSetsChange: (sets: IngredientSetDraft[]) => void;
  onRemoveSetRequested: (setId: string) => boolean;
  picklists: RecipePicklistValue[];
  preparationOptions: string[];
  rows: IngredientRowDraft[];
  validateMeasurements: boolean;
  onDeleteRequested?: (row: IngredientRowDraft) => void;
  onRowsChange: (rows: IngredientRowDraft[]) => void;
}) {
  const [draftRows, setDraftRows] = useState(() =>
    ensureTrailingIngredientRowPerSet(rows, ingredientSets, (setId) =>
      createEmptyIngredientRow(ingredientPlaceholderId(setId, ingredientSets[0]?.id), setId),
    ),
  );
  const [activeCell, setActiveCell] = useState<{
    rowId: string;
    field: IngredientField;
    initialCharacter?: string;
  } | null>(null);
  const [mobileEditingRowId, setMobileEditingRowId] = useState<string | null>(null);
  const [mobileAnchorElement, setMobileAnchorElement] = useState<HTMLButtonElement | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [editingSetId, setEditingSetId] = useState<string | null>(null);
  const [setLabelDraft, setSetLabelDraft] = useState('');
  const setLabelInputRefs = useRef(new Map<string, Set<HTMLInputElement>>());
  const setTitleButtonRefs = useRef(new Map<string, Set<HTMLButtonElement>>());
  const [pendingSetTitleFocusId, setPendingSetTitleFocusId] = useState<string | null>(null);
  const [dropOffsets, setDropOffsets] = useState<Map<string, number>>(() => new Map());
  const [dropCommitPending, setDropCommitPending] = useState(false);
  const [settlingSourceId, setSettlingSourceId] = useState<string | null>(null);
  const ingredientTableRef = useRef<HTMLTableElement>(null);
  const controlRailRef = useRef<HTMLFieldSetElement>(null);
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
  const editorEntries = buildIngredientEditorEntries(ingredientSets, draftRows);

  useEffect(() => {
    const normalized = ensureTrailingIngredientRowPerSet(rows, ingredientSets, (setId) =>
      createEmptyIngredientRow(ingredientPlaceholderId(setId, ingredientSets[0]?.id), setId),
    );
    rowsRef.current = normalized;
    setDraftRows(normalized);
    if (
      normalized.length !== rows.length ||
      normalized.some((row, index) => row.id !== rows[index]?.id)
    ) {
      onRowsChange(normalized);
    }
  }, [rows, ingredientSets, onRowsChange]);

  useLayoutEffect(() => {
    const table = ingredientTableRef.current;
    const controlRail = controlRailRef.current;
    if (!table || !controlRail) {
      return;
    }

    const syncControlRailHeights = () => {
      const tableHeader = table.querySelector<HTMLElement>('thead tr');
      const railHeader = controlRail.querySelector<HTMLElement>('.recipe-ingredient-rail-header');
      if (tableHeader && railHeader) {
        const height = tableHeader.getBoundingClientRect().height;
        railHeader.style.height = `${height}px`;
        railHeader.style.flexBasis = `${height}px`;
      }

      const sectionSpacers = new Map(
        Array.from(
          controlRail.querySelectorAll<HTMLElement>(
            '.recipe-ingredient-rail-section-spacer[data-ingredient-set-id]',
          ),
        ).map((element) => [element.dataset.ingredientSetId ?? '', element]),
      );
      const ingredientRows = new Map(
        Array.from(
          controlRail.querySelectorAll<HTMLElement>('.recipe-ingredient-rail-row[data-row-id]'),
        ).map((element) => [element.dataset.rowId ?? '', element]),
      );

      for (const tableRow of Array.from(table.querySelectorAll<HTMLElement>('tbody tr'))) {
        const height = tableRow.getBoundingClientRect().height;
        if (height <= 0) {
          continue;
        }
        const railElement = tableRow.classList.contains('recipe-ingredient-set-divider')
          ? sectionSpacers.get(tableRow.dataset.ingredientSetId ?? '')
          : ingredientRows.get(tableRow.dataset.rowId ?? '');
        if (railElement && Math.abs(railElement.getBoundingClientRect().height - height) > 0.5) {
          railElement.style.height = `${height}px`;
          railElement.style.flexBasis = `${height}px`;
        }
      }
    };

    const resizeObserver = new ResizeObserver(syncControlRailHeights);
    const observeTableRows = () => {
      for (const row of Array.from(table.querySelectorAll('thead tr, tbody tr'))) {
        resizeObserver.observe(row);
      }
      syncControlRailHeights();
    };
    const mutationObserver = new MutationObserver(observeTableRows);
    mutationObserver.observe(table, { childList: true, subtree: true });
    observeTableRows();
    return () => {
      mutationObserver.disconnect();
      resizeObserver.disconnect();
    };
  }, []);

  useLayoutEffect(() => {
    if (editingSetId) {
      const input = visibleSectionElement(setLabelInputRefs.current, editingSetId);
      input?.focus();
      input?.select();
      return;
    }
    const pendingSetId = pendingSetTitleFocusId;
    if (pendingSetId) {
      visibleSectionElement(setTitleButtonRefs.current, pendingSetId)?.focus();
      setPendingSetTitleFocusId(null);
    }
  }, [editingSetId, pendingSetTitleFocusId]);

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
    for (const entry of editor ? getVisibleReorderEntries(editor) : []) {
      const entryId = getReorderEntryId(entry);
      const startingTop = entryId ? pending.rowTops.get(entryId) : undefined;
      if (entryId && startingTop !== undefined && entry.getBoundingClientRect().height > 0) {
        offsets.set(entryId, startingTop - entry.getBoundingClientRect().top);
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
    if (canAnimate) {
      window.requestAnimationFrame(() =>
        window.requestAnimationFrame(() => setDropOffsets(new Map())),
      );
    } else {
      setDropOffsets(new Map());
    }
  }, [dragPreview]);

  const commitRows = (nextRows: IngredientRowDraft[]) => {
    const normalized = ensureTrailingIngredientRowPerSet(nextRows, ingredientSets, (setId) =>
      createEmptyIngredientRow(createUuid(), setId),
    );
    rowsRef.current = normalized;
    setDraftRows(normalized);
    onRowsChange(normalized);
    return normalized;
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

  const focusTrailingAddRow = () => {
    const trailingRow = rowsRef.current.find((candidate) => isEmptyIngredientRow(candidate));
    if (!trailingRow) {
      return;
    }
    pendingFocusCell.current = { rowId: trailingRow.id, field: 'ingredientName' };
    setActiveCell(null);
    requestAnimationFrame(() => {
      const cells =
        ingredientTableRef.current?.querySelectorAll<HTMLTableCellElement>('[data-field]');
      Array.from(cells ?? [])
        .find(
          (cell) =>
            cell.dataset.rowId === trailingRow.id && cell.dataset.field === 'ingredientName',
        )
        ?.focus();
    });
  };

  const commitCell = (
    rowId: string,
    field: IngredientField,
    value: string,
    reason: 'blur' | 'enter' | 'tab' = 'blur',
  ) => {
    const currentRows = rowsRef.current;
    if (field === 'ingredientName' && !value.trim()) {
      commitRows(currentRows.filter((row) => row.id !== rowId));
      setActiveCell(null);
      return;
    }

    const persistedRowId =
      field === 'ingredientName' && value.trim() && isIngredientPlaceholderId(rowId)
        ? createUuid()
        : rowId;
    if (pendingFocusCell.current?.rowId === rowId && persistedRowId !== rowId) {
      pendingFocusCell.current = { ...pendingFocusCell.current, rowId: persistedRowId };
    }
    if (persistedRowId !== rowId) {
      promotedRowIds.current.set(rowId, persistedRowId);
    }
    const selectedIngredient =
      field === 'ingredientName'
        ? ingredients.find(
            (ingredient) =>
              ingredient.name.toLocaleLowerCase() === value.trim().toLocaleLowerCase(),
          )
        : undefined;
    const updatedRows = currentRows.map((row) =>
      row.id === rowId
        ? {
            ...row,
            id: persistedRowId,
            [field]: value,
            ...(field === 'preparation' ? preparationMetadata(value) : {}),
            ...(field === 'ingredientName'
              ? {
                  ingredientId: selectedIngredient?.id ?? null,
                  measurements:
                    row.ingredientName.trim().toLocaleLowerCase() !==
                    value.trim().toLocaleLowerCase()
                      ? reconcileDensityIngredientChange(
                          row.measurements,
                          selectedIngredient?.density,
                        )
                      : row.measurements,
                }
              : {}),
          }
        : row,
    );
    const clickedCell = pendingClickCell.current;
    pendingClickCell.current = null;
    commitRows(updatedRows);
    if (reason === 'enter' && !clickedCell) {
      const trailingRow = rowsRef.current.find((candidate) => isEmptyIngredientRow(candidate));
      if (trailingRow) {
        pendingFocusCell.current = { rowId: trailingRow.id, field: 'ingredientName' };
      }
    }
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
    const nextRows = moveIngredientRow(rowsRef.current, rowId, direction);
    if (nextRows === rowsRef.current) {
      return;
    }
    const sourceRow = rowsRef.current.find((row) => row.id === rowId);
    const committedRows = commitRows(nextRows);
    const newIndex = committedRows.findIndex((row) => row.id === rowId);
    const movedRow = committedRows[newIndex];
    const sectionLabel = ingredientSets.find((set) => set.id === movedRow?.ingredientSetId)?.label;
    setAnnouncement(
      movedRow?.ingredientSetId !== sourceRow?.ingredientSetId && sectionLabel
        ? `${movedRow?.ingredientName || 'Ingredient'} moved to ${sectionLabel}, row ${newIndex + 1}.`
        : `${movedRow?.ingredientName || 'Ingredient'} moved to row ${newIndex + 1}.`,
    );
  };

  const commitDraggedRow = (sourceRowId: string, projectedOrder: string[]) => {
    if (!sourceRowId || !projectedOrder.includes(sourceRowId)) {
      return;
    }
    const sourceRow = rowsRef.current.find((row) => row.id === sourceRowId);
    if (!sourceRow) {
      return;
    }

    const rowsById = new Map(rowsRef.current.map((row) => [row.id, row]));
    const sectionByEntryId = new Map(
      ingredientSets.map((section) => [`section-${section.id}`, section.id]),
    );
    let currentSetId: string | null = null;
    const orderedRows = projectedOrder.flatMap((entryId) => {
      const sectionId = sectionByEntryId.get(entryId);
      if (sectionId) {
        currentSetId = sectionId;
        return [];
      }
      const row = rowsById.get(entryId);
      if (!row) {
        return [];
      }
      return [{ ...row, ingredientSetId: currentSetId ?? row.ingredientSetId }];
    });
    const orderedRowIds = new Set(orderedRows.map((row) => row.id));
    const nextRows = [
      ...orderedRows,
      ...rowsRef.current.filter((row) => !orderedRowIds.has(row.id)),
    ];
    if (nextRows.every((row, index) => row === rowsRef.current[index])) {
      return;
    }
    const committedRows = commitRows(nextRows);
    const newIndex = committedRows.findIndex((row) => row.id === sourceRowId);
    const movedRow = committedRows[newIndex];
    const sectionLabel = ingredientSets.find((set) => set.id === movedRow?.ingredientSetId)?.label;
    setAnnouncement(
      movedRow?.ingredientSetId !== sourceRow.ingredientSetId && sectionLabel
        ? `${movedRow?.ingredientName || 'Ingredient'} moved to ${sectionLabel}, row ${newIndex + 1}.`
        : `${movedRow?.ingredientName || 'Ingredient'} moved to row ${newIndex + 1}.`,
    );
  };

  function getReorderState(rowId: string) {
    if (!dragPreview) {
      return undefined;
    }
    if (dragPreview.sourceId === rowId) {
      return 'dragging';
    }
    const offset = dragPreview.offsets.get(rowId);
    return offset !== undefined && Math.abs(offset) > 0.5 ? 'displaced' : undefined;
  }

  function getReorderTransform(rowId: string) {
    if (!dragPreview) {
      const dropOffset = dropOffsets.get(rowId);
      return dropOffset === undefined ? undefined : `translateY(${dropOffset}px)`;
    }
    const offset = dragPreview.offsets.get(rowId);
    return offset === undefined || Math.abs(offset) <= 0.5 ? undefined : `translateY(${offset}px)`;
  }

  function getReorderTransition() {
    return dragPreview ? 'transform 280ms cubic-bezier(0.22, 0.61, 0.36, 1)' : undefined;
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
        onClick={(event) => {
          pendingClickCell.current = null;
          if (
            field === 'preparation' &&
            displayValue.trim() &&
            !(
              event.target instanceof Element &&
              event.target.closest('.recipe-ingredient-cell-value')
            )
          ) {
            return;
          }
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
            onCommit={(value) => commitCell(row.id, field, value, 'tab')}
            onEnterCommit={(value) => commitCell(row.id, field, value, 'enter')}
            onTabCommit={() => focusNextCell(row.id, field)}
          />
        ) : isActive && field === 'preparation' ? (
          <PreparationCellEditor
            row={row}
            rowNumber={rowIndex + 1}
            options={prepOptions}
            picklists={picklists}
            onCancel={() => setActiveCell(null)}
            onCommit={(value) => commitCell(row.id, field, value, 'tab')}
            onEnterCommit={(value) => commitCell(row.id, field, value, 'enter')}
            onChange={(update) => commitRows(updateIngredientRow(rowsRef.current, row.id, update))}
          />
        ) : field === 'preparation' ? (
          <div className="recipe-preparation-editor">
            <span className="recipe-ingredient-cell-value">{displayValue}</span>
            <PreparationControls
              row={row}
              preparation={row.preparation}
              picklists={picklists}
              rowNumber={rowIndex + 1}
              onChange={(update) =>
                commitRows(updateIngredientRow(rowsRef.current, row.id, update))
              }
            />
          </div>
        ) : isActive ? (
          <InlineTextEditor
            label={`${fieldLabel}, row ${rowIndex + 1}`}
            value={displayValue}
            initialCharacter={initialCharacter}
            onCancel={() => setActiveCell(null)}
            onCommit={(value) => commitCell(row.id, field, value, 'blur')}
            onEnterCommit={(value) => commitCell(row.id, field, value, 'enter')}
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
    const density =
      ingredients.find((ingredient) => ingredient.id === row.ingredientId)?.density ??
      ingredients.find(
        (ingredient) =>
          ingredient.name.toLocaleLowerCase() === row.ingredientName.trim().toLocaleLowerCase(),
      )?.density;
    return (
      <MeasurementEditor
        layout="desktop"
        rowNumber={rowIndex + 1}
        measurements={row.measurements}
        picklists={picklists}
        density={density}
        validate={validateMeasurements}
        onUnitFocus={(type) =>
          commitRows(updateIngredientRow(rowsRef.current, row.id, { portionMeasurementType: type }))
        }
        onChange={(measurements) =>
          commitRows(updateIngredientRow(rowsRef.current, row.id, { measurements }))
        }
        onCommitRow={focusTrailingAddRow}
      />
    );
  }

  function moveSet(setId: string, direction: 'up' | 'down') {
    const currentIndex = ingredientSets.findIndex((set) => set.id === setId);
    const targetIndex = currentIndex + (direction === 'up' ? -1 : 1);
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= ingredientSets.length) {
      return;
    }
    const next = [...ingredientSets];
    [next[currentIndex], next[targetIndex]] = [next[targetIndex], next[currentIndex]];
    setPendingSetTitleFocusId(setId);
    onIngredientSetsChange(
      normalizeIngredientSets(next.map((set, position) => ({ ...set, position }))) ??
        ingredientSets,
    );
  }

  function renderSectionHeading(set: IngredientSetDraft, index: number) {
    const isEditing = editingSetId === set.id;
    const removeLabel = `Remove ${set.label || `Section ${index + 1}`} section`;
    return (
      <div
        className={`recipe-ingredient-set-heading${ingredientSets.length > 1 ? ' has-actions' : ''}`}
      >
        <h2>
          {isEditing ? (
            <input
              aria-label={`Section ${index + 1}`}
              maxLength={80}
              ref={(element) => updateSectionElementRef(setLabelInputRefs.current, set.id, element)}
              value={setLabelDraft}
              onBlur={() => {
                onIngredientSetsChange(
                  ingredientSets.map((current) =>
                    current.id === set.id ? { ...current, label: setLabelDraft } : current,
                  ),
                );
                setPendingSetTitleFocusId(set.id);
                setEditingSetId(null);
              }}
              onChange={(event) => setSetLabelDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  event.currentTarget.blur();
                } else if (event.key === 'Escape') {
                  event.preventDefault();
                  setSetLabelDraft(set.label);
                  setPendingSetTitleFocusId(set.id);
                  setEditingSetId(null);
                }
              }}
            />
          ) : (
            <button
              aria-label={`Edit section title for ${set.label || `Section ${index + 1}`}`}
              className="recipe-ingredient-set-title"
              ref={(element) => {
                updateSectionElementRef(setTitleButtonRefs.current, set.id, element);
              }}
              type="button"
              onClick={() => {
                setPendingSetTitleFocusId(null);
                setSetLabelDraft(set.label);
                setEditingSetId(set.id);
              }}
            >
              {set.label || `Section ${index + 1}`}
            </button>
          )}
        </h2>
        {ingredientSets.length > 1 && (
          <>
            <div className="recipe-ingredient-set-move-actions">
              {index > 0 && (
                <button
                  aria-label={`Move ${set.label} section up`}
                  className="recipe-ingredient-set-action"
                  title="Move section up"
                  type="button"
                  onClick={() => moveSet(set.id, 'up')}
                >
                  <ArrowUp aria-hidden="true" size={16} />
                </button>
              )}
              {index < ingredientSets.length - 1 && (
                <button
                  aria-label={`Move ${set.label} section down`}
                  className="recipe-ingredient-set-action"
                  title="Move section down"
                  type="button"
                  onClick={() => moveSet(set.id, 'down')}
                >
                  <ArrowDown aria-hidden="true" size={16} />
                </button>
              )}
            </div>
            <button
              aria-label={removeLabel}
              className="recipe-ingredient-set-action recipe-ingredient-set-remove"
              title="Remove section"
              type="button"
              onClick={() => {
                const nextIndex = Math.min(index, ingredientSets.length - 2);
                const focusSetId = ingredientSets[nextIndex]?.id;
                if (onRemoveSetRequested(set.id)) {
                  setPendingSetTitleFocusId(focusSetId ?? null);
                }
              }}
            >
              <X aria-hidden="true" size={16} />
            </button>
          </>
        )}
      </div>
    );
  }

  function addIngredientSet() {
    const newSet = {
      id: createUuid(),
      label: '',
      position: ingredientSets.length,
    };
    setPendingSetTitleFocusId(newSet.id);
    setSetLabelDraft('');
    setEditingSetId(newSet.id);
    onIngredientSetsChange([...ingredientSets, newSet]);
  }

  function renderRailRow(row: IngredientRowDraft, index: number, isNestedMobileRail = false) {
    const reorderState = isNestedMobileRail
      ? undefined
      : (getReorderState(row.id) ?? (settlingSourceId === row.id ? 'settling' : undefined));
    const hasDensityDerivedMeasurement = row.measurements.some(
      (measurement) => measurement.derivedFromDensity,
    );
    return (
      <div
        className={`recipe-ingredient-rail-row${hasDensityDerivedMeasurement ? ' is-density-derived' : ''}`}
        data-reorder-state={reorderState}
        data-row-id={row.id}
        key={row.id}
        style={{
          transform: isNestedMobileRail ? undefined : getReorderTransform(row.id),
          transition:
            !isNestedMobileRail && (dropCommitPending || dropOffsets.has(row.id))
              ? 'none'
              : isNestedMobileRail
                ? undefined
                : getReorderTransition(),
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
            const sectionHeaders = new Map(
              Array.from(
                event.currentTarget
                  .closest('.recipe-ingredient-editor')
                  ?.querySelectorAll<HTMLElement>(
                    '.recipe-ingredient-set-divider[data-ingredient-set-id]',
                  ) ?? [],
              )
                .filter((header) => header.getBoundingClientRect().height > 0)
                .map((header) => {
                  const bounds = header.getBoundingClientRect();
                  return [
                    header.dataset.ingredientSetId ?? '',
                    {
                      id: `section-${header.dataset.ingredientSetId ?? ''}`,
                      top: bounds.top + window.scrollY,
                      bottom: bounds.bottom + window.scrollY,
                    },
                  ] as const;
                }),
            );
            const seenSetIds = new Set<string>();
            const rowBounds: ReorderDragBound[] = visibleRows.flatMap((visibleRow) => {
              const ingredientRow = rowsRef.current.find(
                (currentRow) => currentRow.id === visibleRow.dataset.rowId,
              );
              if (!ingredientRow) {
                return [];
              }
              const bounds = visibleRow.getBoundingClientRect();
              const rowTop = bounds.top + window.scrollY;
              const setId = visibleRow.dataset.ingredientSetId ?? '';
              const headerBounds = seenSetIds.has(setId) ? undefined : sectionHeaders.get(setId);
              seenSetIds.add(setId);
              const rowId = visibleRow.dataset.rowId ?? '';
              return [
                ...(headerBounds
                  ? [
                      {
                        id: headerBounds.id,
                        targetId: rowId,
                        top: headerBounds.top,
                        bottom: headerBounds.bottom,
                        isHeader: true,
                      },
                    ]
                  : []),
                {
                  id: rowId,
                  top: rowTop,
                  bottom: bounds.bottom + window.scrollY,
                  isEmpty: isEmptyIngredientRow(ingredientRow),
                },
              ];
            });
            const sectionAddRow = Array.from(
              event.currentTarget
                .closest('.recipe-ingredient-editor')
                ?.querySelectorAll<HTMLElement>('.recipe-ingredient-set-add-row') ?? [],
            ).find((candidate) => candidate.getBoundingClientRect().height > 0);
            if (sectionAddRow) {
              const bounds = sectionAddRow.getBoundingClientRect();
              rowBounds.push({
                id: sectionAddRow.dataset.reorderEntryId ?? 'section-add-control',
                top: bounds.top + window.scrollY,
                bottom: bounds.bottom + window.scrollY,
                isTarget: false,
              });
            }
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
              (currentRow) => currentRow.id === hitTargetRowId,
            );
            const draggedRow = reorderDrag.finish(hitTargetRow?.id);
            if (draggedRow && draggedRow.sourceId !== draggedRow.targetId) {
              const editor = event.currentTarget.closest('.recipe-ingredient-editor');
              const layoutEntries = editor
                ? getVisibleReorderEntries(editor).filter(
                    (entry) => entry.getBoundingClientRect().height > 0,
                  )
                : [];
              if (layoutEntries.length) {
                pendingDrop.current = {
                  sourceId: draggedRow.sourceId,
                  rowTops: new Map(
                    layoutEntries.flatMap((entry) => {
                      const entryId = getReorderEntryId(entry);
                      return entryId ? [[entryId, entry.getBoundingClientRect().top] as const] : [];
                    }),
                  ),
                };
                setDropCommitPending(true);
              }
              commitDraggedRow(draggedRow.sourceId, draggedRow.order);
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
      <fieldset
        aria-label="Ingredient row controls"
        className="recipe-ingredient-control-rail"
        ref={controlRailRef}
      >
        <legend className="visually-hidden">Ingredient row controls</legend>
        <div aria-hidden="true" className="recipe-ingredient-rail-header" />
        {editorEntries.map((entry) =>
          entry.kind === 'section' ? (
            <div
              aria-hidden="true"
              className="recipe-ingredient-rail-section-spacer"
              data-ingredient-set-id={entry.section.id}
              data-reorder-state={getReorderState(entry.key)}
              key={entry.key}
              style={{
                transform: getReorderTransform(entry.key),
                transition: dragPreview ? getReorderTransition() : undefined,
              }}
            />
          ) : (
            renderRailRow(entry.row, entry.rowIndex)
          ),
        )}
      </fieldset>
    );
  }

  function submitMobileRow(row: IngredientRowDraft) {
    const submittedRow =
      isIngredientPlaceholderId(row.id) && row.ingredientName.trim()
        ? { ...row, id: createUuid() }
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
              {editorEntries.map((entry) => {
                if (entry.kind === 'section') {
                  return (
                    <tr
                      className="recipe-ingredient-set-divider"
                      data-ingredient-set-id={entry.section.id}
                      data-reorder-state={getReorderState(entry.key)}
                      key={entry.key}
                      style={{
                        transform: getReorderTransform(entry.key),
                        transition:
                          dropCommitPending || dropOffsets.has(entry.key)
                            ? 'none'
                            : dragPreview
                              ? getReorderTransition()
                              : undefined,
                      }}
                    >
                      <th colSpan={6} scope="rowgroup">
                        {renderSectionHeading(entry.section, entry.sectionIndex)}
                      </th>
                    </tr>
                  );
                }
                const { row, rowIndex: index } = entry;
                return (
                  <tr
                    className={
                      row.measurements.some((measurement) => measurement.derivedFromDensity)
                        ? 'is-density-derived'
                        : undefined
                    }
                    data-row-id={row.id}
                    data-ingredient-set-id={row.ingredientSetId}
                    data-reorder-state={
                      getReorderState(row.id) ??
                      (settlingSourceId === row.id ? 'settling' : undefined)
                    }
                    key={row.id}
                    style={{
                      height: row.measurements.some((measurement) => measurement.derivedFromDensity)
                        ? '58px'
                        : undefined,
                      transform: getReorderTransform(row.id),
                      transition:
                        dropCommitPending || dropOffsets.has(row.id)
                          ? 'none'
                          : dragPreview
                            ? getReorderTransition()
                            : undefined,
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
                );
              })}
              <tr
                className="recipe-ingredient-set-add-row"
                data-reorder-entry-id="section-add-control"
                style={{
                  transform: getReorderTransform('section-add-control'),
                  transition:
                    dropCommitPending || dropOffsets.has('section-add-control')
                      ? 'none'
                      : dragPreview
                        ? getReorderTransition()
                        : undefined,
                }}
              >
                <td colSpan={6}>
                  <button
                    className="recipe-ingredient-set-add"
                    type="button"
                    onClick={addIngredientSet}
                  >
                    <Plus aria-hidden="true" size={16} /> add section
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div className="recipe-ingredient-mobile">
        <table aria-label="Recipe ingredients on mobile" className="recipe-ingredient-mobile-list">
          <tbody>
            {editorEntries.map((entry) => {
              if (entry.kind === 'section') {
                return (
                  <tr
                    className="recipe-ingredient-set-divider"
                    data-ingredient-set-id={entry.section.id}
                    data-reorder-state={getReorderState(entry.key)}
                    key={entry.key}
                    style={{
                      transform: getReorderTransform(entry.key),
                      transition:
                        dropCommitPending || dropOffsets.has(entry.key)
                          ? 'none'
                          : dragPreview
                            ? getReorderTransition()
                            : undefined,
                    }}
                  >
                    <th colSpan={2} scope="rowgroup">
                      {renderSectionHeading(entry.section, entry.sectionIndex)}
                    </th>
                  </tr>
                );
              }
              const { row, rowIndex: index } = entry;
              return (
                <tr
                  className="recipe-ingredient-mobile-row"
                  data-row-id={row.id}
                  data-ingredient-set-id={row.ingredientSetId}
                  data-reorder-state={
                    getReorderState(row.id) ??
                    (settlingSourceId === row.id ? 'settling' : undefined)
                  }
                  key={row.id}
                  style={{
                    transform: getReorderTransform(row.id),
                    transition:
                      dropCommitPending || dropOffsets.has(row.id)
                        ? 'none'
                        : getReorderTransition(),
                  }}
                  onTransitionEnd={(event) => {
                    if (event.propertyName === 'transform' && settlingSourceId === row.id) {
                      setSettlingSourceId(null);
                    }
                  }}
                >
                  <td className="recipe-ingredient-mobile-rail">
                    {renderRailRow(row, index, true)}
                  </td>
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
              );
            })}
            <tr
              className="recipe-ingredient-set-add-row"
              data-reorder-entry-id="section-add-control"
              style={{
                transform: getReorderTransform('section-add-control'),
                transition:
                  dropCommitPending || dropOffsets.has('section-add-control')
                    ? 'none'
                    : dragPreview
                      ? getReorderTransition()
                      : undefined,
              }}
            >
              <td colSpan={2}>
                <button
                  className="recipe-ingredient-set-add"
                  type="button"
                  onClick={addIngredientSet}
                >
                  <Plus aria-hidden="true" size={16} /> add section
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p aria-live="polite" className="visually-hidden">
        {announcement}
      </p>
    </div>
  );
}
