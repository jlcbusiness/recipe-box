'use client';

import { Fragment, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { RecipePicklistValue } from '../../lib/recipes/data';
import {
  type MeasurementDraft,
  type MeasurementType,
  serializeMeasurements,
  volumeUnits,
  weightUnits,
} from '../../lib/recipes/measurement-rules';

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
}: {
  label: string;
  prompt: string;
  options: MeasurementPicklistOption[];
  selectedId: string;
  className?: string;
  describedBy?: string;
  invalid?: boolean;
  onSelect: (valueId: string) => void;
}) {
  const listId = useId();
  const selectedValue = options.find((option) => option.id === selectedId);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [menuPosition, setMenuPosition] = useState<{
    left: number;
    top: number;
    width: number;
    maxHeight: number;
  } | null>(null);

  useLayoutEffect(() => {
    if (!isOpen) {
      return;
    }
    document.getElementById(`${listId}-${activeIndex}`)?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, isOpen, listId]);

  useLayoutEffect(() => {
    if (!isOpen) {
      return;
    }
    const positionMenu = () => {
      const bounds = triggerRef.current?.getBoundingClientRect();
      if (!bounds) {
        return;
      }
      const aboveSpace = Math.max(0, bounds.top - 12);
      const belowSpace = Math.max(0, window.innerHeight - bounds.bottom - 12);
      const idealHeight = Math.min(220, options.length * 40 + 8);
      const above = aboveSpace >= idealHeight || aboveSpace >= belowSpace;
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
  }, [isOpen, options.length]);

  function select(valueId: string) {
    onSelect(valueId);
    setIsOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <>
      <button
        aria-activedescendant={isOpen && options.length ? `${listId}-${activeIndex}` : undefined}
        aria-controls={isOpen ? listId : undefined}
        aria-describedby={describedBy}
        aria-expanded={isOpen}
        aria-label={label}
        aria-haspopup="listbox"
        aria-invalid={invalid || undefined}
        className={`ingredient-cell-input recipe-measurement-picklist-trigger ${className ?? ''}`}
        ref={triggerRef}
        role="combobox"
        type="button"
        onBlur={() => setIsOpen(false)}
        onClick={() => {
          setActiveIndex(
            Math.max(
              0,
              options.findIndex((option) => option.id === selectedId),
            ),
          );
          setIsOpen((open) => !open);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (!isOpen) {
              setActiveIndex(
                Math.max(
                  0,
                  options.findIndex((option) => option.id === selectedId),
                ),
              );
              setIsOpen(true);
              return;
            }
            const offset = event.key === 'ArrowDown' ? 1 : -1;
            setActiveIndex((index) => (index + offset + options.length) % options.length);
          } else if (event.key === 'Home' || event.key === 'End') {
            event.preventDefault();
            if (!isOpen) {
              setIsOpen(true);
            }
            setActiveIndex(event.key === 'Home' ? 0 : options.length - 1);
          } else if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            if (!isOpen) {
              setActiveIndex(
                Math.max(
                  0,
                  options.findIndex((option) => option.id === selectedId),
                ),
              );
              setIsOpen(true);
            } else if (options[activeIndex]) {
              select(options[activeIndex].id);
            }
          } else if (event.key === 'Escape') {
            event.preventDefault();
            setIsOpen(false);
          }
        }}
      >
        {selectedValue?.value ?? prompt}
      </button>
      {isOpen &&
        options.length > 0 &&
        createPortal(
          <div
            className="ingredient-cell-options"
            id={listId}
            role="listbox"
            style={menuPosition ?? undefined}
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
                  className={`ingredient-cell-option${index === activeIndex ? ' is-active' : ''}`}
                  id={`${listId}-${index}`}
                  role="option"
                  tabIndex={-1}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => select(option.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      select(option.id);
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
  validate,
  layout = 'mobile',
  onChange,
}: {
  rowNumber: number;
  measurements: MeasurementDraft[];
  picklists: RecipePicklistValue[];
  validate: boolean;
  layout?: 'desktop' | 'mobile';
  onChange: (measurements: MeasurementDraft[]) => void;
}) {
  const editorId = useId();
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

  function updateMeasurement(type: MeasurementType, update: Partial<MeasurementDraft>) {
    const currentCategory = categoryFor(measurements);
    const currentMeasurements =
      currentCategory === 'units'
        ? unitMeasurementTypes.map((type) => getMeasurement(measurements, type))
        : measurements;
    onChange(
      currentMeasurements.some((measurement) => measurement.type === type)
        ? currentMeasurements.map((measurement) =>
            measurement.type === type ? { ...measurement, ...update } : measurement,
          )
        : [...currentMeasurements, { ...createMeasurement(type), ...update }],
    );
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
    return (
      <label className="recipe-measurement-control">
        <span className="visually-hidden">
          {label}, row {rowNumber}
        </span>
        <input
          aria-describedby={describedBy}
          aria-invalid={Boolean(validationError) || undefined}
          autoComplete="off"
          className="recipe-measurement-quantity"
          inputMode="text"
          size={Math.max(2, measurement.quantity.length)}
          type="text"
          value={measurement.quantity}
          onChange={(event) => updateMeasurement(type, { quantity: event.target.value })}
        />
      </label>
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
        <td className="recipe-ingredient-measurement-cell recipe-ingredient-amount-cell">
          {desktopFields}
        </td>
      </>
    );
  }

  return (
    <fieldset
      aria-label={`Measurements for ingredient row ${rowNumber}`}
      className="recipe-measurement-editor"
    >
      <legend className="visually-hidden">Measurements for ingredient row {rowNumber}</legend>
      {renderCategoryPicker()}
      {renderMobileFields()}
      {validationError && (
        <p className="recipe-measurement-error" id={errorId} role="alert">
          {validationError}
        </p>
      )}
    </fieldset>
  );
}
