'use client';

import { Calculator } from 'lucide-react';
import type { ReactNode } from 'react';
import { Fragment, useId, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { RecipePicklistValue } from '../../lib/recipes/data';
import { deriveDensityCounterpart, type IngredientDensity } from '../../lib/recipes/density-rules';
import {
  formatQuantityInput,
  type MeasurementDraft,
  type MeasurementSystem,
  type MeasurementType,
  serializeMeasurements,
  volumeUnits,
  weightUnits,
} from '../../lib/recipes/measurement-rules';
import { usePicklistMenu } from '../picklist';

type MeasurementCategory = 'units' | 'count' | 'informal' | 'judgment';

const measurementCategories: { value: MeasurementCategory; label: string }[] = [
  { value: 'units', label: 'Unit' },
  { value: 'count', label: 'Count' },
  { value: 'informal', label: 'Things' },
  { value: 'judgment', label: 'Feel' },
];

const measurementCategoryOptions = measurementCategories.map((category) => ({
  id: category.value,
  value: category.label,
}));

const unitMeasurementTypes = ['volume', 'weight'] as const;

type MeasurementPicklistOption = {
  id: string;
  value: string;
  display_value?: string;
  group?: string;
};

function unitOptions(type: 'volume' | 'weight'): MeasurementPicklistOption[] {
  const units = type === 'volume' ? volumeUnits : weightUnits;
  return units.map((unit) => ({
    id: unit.code,
    value: unit.abbreviation,
    group: unit.system === 'us_customary' ? 'US' : 'Metric',
  }));
}

function quantitySystem(type: MeasurementType, unitCode: string): MeasurementSystem {
  if (type === 'volume') {
    return volumeUnits.find((unit) => unit.code === unitCode)?.system ?? 'us_customary';
  }
  if (type === 'weight') {
    return weightUnits.find((unit) => unit.code === unitCode)?.system ?? 'us_customary';
  }
  return 'us_customary';
}

const volumePicklistOptions = unitOptions('volume');
const weightPicklistOptions = unitOptions('weight');

function createMeasurement(type: MeasurementType): MeasurementDraft {
  return {
    id: crypto.randomUUID(),
    type,
    quantity: '',
    unitCode: type === 'volume' ? 'cup' : type === 'weight' ? 'g' : '',
    picklistValueId: '',
  };
}

function categoryFor(measurements: MeasurementDraft[]): MeasurementCategory | null {
  if (
    measurements.some(
      (measurement) => measurement.type === 'volume' || measurement.type === 'weight',
    )
  ) {
    return 'units';
  }
  if (measurements.some((measurement) => measurement.type === 'count')) {
    return 'count';
  }
  if (measurements.some((measurement) => measurement.type === 'informal')) {
    return 'informal';
  }
  if (measurements.some((measurement) => measurement.type === 'unmeasured')) {
    return 'judgment';
  }
  return null;
}

function isMeasurementCategory(value: string): value is MeasurementCategory {
  return measurementCategories.some((category) => category.value === value);
}

function measurementsForCategory(category: MeasurementCategory): MeasurementDraft[] {
  switch (category) {
    case 'units':
      return [createMeasurement('volume'), createMeasurement('weight')];
    case 'count':
      return [createMeasurement('count')];
    case 'informal':
      return [createMeasurement('informal')];
    case 'judgment':
      return [createMeasurement('unmeasured')];
  }
}

function getMeasurement(measurements: MeasurementDraft[], type: MeasurementType): MeasurementDraft {
  return measurements.find((measurement) => measurement.type === type) ?? createMeasurement(type);
}

function MeasurementPicklist({
  label,
  prompt,
  options,
  selectedId,
  className,
  describedBy,
  invalid,
  onSelect,
  onCommitEnter,
  onTabSelect,
  onFocus,
}: {
  label: string;
  prompt: string;
  options: MeasurementPicklistOption[];
  selectedId: string;
  className?: string;
  describedBy?: string;
  invalid?: boolean;
  onSelect: (valueId: string) => void;
  onCommitEnter?: () => void;
  onTabSelect?: (valueId: string) => boolean | undefined;
  onFocus?: () => void;
}) {
  const selectedValue = options.find((option) => option.id === selectedId);
  const menu = usePicklistMenu({
    value: selectedId,
    options: options.map((option) => ({
      value: option.id,
      label: option.display_value ?? option.value,
      group: option.group,
    })),
    onSelect,
    onCommitEnter,
    onTabSelect,
    selectOnTab: true,
  });

  return (
    <>
      <button
        aria-activedescendant={
          menu.isOpen && options.length ? `${menu.listId}-${menu.activeIndex}` : undefined
        }
        aria-controls={menu.isOpen ? menu.listId : undefined}
        aria-describedby={describedBy}
        aria-expanded={menu.isOpen}
        aria-label={label}
        aria-haspopup="listbox"
        aria-invalid={invalid || undefined}
        className={`ingredient-cell-input recipe-measurement-picklist-trigger ${className ?? ''}`}
        ref={menu.triggerRef}
        role="combobox"
        type="button"
        onFocus={onFocus}
        onBlur={menu.clearPendingSelection}
        onClick={menu.toggle}
        onKeyDown={menu.handleKeyDown}
      >
        {selectedValue?.display_value ?? selectedValue?.value ?? prompt}
      </button>
      {menu.isOpen &&
        options.length > 0 &&
        createPortal(
          <div
            className="ingredient-cell-options"
            id={menu.listId}
            role="listbox"
            ref={menu.menuRef}
            style={menu.menuPosition ?? undefined}
            onMouseDown={(event) => event.preventDefault()}
          >
            {options.map((option, index) => (
              <Fragment key={option.id}>
                {option.group && options[index - 1]?.group !== option.group && (
                  <div className="ingredient-cell-option-group" role="presentation">
                    {option.group}
                  </div>
                )}
                <div
                  aria-selected={option.id === selectedId}
                  className={`ingredient-cell-option${index === menu.activeIndex ? ' is-active' : ''}`}
                  id={`${menu.listId}-${index}`}
                  role="option"
                  tabIndex={-1}
                  onPointerMove={() => menu.setActiveIndex(index)}
                  onClick={() => menu.select(option.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      menu.select(option.id);
                    }
                  }}
                >
                  {option.value}
                </div>
              </Fragment>
            ))}
          </div>,
          document.querySelector('main') ?? document.body,
        )}
    </>
  );
}

export function MeasurementEditor({
  rowNumber,
  measurements,
  picklists,
  density,
  validate,
  layout = 'mobile',
  afterFields,
  onUnitFocus,
  onChange,
  onCommitRow,
}: {
  rowNumber: number;
  measurements: MeasurementDraft[];
  picklists: RecipePicklistValue[];
  density?: IngredientDensity | null;
  validate: boolean;
  layout?: 'desktop' | 'mobile';
  afterFields?: ReactNode;
  onUnitFocus?: (type: 'volume' | 'weight') => void;
  onChange: (measurements: MeasurementDraft[]) => void;
  onCommitRow?: () => void;
}) {
  const editorId = useId();
  const fieldsContainerRef = useRef<HTMLElement | null>(null);
  const pendingCategoryTabFocusRef = useRef<MeasurementCategory | null>(null);
  const category = categoryFor(measurements);
  const activeCategory = category ?? 'units';
  let validationError: string | null = null;
  if (validate) {
    try {
      serializeMeasurements(measurements);
    } catch (error) {
      validationError = error instanceof Error ? error.message : 'Check this measurement.';
    }
  }

  useLayoutEffect(() => {
    if (pendingCategoryTabFocusRef.current !== activeCategory) {
      return;
    }
    pendingCategoryTabFocusRef.current = null;
    const focusFirstField = () => {
      fieldsContainerRef.current
        ?.querySelector<HTMLElement>(
          'input.recipe-measurement-quantity, .recipe-measurement-control:not(.recipe-measurement-category) button.recipe-measurement-picklist-trigger',
        )
        ?.focus();
    };
    focusFirstField();
    requestAnimationFrame(focusFirstField);
  }, [activeCategory]);

  const errorId = `${editorId}-error`;
  const describedBy = validationError ? errorId : undefined;
  const volume = getMeasurement(measurements, 'volume');
  const weight = getMeasurement(measurements, 'weight');
  const count = getMeasurement(measurements, 'count');
  const informal = getMeasurement(measurements, 'informal');
  const judgment = getMeasurement(measurements, 'unmeasured');
  const informalOptions = picklists.filter((option) => option.category === 'informal_unit');
  const phraseOptions = picklists.filter((option) => option.category === 'unmeasured_phrase');

  function changeCategory(value: MeasurementCategory) {
    onChange(measurementsForCategory(value));
  }

  function commitQuantityInput(type: MeasurementType, measurement: MeasurementDraft) {
    const formattedQuantity = formatQuantityInput(
      measurement.quantity,
      quantitySystem(type, measurement.unitCode),
    );
    let nextMeasurements =
      formattedQuantity !== measurement.quantity
        ? measurements.map((current) =>
            current.id === measurement.id ? { ...current, quantity: formattedQuantity } : current,
          )
        : measurements;
    if ((type === 'volume' || type === 'weight') && !measurement.quantity.trim() && density) {
      const sourceType = type === 'volume' ? 'weight' : 'volume';
      nextMeasurements = deriveDensityCounterpart(nextMeasurements, sourceType, density);
    }
    if (nextMeasurements !== measurements) {
      onChange(nextMeasurements);
    }
  }

  function updateMeasurement(type: MeasurementType, update: Partial<MeasurementDraft>) {
    const currentCategory = categoryFor(measurements);
    const currentMeasurements =
      currentCategory === 'units'
        ? unitMeasurementTypes.map((type) => getMeasurement(measurements, type))
        : measurements;
    let nextMeasurements = currentMeasurements.some((measurement) => measurement.type === type)
      ? currentMeasurements.map((measurement) =>
          measurement.type === type
            ? {
                ...measurement,
                ...update,
                ...(Object.hasOwn(update, 'quantity')
                  ? { derivedFromDensity: undefined, derivedQuantity: undefined }
                  : {}),
              }
            : measurement,
        )
      : [...currentMeasurements, { ...createMeasurement(type), ...update }];
    if (type === 'volume' || type === 'weight') {
      const updatedMeasurement = nextMeasurements.find((measurement) => measurement.type === type);
      const sourceType = updatedMeasurement?.derivedFromDensity
        ? type === 'volume'
          ? 'weight'
          : 'volume'
        : type;
      nextMeasurements = deriveDensityCounterpart(nextMeasurements, sourceType, density);
    }
    onChange(nextMeasurements);
  }

  function renderCategoryPicker() {
    return (
      <div className="recipe-measurement-control recipe-measurement-category">
        <span className="visually-hidden">Ingredient type, row {rowNumber}</span>
        <MeasurementPicklist
          label={`Ingredient type, row ${rowNumber}`}
          prompt="Unit"
          options={measurementCategoryOptions}
          selectedId={activeCategory}
          describedBy={describedBy}
          invalid={Boolean(validationError)}
          onCommitEnter={onCommitRow}
          onTabSelect={(value) => {
            pendingCategoryTabFocusRef.current = isMeasurementCategory(value) ? value : 'units';
            return true;
          }}
          onSelect={(value) => {
            if (isMeasurementCategory(value)) {
              changeCategory(value);
            } else {
              onChange([]);
            }
          }}
        />
      </div>
    );
  }

  function renderAmountInput(type: MeasurementType, label: string, measurement: MeasurementDraft) {
    const inputId = `${editorId}-${type}-amount`;
    const labelId = `${editorId}-${type}-label`;
    const derivedId = `${editorId}-${type}-derived`;
    const inputDescribedBy =
      [describedBy, measurement.derivedFromDensity ? derivedId : null].filter(Boolean).join(' ') ||
      undefined;
    const inputSize = Math.max(
      2,
      measurement.quantity.length + (measurement.derivedFromDensity ? 1 : 0),
    );
    return (
      <div className="recipe-measurement-control">
        <label htmlFor={inputId}>
          <span className="visually-hidden" id={labelId}>
            {label}, row {rowNumber}
          </span>
        </label>
        <div
          className={`recipe-measurement-input-wrap${measurement.derivedFromDensity && measurement.quantity ? ' is-density-derived' : ''}`}
        >
          <input
            aria-describedby={inputDescribedBy}
            aria-labelledby={labelId}
            aria-invalid={Boolean(validationError) || undefined}
            autoComplete="off"
            className={`recipe-measurement-quantity${measurement.derivedFromDensity ? ' is-density-derived' : ''}`}
            id={inputId}
            inputMode="text"
            size={inputSize}
            type="text"
            value={measurement.quantity}
            onChange={(event) => updateMeasurement(type, { quantity: event.target.value })}
            onBlur={() => commitQuantityInput(type, measurement)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                event.stopPropagation();
                commitQuantityInput(type, measurement);
                onCommitRow?.();
              }
            }}
          />
          {measurement.derivedFromDensity && measurement.quantity && (
            <span
              aria-hidden="true"
              className="recipe-measurement-derived-indicator"
              title="Derived from density"
            >
              <Calculator aria-hidden="true" size={13} strokeWidth={2} />
            </span>
          )}
        </div>
        {measurement.derivedFromDensity && measurement.quantity && (
          <span className="visually-hidden" id={derivedId} role="status">
            Derived from density
          </span>
        )}
      </div>
    );
  }

  function renderUnitSelect(
    type: 'volume' | 'weight',
    label: string,
    measurement: MeasurementDraft,
  ) {
    return (
      <div className="recipe-measurement-control">
        <span className="visually-hidden">
          {label}, row {rowNumber}
        </span>
        <MeasurementPicklist
          label={`${label}, row ${rowNumber}`}
          prompt=""
          options={type === 'volume' ? volumePicklistOptions : weightPicklistOptions}
          selectedId={measurement.unitCode}
          className={`recipe-measurement-unit-trigger${
            type === 'weight' ? ' recipe-measurement-weight-trigger' : ''
          }`}
          describedBy={describedBy}
          invalid={Boolean(validationError)}
          onFocus={() => onUnitFocus?.(type)}
          onCommitEnter={onCommitRow}
          onSelect={(unitCode) => updateMeasurement(type, { unitCode })}
        />
      </div>
    );
  }

  function renderPicklist(
    label: string,
    prompt: string,
    options: RecipePicklistValue[],
    measurement: MeasurementDraft,
    type: 'informal' | 'unmeasured',
  ) {
    return (
      <div className="recipe-measurement-control">
        <span className="visually-hidden">
          {label}, row {rowNumber}
        </span>
        <MeasurementPicklist
          label={`${label}, row ${rowNumber}`}
          prompt={prompt}
          options={options}
          selectedId={measurement.picklistValueId}
          describedBy={describedBy}
          invalid={Boolean(validationError)}
          onCommitEnter={onCommitRow}
          onSelect={(picklistValueId) => updateMeasurement(type, { picklistValueId })}
        />
      </div>
    );
  }

  function renderMobileFields() {
    if (activeCategory === 'units') {
      return (
        <div className="recipe-measurement-units">
          <div className="recipe-measurement-dimension">
            {renderAmountInput('volume', 'Volume amount', volume)}
            {renderUnitSelect('volume', 'Volume unit', volume)}
          </div>
          <span aria-hidden="true" className="recipe-measurement-slash">
            /
          </span>
          <div className="recipe-measurement-dimension">
            {renderAmountInput('weight', 'Weight amount', weight)}
            {renderUnitSelect('weight', 'Weight unit', weight)}
          </div>
        </div>
      );
    }
    if (activeCategory === 'count') {
      return renderAmountInput('count', 'Count amount', count);
    }
    if (activeCategory === 'informal') {
      return (
        <div className="recipe-measurement-dimension">
          {renderAmountInput('informal', 'Informal amount', informal)}
          {renderPicklist('Informal unit', 'Unit', informalOptions, informal, 'informal')}
        </div>
      );
    }
    if (activeCategory === 'judgment') {
      return renderPicklist('Judgment phrase', 'Phrase', phraseOptions, judgment, 'unmeasured');
    }
    return null;
  }

  if (layout === 'desktop') {
    const desktopFields =
      activeCategory === 'units' ? (
        <div className="recipe-measurement-desktop-fields">
          <div className="recipe-measurement-desktop-pair">
            {renderAmountInput('volume', 'Volume amount', volume)}
            {renderUnitSelect('volume', 'Volume unit', volume)}
          </div>
          <span aria-hidden="true" className="recipe-measurement-slash">
            /
          </span>
          <div className="recipe-measurement-desktop-pair">
            {renderAmountInput('weight', 'Weight amount', weight)}
            {renderUnitSelect('weight', 'Weight unit', weight)}
          </div>
        </div>
      ) : activeCategory === 'count' ? (
        renderAmountInput('count', 'Count amount', count)
      ) : activeCategory === 'informal' ? (
        <div className="recipe-measurement-desktop-pair">
          {renderAmountInput('informal', 'Informal amount', informal)}
          {renderPicklist('Informal unit', 'Unit', informalOptions, informal, 'informal')}
        </div>
      ) : (
        renderPicklist('Judgment phrase', 'Phrase', phraseOptions, judgment, 'unmeasured')
      );

    return (
      <>
        <td className="recipe-ingredient-type-cell">
          {renderCategoryPicker()}
          {validationError && (
            <p className="recipe-measurement-error" id={errorId} role="alert">
              {validationError}
            </p>
          )}
        </td>
        <td
          className="recipe-ingredient-measurement-cell recipe-ingredient-amount-cell"
          ref={(element) => {
            fieldsContainerRef.current = element;
          }}
        >
          {desktopFields}
          {afterFields}
        </td>
      </>
    );
  }

  return (
    <fieldset
      aria-label={`Measurements for ingredient row ${rowNumber}`}
      className="recipe-measurement-editor"
      ref={(element) => {
        fieldsContainerRef.current = element;
      }}
    >
      <legend className="visually-hidden">Measurements for ingredient row {rowNumber}</legend>
      {renderCategoryPicker()}
      {renderMobileFields()}
      {afterFields}
      {validationError && (
        <p className="recipe-measurement-error" id={errorId} role="alert">
          {validationError}
        </p>
      )}
    </fieldset>
  );
}
