'use client';

import { ArrowDown, ArrowUp, Plus, Salad, X } from 'lucide-react';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { IngredientOption, RecipePicklistValue } from '../../lib/recipes/data';
import { reconcileDensityIngredientChange } from '../../lib/recipes/density-rules';
import type { IngredientRowDraft, IngredientRowPayload } from '../../lib/recipes/ingredient-rules';
import {
  allocatePortions,
  formatIngredientDisplay,
  getPortionMeasurementType,
  getPortionRatio,
  isEmptyIngredientRow,
  isSizePreparation,
  moveIngredientRow,
  parseIngredientSizeValue,
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
  parseMeasurementDraftQuantity,
  parseScalarQuantityInput,
  serializeMeasurements,
  volumeUnits,
  weightUnits,
} from '../../lib/recipes/measurement-rules';
import {
  calculateRecipeNutrition,
  getNutritionBasisSignature,
  isNutritionFieldOverrideStale,
  type NutrientKey,
  type NutritionFieldOverride,
  type NutritionIngredientInput,
} from '../../lib/recipes/nutrition-rules';
import { createUuid } from '../../lib/uuid';
import {
  NutritionPane,
  type NutritionPaneSave,
  nutritionFieldOverridesToValues,
} from '../nutrition/nutrition-pane';
import { ReorderGrip } from '../reorder-grip';
import { MeasurementEditor } from './measurement-editor';
import { SuggestionCellEditor } from './suggestion-cell-editor';
import { type ReorderDragBound, useReorderDrag } from './use-reorder-drag';

export { SuggestionCellEditor } from './suggestion-cell-editor';

const defaultPreparationOptions = [
  'chopped',
  'crushed',
  'cubed',
  'diced',
  'melted',
  'minced',
  'room temperature',
  'sifted',
  'sliced',
];

type IngredientField = 'ingredientName' | 'detail' | 'alternateNote' | 'preparation' | 'divide';
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
    alternateNote: '',
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

function hasMeasurementAmount(row: IngredientRowDraft, type: 'volume' | 'weight'): boolean {
  return row.measurements.some(
    (measurement) => measurement.type === type && Boolean(measurement.quantity.trim()),
  );
}

function preparationMetadata(preparation: string) {
  const normalized = preparation.trim().toLocaleLowerCase();
  return {
    ...(isSizePreparation(normalized) ? {} : { sizeValue: '', sizeUnit: '' }),
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
    ...(sets.length > 1
      ? [
          {
            kind: 'section' as const,
            key: `section-${section.id}`,
            section,
            sectionIndex,
          },
        ]
      : []),
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
    alternate_note: row.alternateNote ?? '',
    preparation: row.preparation,
    size_value: parseIngredientSizeValue(row.sizeValue ?? '', row.sizeUnit ?? ''),
    size_unit: row.sizeUnit === 'in' || row.sizeUnit === 'cm' ? row.sizeUnit : null,
    measurements: row.measurements.flatMap((measurement) => {
      if (!measurement.type) {
        return [];
      }
      const unmeasured = measurement.type === 'unmeasured';
      const parsed = unmeasured ? null : parseMeasurementDraftQuantity(measurement);
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

function getNutritionInputForRow(
  row: IngredientRowDraft,
  ingredients: IngredientOption[],
  picklists: RecipePicklistValue[],
): NutritionIngredientInput {
  const ingredient =
    ingredients.find((candidate) => candidate.id === row.ingredientId) ??
    ingredients.find(
      (candidate) =>
        candidate.name.toLocaleLowerCase() === row.ingredientName.trim().toLocaleLowerCase(),
    );
  return {
    measurements: row.measurements.flatMap((measurement) => {
      if (!measurement.type) return [];
      const parsed =
        measurement.type === 'unmeasured' ? null : parseMeasurementDraftQuantity(measurement);
      return [
        {
          type: measurement.type,
          amount: parsed?.minimum ?? null,
          maximum: parsed?.maximum ?? null,
          unitCode: measurement.unitCode || null,
          picklistValueId: measurement.picklistValueId || null,
          picklistValue: measurement.picklistValueId
            ? (picklists.find((value) => value.id === measurement.picklistValueId)?.display_value ??
              null)
            : null,
        },
      ];
    }),
    profile: ingredient?.nutritionProfile ?? null,
    servingSizeOverride: row.nutritionServingSizeOverride ?? null,
    nutrientOverrides: row.nutritionOverrides ?? {},
    density: ingredient?.density ?? null,
    equivalent: ingredient?.nutritionEquivalent ?? null,
  };
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
  const selectedType = getPortionMeasurementType(
    serializedMeasurements,
    row.portionMeasurementType,
  );
  const measurement = serializedMeasurements.find((item) => item.measurement_type === selectedType);
  const total = measurement?.amount_min ?? null;
  const parsedFirst =
    row.portionOneAmount === undefined ? null : parseScalarQuantityInput(row.portionOneAmount);
  const firstAmount =
    row.portionOneAmount !== undefined
      ? parsedFirst?.maximum === null && parsedFirst
        ? parsedFirst.minimum
        : null
      : total != null && row.portionOneRatio != null
        ? total * row.portionOneRatio
        : null;
  const ratio =
    canDivide && firstAmount !== null && total !== null
      ? getPortionRatio(firstAmount, total)
      : null;
  const hasDivision =
    row.portionOneAmount === undefined
      ? row.portionOneRatio != null
      : row.portionOneAmount.trim().length > 0;
  const divisionError = hasDivision
    ? !canDivide
      ? 'Only scalar Unit, Count, and Things amounts can be divided.'
      : ratio === null
        ? 'Enter a first portion greater than zero and less than the total.'
        : null
    : null;
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

  return (
    <>
      <fieldset aria-label={`Portion controls, row ${rowNumber}`} className="recipe-portion-editor">
        <input
          aria-label={`First portion, row ${rowNumber}`}
          aria-invalid={hasDivision && ratio === null}
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
            if (!value.trim()) {
              onChange({
                portionOneAmount: undefined,
                portionOneRatio: null,
                portionMeasurementType: undefined,
              });
              return;
            }
            const parsed = parseScalarQuantityInput(value);
            const nextRatio =
              canDivide && parsed?.maximum === null && total !== null
                ? getPortionRatio(parsed.minimum, total)
                : null;
            onChange({
              portionOneAmount: value,
              portionOneRatio: nextRatio,
              portionMeasurementType: selectedType,
            });
          }}
        />
        {unitLabel && <span className="recipe-portion-unit">{unitLabel}</span>}
        {hasDivision && (
          <span aria-hidden="true" className="recipe-portion-separator">
            :
          </span>
        )}
        <span
          aria-label={`Second portion, row ${rowNumber}`}
          aria-live="polite"
          className="recipe-portion-remainder"
          role="status"
        >
          {hasDivision &&
            remainderParts.map((part) =>
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
      {divisionError && (
        <span className="recipe-preparation-control-error" role="alert">
          {divisionError}
        </span>
      )}
    </>
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
  if (!isSizePreparation(preparation)) {
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
        inputMode="text"
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
  rowNumber,
  onChange,
}: {
  row: IngredientRowDraft;
  preparation: string;
  rowNumber: number;
  onChange: (update: Partial<IngredientRowDraft>) => void;
}) {
  const normalized = preparation.trim().toLocaleLowerCase();

  if (!isSizePreparation(normalized)) {
    return null;
  }

  return (
    <div className="recipe-preparation-controls">
      <IngredientSizeEditor
        preparation={preparation}
        sizeValue={row.sizeValue ?? ''}
        sizeUnit={row.sizeUnit ?? ''}
        rowNumber={rowNumber}
        onChange={onChange}
      />
    </div>
  );
}

function DivideFieldEditor({
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
  return (
    <div className="recipe-divide-editor">
      <PortionEditor row={row} picklists={picklists} rowNumber={rowNumber} onChange={onChange} />
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
  initialCharacter,
  onCommit,
  onEnterCommit,
  onTabCommit,
  onCancel,
  onChange,
}: {
  row: IngredientRowDraft;
  rowNumber: number;
  options: string[];
  initialCharacter?: string;
  onCommit: (value: string) => void;
  onEnterCommit: (value: string) => void;
  onTabCommit: () => void;
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
        initialCharacter={initialCharacter}
        fitContent
        onDraftChange={setPreparation}
        onCommit={onCommit}
        onEnterCommit={onEnterCommit}
        onTabCommit={onTabCommit}
        onCancel={onCancel}
      />
      <PreparationControls
        row={row}
        preparation={preparation}
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
  onAddInformalUnit,
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
  onAddInformalUnit?: (rawValue: string) => Promise<{ valueId?: string; error?: string }>;
  onSubmit: (row: IngredientRowDraft) => void;
  onClose: () => void;
}) {
  const [ingredientName, setIngredientName] = useState(row.ingredientName);
  const [detail, setDetail] = useState(row.detail);
  const [alternateNote, setAlternateNote] = useState(row.alternateNote ?? '');
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
    const viewportHeight = window.innerHeight;
    const belowSpace = Math.max(0, window.innerHeight - anchorBounds.bottom - gap - margin);
    const aboveSpace = Math.max(0, anchorBounds.top - gap - margin);
    const fitsBelow = naturalHeight <= belowSpace;
    const fitsAbove = naturalHeight <= aboveSpace;
    const maxHeight = Math.max(0, viewportHeight - margin * 2);
    const width = Math.min(popoverBounds.width, window.innerWidth - margin * 2);
    const top = fitsBelow
      ? anchorBounds.bottom + gap
      : fitsAbove
        ? anchorBounds.top - naturalHeight - gap
        : Math.max(margin, Math.min(anchorBounds.top, viewportHeight - maxHeight - margin));

    setPosition({
      left: Math.max(margin, Math.min(anchorBounds.left, window.innerWidth - width - margin)),
      top,
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
      alternateNote: alternateNote.trim(),
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

  function closeEditor() {
    onClose();
    anchorElement.focus();
  }

  const divideRow: IngredientRowDraft = {
    ...row,
    measurements,
    portionOneRatio,
    portionOneAmount,
    portionMeasurementType,
    sizeValue,
    sizeUnit,
  };

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
          closeEditor();
        } else if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
          event.preventDefault();
          submit();
        }
      }}
      role="dialog"
    >
      <div className="recipe-mobile-picker-field recipe-mobile-ingredient-field">
        <div className="recipe-mobile-ingredient-heading">
          <span>Ingredient</span>
          <button
            aria-label="Close ingredient editor"
            className="recipe-ingredient-mobile-popover-close"
            type="button"
            onClick={closeEditor}
          >
            <X aria-hidden="true" size={18} />
          </button>
        </div>
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
              alternateNote: alternateNote.trim(),
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
          onAddInformalUnit={onAddInformalUnit}
          onChange={updateMobileMeasurements}
          onUnitFocus={(type) => {
            if (hasMeasurementAmount({ ...row, measurements }, type)) {
              setPortionMeasurementType(type);
            }
          }}
          onCommitRow={submit}
        />
      </div>
      <div className="recipe-mobile-picker-field recipe-mobile-preparation-field">
        <span>Preparation</span>
        <SuggestionCellEditor
          label="Preparation"
          options={preparationOptions}
          placement="above"
          fitContent
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
              alternateNote: alternateNote.trim(),
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
          row={divideRow}
          preparation={preparation}
          rowNumber={rowNumber}
          onChange={(update) => {
            updateMobilePortion(update);
            if (update.sizeValue !== undefined) setSizeValue(update.sizeValue);
            if (update.sizeUnit !== undefined) setSizeUnit(update.sizeUnit);
          }}
        />
      </div>
      <div className="recipe-mobile-picker-field recipe-mobile-divide-field">
        <span>Divide</span>
        <DivideFieldEditor
          row={divideRow}
          rowNumber={rowNumber}
          picklists={picklists}
          onChange={updateMobilePortion}
        />
      </div>
      <label>
        <span>Alternative / note</span>
        <input
          placeholder="or half and half; using milk"
          type="text"
          value={alternateNote}
          onChange={(event) => setAlternateNote(event.target.value)}
        />
      </label>
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
  onAddInformalUnit,
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
  onAddInformalUnit?: (rawValue: string) => Promise<{ valueId?: string; error?: string }>;
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
  const [nutritionRowId, setNutritionRowId] = useState<string | null>(null);
  const nutritionTriggerRef = useRef<HTMLButtonElement>(null);
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
  const nutritionRow = draftRows.find((row) => row.id === nutritionRowId) ?? null;
  const nutritionIngredient = nutritionRow
    ? (ingredients.find((ingredient) => ingredient.id === nutritionRow.ingredientId) ??
      ingredients.find(
        (ingredient) =>
          ingredient.name.toLocaleLowerCase() ===
          nutritionRow.ingredientName.trim().toLocaleLowerCase(),
      ) ??
      null)
    : null;

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
      pendingFocusCell.current = { rowId: persistedRowId, field: 'divide' };
      return;
    }

    if (field === 'divide') {
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
        if (field === 'divide') {
          target.querySelector<HTMLInputElement>('.recipe-portion-input')?.focus();
        } else {
          setActiveCell({ rowId, field });
        }
      }
    } else if (
      event.target instanceof HTMLTableCellElement &&
      event.key.length === 1 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      const field = target.dataset.field as IngredientField | undefined;
      if (field && field !== 'divide') {
        event.preventDefault();
        setActiveCell({ rowId, field, initialCharacter: event.key });
      }
    }
  }

  const prepOptions = uniqueOptions([
    ...defaultPreparationOptions,
    ...preparationOptions,
    ...draftRows.map((row) => row.preparation),
  ]).filter((option) => option.toLocaleLowerCase() !== 'divided');
  function nutritionStatus(row: IngredientRowDraft) {
    const result = calculateRecipeNutrition(
      [getNutritionInputForRow(row, ingredients, picklists)],
      1,
    );
    return result.complete ? 'complete' : result.hasData ? 'incomplete' : 'empty';
  }

  function saveRowNutrition(value: NutritionPaneSave) {
    if (!nutritionRow) return;
    const basis =
      value.basis ??
      nutritionIngredient?.nutritionProfile?.servingSize ??
      nutritionRow.nutritionServingSizeOverride ??
      null;
    const existing = nutritionRow.nutritionOverrides ?? {};
    const editedKeys = new Set(value.editedKeys);
    const nextOverrides: Partial<Record<NutrientKey, NutritionFieldOverride>> = {};
    for (const key of value.manualKeys) {
      const amount = value.values[key];
      if (amount === undefined) continue;
      const prior = existing[key];
      nextOverrides[key] =
        editedKeys.has(key) && basis
          ? {
              value: amount,
              basisSignature: getNutritionBasisSignature(basis),
              acknowledgedBasisSignature: null,
            }
          : prior &&
              value.staleResolution === 'accept' &&
              basis &&
              isNutritionFieldOverrideStale(prior, basis)
            ? {
                ...prior,
                acknowledgedBasisSignature: getNutritionBasisSignature(basis),
              }
            : (prior ?? {
                value: amount,
                basisSignature: basis ? getNutritionBasisSignature(basis) : '',
                acknowledgedBasisSignature: null,
              });
    }
    commitRows(
      updateIngredientRow(rowsRef.current, nutritionRow.id, {
        nutritionServingSizeOverride: value.basisOverride ? value.basis : null,
        nutritionOverrides: nextOverrides,
      }),
    );
    closeRowNutrition();
  }

  function closeRowNutrition() {
    setNutritionRowId(null);
    requestAnimationFrame(() => nutritionTriggerRef.current?.focus());
  }

  function openRowNutrition(row: IngredientRowDraft, trigger: HTMLButtonElement) {
    nutritionTriggerRef.current = trigger;
    setNutritionRowId(row.id);
  }

  function clearRowNutrition() {
    if (!nutritionRow) return;
    commitRows(
      updateIngredientRow(rowsRef.current, nutritionRow.id, {
        nutritionServingSizeOverride: null,
        nutritionOverrides: {},
      }),
    );
    closeRowNutrition();
  }

  function renderNutritionButton(row: IngredientRowDraft, className: string) {
    const status = nutritionStatus(row);
    const statusText =
      status === 'complete' ? 'complete' : status === 'incomplete' ? 'incomplete' : 'not entered';
    return (
      <button
        aria-label={`Nutrition for ${row.ingredientName}: ${statusText}`}
        className={`recipe-ingredient-nutrition-button recipe-ingredient-nutrition-${status} ${className}`}
        title="Nutrition"
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          openRowNutrition(row, event.currentTarget);
        }}
      >
        <Salad aria-hidden="true" size={18} />
      </button>
    );
  }

  function renderDesktopCell(row: IngredientRowDraft, rowIndex: number, field: IngredientField) {
    const fieldLabel =
      field === 'ingredientName'
        ? 'Ingredient'
        : field === 'detail'
          ? 'Specifics'
          : field === 'alternateNote'
            ? 'Alternative / note'
            : field === 'preparation'
              ? 'Preparation'
              : 'Divide';
    const isActive = activeCell?.rowId === row.id && activeCell.field === field;
    const initialCharacter =
      activeCell?.rowId === row.id && activeCell.field === field
        ? activeCell.initialCharacter
        : undefined;
    const displayValue = field === 'divide' ? '' : (row[field] ?? '');

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
        tabIndex={isActive || field === 'divide' ? -1 : 0}
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
        {field === 'divide' ? (
          <DivideFieldEditor
            row={row}
            rowNumber={rowIndex + 1}
            picklists={picklists}
            onChange={(update) => commitRows(updateIngredientRow(rowsRef.current, row.id, update))}
          />
        ) : isActive && field === 'ingredientName' ? (
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
            initialCharacter={initialCharacter}
            onCancel={() => setActiveCell(null)}
            onCommit={(value) => commitCell(row.id, field, value, 'tab')}
            onEnterCommit={(value) => commitCell(row.id, field, value, 'enter')}
            onTabCommit={() => focusNextCell(row.id, field)}
            onChange={(update) => commitRows(updateIngredientRow(rowsRef.current, row.id, update))}
          />
        ) : field === 'preparation' ? (
          <div className="recipe-preparation-editor">
            <span className="recipe-ingredient-cell-value">{displayValue}</span>
            <PreparationControls
              row={row}
              preparation={row.preparation}
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
        onAddInformalUnit={onAddInformalUnit}
        onUnitFocus={(type) => {
          const currentRow = rowsRef.current.find((item) => item.id === row.id) ?? row;
          if (hasMeasurementAmount(currentRow, type)) {
            commitRows(
              updateIngredientRow(rowsRef.current, row.id, { portionMeasurementType: type }),
            );
          }
        }}
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
          <ReorderGrip />
        </button>
        <input
          aria-label={`Main, row ${index + 1}`}
          aria-description="Mark as a main ingredient for recipe search."
          title="Main ingredient: include this ingredient in main-ingredient searches."
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
        <div aria-hidden="true" className="recipe-ingredient-rail-header">
          Main
        </div>
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
              <col className="recipe-ingredient-divide-col" />
              <col className="recipe-ingredient-alternate-note-col" />
              <col className="recipe-ingredient-nutrition-col" />
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
                <th scope="col">Divide</th>
                <th scope="col">Alternative / note</th>
                <th className="recipe-ingredient-nutrition-header" scope="col" title="Nutrition">
                  <Salad aria-hidden="true" size={16} />
                  <span className="visually-hidden">Nutrition</span>
                </th>
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
                      <th colSpan={9} scope="rowgroup">
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
                        colSpan={9}
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
                        {renderDesktopCell(row, index, 'divide')}
                        {renderDesktopCell(row, index, 'alternateNote')}
                        <td className="recipe-ingredient-nutrition-cell">
                          {!isEmptyIngredientRow(row) &&
                            renderNutritionButton(row, 'recipe-ingredient-desktop-nutrition')}
                        </td>
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
                <td colSpan={9}>
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
                      <>
                        {renderNutritionButton(row, 'recipe-ingredient-mobile-nutrition')}
                        <button
                          aria-label={`Delete ingredient row ${index + 1}`}
                          className="recipe-ingredient-delete-button recipe-ingredient-mobile-delete"
                          title="Delete ingredient row"
                          type="button"
                          onClick={() => deleteIngredientRow(row.id)}
                        >
                          ×
                        </button>
                      </>
                    )}
                    {mobileEditingRowId === row.id && mobileAnchorElement && (
                      <MobileIngredientEditor
                        rowNumber={index + 1}
                        ingredients={ingredients}
                        anchorElement={mobileAnchorElement}
                        picklists={picklists}
                        preparationOptions={prepOptions}
                        validateMeasurements={validateMeasurements}
                        onAddInformalUnit={onAddInformalUnit}
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
      <p className="recipe-main-ingredient-help">
        Main marks an ingredient for main-ingredient searches.
      </p>
      {nutritionRow && (
        <NutritionPane
          mode="ingredient"
          title={nutritionRow.ingredientName}
          profile={nutritionIngredient?.nutritionProfile ?? null}
          density={nutritionIngredient?.density ?? null}
          basisOverride={nutritionRow.nutritionServingSizeOverride ?? null}
          manualValues={nutritionFieldOverridesToValues(nutritionRow.nutritionOverrides ?? {})}
          fieldOverrides={nutritionRow.nutritionOverrides ?? {}}
          onCancel={closeRowNutrition}
          onClear={clearRowNutrition}
          onSave={saveRowNutrition}
        />
      )}
    </div>
  );
}
